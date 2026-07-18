import path from 'node:path'
import { packageRoot, packageVersion, resolveProjectRoot } from './config/project-root.js'
import { installCursorMcp } from './install/cursor-mcp.js'
import {
  harnessStatus,
  installHarness,
  pruneHarness,
  SKILLS_BY_TYPE,
  type ProcesskitType,
} from './install/harness.js'
import { mergeExtractRegistry } from './install/extract-registry.js'
import { scopeUnifiedDiff, validateBusinessProcess, validateImpactReport } from './process/validate.js'
import { readFileSync } from 'node:fs'
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

  init --type=docs|fe|be [--target=cursor] [--project-root <path>] [--force] [--yes]
  status [--project-root <path>]
  prune [--project-root <path>] [--yes]    # dry-run by default
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

async function main(): Promise<void> {
  const command = process.argv[2]
  if (!command || command === 'help' || command === '--help') usage()
  if (command === 'version' || command === '--version') {
    console.log(`processkit ${packageVersion()}`)
    console.log(`packageRoot ${packageRoot()}`)
    return
  }
  if (command === 'init') {
    const type = (arg('--type') ?? 'docs') as ProcesskitType
    if (!['docs', 'fe', 'be'].includes(type)) throw new Error('--type must be docs | fe | be')
    const root = resolveProjectRoot(arg('--project-root'))
    const target = arg('--target') ?? 'cursor'
    if (target === 'cursor' || target === 'all') {
      const mcp = installCursorMcp(root)
      console.log(`${mcp.written ? 'wrote' : 'unchanged'}: ${mcp.path}`)
    }
    const harness = installHarness({ projectRoot: root, type, force: has('--force') })
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
