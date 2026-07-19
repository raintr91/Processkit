import path from 'node:path'
import os from 'node:os'
import { packageRoot, packageVersion, resolveProjectRoot } from './config/project-root.js'
import { uninstallCursorMcp } from './install/cursor-mcp.js'
import {
  detectAgents,
  installAgents,
  parseTargets,
  uninstallAgents,
  type AgentId,
} from './install/agents.js'
import { runInitWizard } from './install/wizard.js'
import {
  harnessStatus,
  installHarness,
  pruneHarness,
  SKILLS_BY_TYPE,
  uninstallHarness,
  type ProcesskitType,
} from './install/harness.js'
import { mergeExtractRegistry } from './install/extract-registry.js'
import { discoverInstalls, ledgerPath, readLedger, removeLedger } from './install/ledger.js'
import { ensureGitignoreEntries, generatedTargets } from './install/gitignore.js'
import { scopeUnifiedDiff, validateBusinessProcess, validateImpactReport } from './process/validate.js'
import { lstatSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { parse } from 'yaml'

function arg(name: string): string | undefined {
  const eq = process.argv.find((value) => value.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function has(name: string): boolean {
  return process.argv.includes(name)
}

function usage(): never {
  console.log(`processkit ${packageVersion()}

  init [--type=docs|fe|be] [--target=csv|auto|all] [--project-root <path>] [--force] [--yes]
       # no flags → TTY wizard: agents → lane (docs|fe|be); MCP always local at cwd
  status [--project-root <path>]
  prune [--project-root <path>] [--yes]    # dry-run by default
  deinit [--project-root <path>] [--yes]   # current repo harness + local MCP
  uninstall [--discover <dir>] [--yes]     # all repos + local/global MCP + CLI
  process-validate --file <json|yaml> [--project-root <path>]
  impact-validate --file <json|yaml> [--project-root <path>]
  diff-scope --file <unified.diff>
  version

Owned skills:
  docs: ${SKILLS_BY_TYPE.docs.map((id) => `/${id}`).join(' ')}
  fe/be: /business-impact-review
`)
  process.exit(1)
}

function loadFile(file: string, root?: string): unknown {
  const absolute = path.resolve(resolveProjectRoot(root), file)
  const body = readFileSync(absolute, 'utf8')
  return absolute.endsWith('.json') ? JSON.parse(body) : parse(body)
}

type UninstallScope = 'repo' | 'all-repos' | 'mcp-local' | 'mcp-global' | 'cli' | 'all'

const UNINSTALL_SCOPES: UninstallScope[] = [
  'repo',
  'all-repos',
  'mcp-local',
  'mcp-global',
  'cli',
  'all',
]

interface UninstallFlags {
  yes: boolean
  keepMcp: boolean
  projectRoot?: string
  discoverDir?: string
}

function cliLayout(): { installDir: string; binDir: string } {
  return {
    installDir: process.env.PROCESSKIT_INSTALL_DIR
      ? path.resolve(process.env.PROCESSKIT_INSTALL_DIR)
      : path.join(os.homedir(), '.processkit'),
    binDir: process.env.PROCESSKIT_BIN_DIR
      ? path.resolve(process.env.PROCESSKIT_BIN_DIR)
      : path.join(os.homedir(), '.local', 'bin'),
  }
}

function lexists(file: string): boolean {
  try {
    lstatSync(file)
    return true
  } catch {
    return false
  }
}

function realOrSelf(file: string): string {
  try {
    return realpathSync(file)
  } catch {
    return file
  }
}

function removeCli(dryRun: boolean): {
  removed: string[]
  wouldRemove: string[]
  skipped: string[]
} {
  const { installDir, binDir } = cliLayout()
  const removed: string[] = []
  const wouldRemove: string[] = []
  const skipped: string[] = []
  const cwd = realOrSelf(process.cwd())
  const targets = [
    path.join(binDir, 'processkit'),
    path.join(binDir, 'processkit-mcp'),
    path.join(binDir, 'processkit.cmd'),
    path.join(binDir, 'processkit-mcp.cmd'),
    installDir,
  ]
  for (const target of targets) {
    if (!lexists(target)) continue
    if (target === installDir && realOrSelf(target) === cwd) {
      skipped.push(`${target} (current working directory; remove manually)`)
      continue
    }
    if (dryRun) {
      wouldRemove.push(target)
      continue
    }
    try {
      rmSync(target, { recursive: true, force: true })
      removed.push(target)
    } catch (error) {
      skipped.push(`${target} (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  return { removed, wouldRemove, skipped }
}

function repoTargets(flags: UninstallFlags): string[] {
  const repos = new Set(readLedger())
  if (flags.discoverDir) {
    for (const repo of discoverInstalls(flags.discoverDir)) repos.add(repo)
  }
  return [...repos]
}

function runUninstallScope(scope: UninstallScope, flags: UninstallFlags): void {
  const root = path.resolve(flags.projectRoot ?? process.cwd())
  const doHarness = (projectRoot: string): void => {
    console.log(`repo: ${projectRoot}`)
    const result = uninstallHarness({ projectRoot, yes: flags.yes })
    for (const file of result.wouldDelete) console.log(`  would delete: ${file}`)
    for (const file of result.deleted) console.log(`  deleted: ${file}`)
    for (const file of result.preservedModified) console.log(`  preserve modified: ${file}`)
    for (const file of result.missing) console.log(`  already missing: ${file}`)
    if (result.registry) console.log(`  registry: ${result.registry}`)
    if (result.manifestRemoved) console.log(`  manifest removed: ${result.manifest}`)
    for (const pattern of result.gitignoreRemoved) {
      console.log(`  ${flags.yes ? 'removed' : 'would remove'} gitignore entry: ${pattern}`)
    }
    for (const pattern of result.gitignoreKept) {
      console.log(`  kept shared gitignore entry: ${pattern}`)
    }
  }
  const doMcp = (location: 'local' | 'global', projectRoot?: string): void => {
    if (location === 'local') {
      // Unwire every agent config written at init (cursor, claude, codex, …).
      const agents = uninstallAgents({ projectRoot, yes: flags.yes })
      if (!agents.removed.length) {
        console.log('  mcp (local): no processkit entry')
        return
      }
      for (const entry of agents.removed) {
        console.log(`  ${flags.yes ? 'unwired' : 'would unwire'} (local): ${entry}`)
      }
      return
    }
    const result = uninstallCursorMcp({ location: 'global', yes: flags.yes })
    if (result.absent) {
      console.log('  mcp (global): no processkit entry')
    } else {
      console.log(`  ${flags.yes ? 'unwired' : 'would unwire'} (global): ${result.path}`)
    }
  }
  const doCli = (): void => {
    const result = removeCli(!flags.yes)
    for (const file of result.wouldRemove) console.log(`  would remove: ${file}`)
    for (const file of result.removed) console.log(`  removed: ${file}`)
    for (const file of result.skipped) console.log(`  skip: ${file}`)
  }

  switch (scope) {
    case 'repo':
      doHarness(root)
      if (!flags.keepMcp) doMcp('local', root)
      break
    case 'all-repos': {
      const repos = repoTargets(flags)
      if (!repos.length) console.log('  (no registered repos; try --discover <dir>)')
      for (const repo of repos) {
        doHarness(repo)
        if (!flags.keepMcp) doMcp('local', repo)
      }
      break
    }
    case 'mcp-local':
      doMcp('local', root)
      break
    case 'mcp-global':
      doMcp('global')
      break
    case 'cli':
      doCli()
      break
    case 'all': {
      for (const repo of repoTargets(flags)) {
        doHarness(repo)
        doMcp('local', repo)
      }
      doMcp('global')
      doCli()
      if (flags.yes) {
        if (removeLedger()) console.log(`  ledger removed: ${ledgerPath()}`)
      } else {
        console.log(`  would remove ledger: ${ledgerPath()}`)
      }
      break
    }
  }
}

async function runUninstall(defaultScope: 'repo' | 'all'): Promise<void> {
  const flags: UninstallFlags = {
    yes: has('--yes'),
    keepMcp: has('--keep-mcp'),
    projectRoot: arg('--project-root'),
    discoverDir: arg('--discover'),
  }
  let scope: UninstallScope = defaultScope
  if (defaultScope === 'all') {
    const scopeArg = arg('--scope')
    if (scopeArg) {
      if (!UNINSTALL_SCOPES.includes(scopeArg as UninstallScope)) {
        throw new Error(`--scope must be one of: ${UNINSTALL_SCOPES.join(', ')}`)
      }
      scope = scopeArg as UninstallScope
    }
  }

  const interactive = process.stdin.isTTY && process.stdout.isTTY && !flags.yes
  if (interactive) {
    console.log(`\nPreview (${scope}):`)
    runUninstallScope(scope, { ...flags, yes: false })
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await prompt.question(
      defaultScope === 'repo'
        ? '\nApply processkit deinit for this repo? [y/N] '
        : '\nApply global processkit uninstall (all repos + MCP + CLI)? [y/N] ',
    )
    prompt.close()
    if (!/^y(?:es)?$/i.test(answer.trim())) {
      console.log('Cancelled.')
      return
    }
    console.log(`\nApplying (${scope}):`)
    runUninstallScope(scope, { ...flags, yes: true })
    console.log(`\nUninstalled (${scope}).`)
    return
  }

  runUninstallScope(scope, flags)
  console.log(
    flags.yes
      ? `\nUninstalled (${scope}).`
      : `\nDry-run (${scope}) — pass --yes to apply.`,
  )
}

async function main(): Promise<void> {
  const command = process.argv[2]
  if (!command || command === 'help' || command === '--help') usage()
  if (command === 'version' || command === '--version') {
    console.log(`processkit ${packageVersion()}`)
    console.log(`packageRoot ${packageRoot()}`)
    return
  }
  if (command === 'init') {
    const root = resolveProjectRoot(arg('--project-root'))
    const typeFlag = arg('--type') as ProcesskitType | undefined
    if (typeFlag && !['docs', 'fe', 'be'].includes(typeFlag)) {
      throw new Error('--type must be docs | fe | be')
    }
    const targetFlag = arg('--target')
    const interactive =
      !has('--yes') &&
      !typeFlag &&
      !targetFlag &&
      Boolean(process.stdin.isTTY && process.stdout.isTTY)

    let agents: AgentId[]
    let type: ProcesskitType
    if (interactive) {
      // Wizard order is fixed: agents → lane; Processkit has no tech step.
      const wizard = await runInitWizard({ cwd: root })
      agents = wizard.agents
      type = wizard.type
    } else {
      agents = parseTargets(targetFlag ?? 'auto', detectAgents(root))
      type = typeFlag ?? 'docs'
    }

    const mcp = installAgents({ projectRoot: root, agents })
    console.log(`Wired processkit → ${mcp.targets.join(', ') || '(none)'} (local at ${root})`)
    for (const written of mcp.written) console.log(`  ${written.agent}: ${written.path}`)
    for (const skip of mcp.skipped) console.log(`  skip: ${skip}`)
    if (!mcp.targets.length) {
      // Empty init is allowed: the harness still installs. Tell the member how to
      // wire agents later instead of pulling anything implicitly.
      console.log(
        '  no agents wired — re-run `processkit init` (or pass --target=<agent>) later to add MCP',
      )
    }

    // Ignore entries derive from the local targets this init actually wrote.
    const ignoreEntries = generatedTargets(root, mcp.written.map((written) => written.path))
    const gitignore = ensureGitignoreEntries(root, ignoreEntries.map((entry) => entry.pattern))
    for (const added of gitignore.added) console.log(`  gitignore: added ${added}`)
    if (!gitignore.changed) console.log(`  gitignore: unchanged ${gitignore.file}`)

    const harness = installHarness({
      projectRoot: root,
      type,
      force: has('--force'),
      gitignoreEntries: ignoreEntries,
    })
    for (const file of harness.written) console.log(`  wrote: ${file}`)
    for (const file of harness.unchanged) console.log(`  unchanged: ${file}`)
    for (const file of harness.conflicts) console.log(`  conflict: ${file}`)
    for (const file of harness.stale) console.log(`  stale: ${file} (run processkit prune)`)
    if (type === 'docs') console.log(`updated: ${mergeExtractRegistry(root)}`)
    return
  }
  if (command === 'status') {
    const status = harnessStatus(arg('--project-root'))
    console.log(JSON.stringify(status, null, 2))
    if (status.compat === 'fail') process.exit(1)
    return
  }
  if (command === 'prune') {
    const yes = has('--yes')
    const result = pruneHarness({ projectRoot: arg('--project-root'), yes })
    for (const file of result.removable) {
      console.log(`  ${yes ? 'removed' : 'would remove'}: ${file}`)
    }
    for (const file of result.modified) console.log(`  keep modified: ${file}`)
    if (!yes && result.removable.length) {
      console.log('Dry-run only. Re-run with --yes to delete unmodified stale assets.')
    }
    console.log(
      `Prune: ${result.removed.length} removed, ${result.removable.length} removable, ${result.modified.length} modified kept`,
    )
    return
  }
  if (command === 'deinit') {
    await runUninstall('repo')
    return
  }
  if (command === 'uninstall') {
    await runUninstall('all')
    return
  }
  if (command === 'process-validate') {
    const file = arg('--file')
    if (!file) usage()
    const result = validateBusinessProcess(loadFile(file, arg('--project-root')) as never)
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }
  if (command === 'impact-validate') {
    const file = arg('--file')
    if (!file) usage()
    const result = validateImpactReport(
      loadFile(file, arg('--project-root')) as Record<string, unknown>,
    )
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }
  if (command === 'diff-scope') {
    const file = arg('--file')
    if (!file) usage()
    console.log(JSON.stringify(scopeUnifiedDiff(readFileSync(path.resolve(file), 'utf8')), null, 2))
    return
  }
  usage()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
