import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  scopeUnifiedDiff,
  validateBusinessProcess,
  validateImpactReport,
} from '../dist/process/validate.js'
import {
  harnessStatus,
  installHarness,
  pruneHarness,
  uninstallHarness,
} from '../dist/install/harness.js'
import { installCursorMcp, uninstallCursorMcp } from '../dist/install/cursor-mcp.js'
import {
  agentConfigPath,
  installAgents,
  uninstallAgents,
} from '../dist/install/agents.js'
import { runInitWizard } from '../dist/install/wizard.js'
import {
  canonicalGitignorePattern,
  ensureGitignoreEntries,
  generatedTargets,
  removeGitignoreEntries,
} from '../dist/install/gitignore.js'
import { mergeExtractRegistry } from '../dist/install/extract-registry.js'
import {
  discoverInstalls,
  ledgerPath,
  readLedger,
} from '../dist/install/ledger.js'
import {
  MissingOptionalEventEmitter,
  ReadMeasurement,
  validateMissingOptionalEvent,
} from '../dist/optional/fallback-evidence.js'

// Lifecycle tests must never write the member's real XDG state ledger.
process.env.PROCESSKIT_STATE_DIR = mkdtempSync(path.join(os.tmpdir(), 'processkit-state-'))

test('business process validates evidence and references', () => {
  const result = validateBusinessProcess({
    title: 'Checkout',
    entrypoints: ['page'],
    steps: [
      {
        id: 'page',
        type: 'page',
        system: 'portal',
        route: '/checkout',
        evidence: 'src/pages/checkout.vue:10',
        next: ['api'],
      },
      {
        id: 'api',
        type: 'api',
        system: 'api',
        route: 'POST /checkout',
        evidence: 'routes/api.php:20',
      },
    ],
  })
  assert.equal(result.ok, true)
  assert.equal(result.summary.steps, 2)
})

test('business process rejects invented/missing hops', () => {
  const result = validateBusinessProcess({
    steps: [{ id: 'a', type: 'api', next: ['missing'] }],
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes('evidence')))
  assert.ok(result.errors.some((error) => error.includes('missing step')))
})

test('impact report requires evidence, impact and verify', () => {
  const result = validateImpactReport({
    summary: 'unsafe',
    changedSymbols: ['Controller.update'],
    horizontalCallers: [],
    verticalPaths: [],
    findings: [
      {
        severity: 'high',
        class: 'authz-idor',
        evidence: 'Controller.php:10',
        impact: 'cross-tenant update',
        verify: 'foreign tenant test',
      },
    ],
    residualRisks: [],
    testPlan: ['foreign tenant denied'],
  })
  assert.equal(result.ok, true)
  assert.equal(result.summary.severe, 1)
})

test('diff scope extracts files, symbols and risk hints', () => {
  const result = scopeUnifiedDiff(`diff --git a/a.php b/a.php
+++ b/a.php
+function updateTenant($request) {
+  dispatch(new SyncJob($request->all()));
+}`)
  assert.deepEqual(result.files, ['a.php'])
  assert.ok(result.candidateSymbols.includes('updateTenant'))
  assert.ok(result.riskHints.includes('authz-idor'))
  assert.ok(result.riskHints.includes('async-context'))
})

test('docs init assets and portable maps', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-docs-'))
  const harness = installHarness({ projectRoot: root, type: 'docs' })
  assert.equal(harness.conflicts.length, 0)
  assert.ok(harness.written.some((file) => file.includes('business-process-trace')))
  assert.ok(
    harness.written.some((file) =>
      file.endsWith(path.join('.cursor', 'schemas', 'processkit', 'missing-optional-event.schema.json')),
    ),
  )
  assert.ok(
    !harness.written.some((file) =>
      file.endsWith(path.join('.cursor', 'schemas', 'missing-optional-event.schema.json')),
    ),
  )
  // Processkit never writes Platform DNA-owned project maps.
  assert.equal(existsSync(path.join(root, 'platform-repos.json')), false)
  assert.equal(existsSync(path.join(root, 'legacy-repos.json')), false)
})

test('FE profile syncs impact review only', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-fe-'))
  const harness = installHarness({ projectRoot: root, type: 'fe' })
  assert.ok(harness.written.some((file) => file.includes('business-impact-review')))
  assert.ok(!harness.written.some((file) => file.includes('business-process-trace')))
  assert.equal(existsSync(path.join(root, 'platform-repos.json')), false)
})

test('profile switches mark only removed managed assets stale', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-switch-'))
  installHarness({ projectRoot: root, type: 'docs' })
  const result = installHarness({ projectRoot: root, type: 'fe' })
  const impact = path.join(root, '.cursor/skills/business-impact-review/SKILL.md')

  assert.ok(result.stale.length > 0)
  assert.ok(result.stale.every((file) => file !== impact))
  assert.ok(result.stale.some((file) => file.includes('business-process-trace')))

  const status = harnessStatus(root)
  assert.equal(status.type, 'fe')
  assert.equal(status.compat, 'ok')
  assert.ok(status.healthy.includes(impact))
  assert.deepEqual(status.stale.sort(), result.stale.sort())
})

test('prune is dry-run by default and deletes only hash-matching stale files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-prune-'))
  installHarness({ projectRoot: root, type: 'docs' })
  const switched = installHarness({ projectRoot: root, type: 'be' })
  const modified = switched.stale.find((file) => file.includes('business-process-trace'))
  assert.ok(modified)
  writeFileSync(modified, `${readFileSync(modified, 'utf8')}\ncustomized\n`)

  const platform = path.join(root, 'platform-repos.json')
  const registry = path.join(root, '.cursor/extracts/extract-registry.json')
  const unmanaged = path.join(root, '.cursor/skills/user-owned/SKILL.md')
  mkdirSync(path.dirname(unmanaged), { recursive: true })
  writeFileSync(platform, 'keep platform map\n')
  writeFileSync(registry, 'keep shared registry\n')
  writeFileSync(unmanaged, 'keep unmanaged\n')
  const manifestFile = path.join(root, '.processkit/install-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  for (const [key, content] of [
    ['platform-repos.json', 'keep platform map\n'],
    ['.cursor/extracts/extract-registry.json', 'keep shared registry\n'],
  ]) {
    manifest.files[key] = {
      source: 'must-never-be-pruned',
      sha256: createHash('sha256').update(content).digest('hex'),
      stale: true,
    }
  }
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)

  const dryRun = pruneHarness({ projectRoot: root })
  assert.equal(dryRun.removed.length, 0)
  assert.ok(dryRun.modified.includes(modified))
  assert.ok(dryRun.removable.length > 0)
  assert.ok(dryRun.removable.every(existsSync))
  assert.ok(dryRun.removable.every((file) => file !== platform && file !== registry))

  const pruned = pruneHarness({ projectRoot: root, yes: true })
  assert.ok(pruned.removed.length > 0)
  assert.equal(existsSync(modified), true)
  assert.equal(readFileSync(platform, 'utf8'), 'keep platform map\n')
  assert.equal(readFileSync(registry, 'utf8'), 'keep shared registry\n')
  assert.equal(readFileSync(unmanaged, 'utf8'), 'keep unmanaged\n')
  assert.ok(pruned.removed.every((file) => !existsSync(file)))
})

test('uninstall is dry-run by default and preserves modified managed files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-uninstall-'))
  const installed = installHarness({ projectRoot: root, type: 'docs' })
  const modified = installed.written.find((file) => file.endsWith('SKILL.md'))
  assert.ok(modified)
  writeFileSync(modified, `${readFileSync(modified, 'utf8')}\nmember change\n`)

  const dryRun = uninstallHarness({ projectRoot: root })
  assert.equal(dryRun.dryRun, true)
  assert.equal(dryRun.deleted.length, 0)
  assert.ok(dryRun.wouldDelete.length > 0)
  assert.equal(existsSync(path.join(root, '.processkit/install-manifest.json')), true)

  const applied = uninstallHarness({ projectRoot: root, yes: true })
  assert.equal(applied.manifestRemoved, true)
  assert.ok(applied.preservedModified.includes(modified))
  assert.equal(existsSync(modified), true)
  assert.equal(existsSync(path.join(root, '.processkit/install-manifest.json')), false)
  for (const file of applied.deleted) assert.equal(existsSync(file), false)
})

test('uninstall safely unmerges only Processkit shared registry bundles', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-registry-'))
  installHarness({ projectRoot: root, type: 'docs' })
  const registry = mergeExtractRegistry(root)
  const document = JSON.parse(readFileSync(registry, 'utf8'))
  document.bundles['other-toolkit'] = ['other.md']
  document.memberSetting = true
  writeFileSync(registry, `${JSON.stringify(document, null, 2)}\n`)

  const result = uninstallHarness({ projectRoot: root, yes: true })
  assert.match(result.registry, /removed 2 Processkit bundle key/)
  assert.equal(existsSync(registry), true)
  const after = JSON.parse(readFileSync(registry, 'utf8'))
  assert.deepEqual(after.bundles, { 'other-toolkit': ['other.md'] })
  assert.equal(after.memberSetting, true)
})

test('install ledger records, discovers, and forgets harness destinations', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-ledger-'))
  const nested = path.join(root, 'nested', 'destination')
  mkdirSync(nested, { recursive: true })
  installHarness({ projectRoot: nested, type: 'fe' })

  assert.ok(readLedger().includes(nested))
  assert.ok(discoverInstalls(root).includes(nested))
  uninstallHarness({ projectRoot: nested, yes: true })
  assert.equal(readLedger().includes(nested), false)
  const persisted = JSON.parse(readFileSync(ledgerPath(), 'utf8'))
  assert.equal(persisted.repos.includes(nested), false)
})

test('MCP uninstall removes only Processkit wiring', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-unwire-'))
  mkdirSync(path.join(root, '.cursor'), { recursive: true })
  const file = path.join(root, '.cursor/mcp.json')
  writeFileSync(
    file,
    `${JSON.stringify({
      mcpServers: {
        processkit: { command: 'processkit-mcp' },
        keep: { command: 'keep-mcp' },
      },
      memberSetting: true,
    }, null, 2)}\n`,
  )

  const dryRun = uninstallCursorMcp({ projectRoot: root })
  assert.equal(dryRun.removed, true)
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).mcpServers.processkit)

  uninstallCursorMcp({ projectRoot: root, yes: true })
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal('processkit' in after.mcpServers, false)
  assert.deepEqual(after.mcpServers.keep, { command: 'keep-mcp' })
  assert.equal(after.memberSetting, true)
})

test('manifest path containment blocks writes and deletion outside project root', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-contained-'))
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.txt`)
  writeFileSync(outside, 'outside\n')
  mkdirSync(path.join(root, '.processkit'), { recursive: true })
  writeFileSync(
    path.join(root, '.processkit/install-manifest.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      package: '@platform/processkit',
      packageVersion: '0.2.0',
      type: 'docs',
      toolApi: 1,
      harnessApi: 1,
      installedAt: new Date().toISOString(),
      files: {
        [`../${path.basename(outside)}`]: {
          source: 'harness/docs/skills/example/SKILL.md',
          sha256: '0'.repeat(64),
          stale: true,
        },
      },
    })}\n`,
  )

  assert.throws(() => pruneHarness({ projectRoot: root, yes: true }), /escapes project root/)
  assert.throws(() => installHarness({ projectRoot: root, type: 'fe' }), /escapes project root/)
  assert.equal(readFileSync(outside, 'utf8'), 'outside\n')
  assert.equal(existsSync(path.join(root, '.cursor')), false)
})

test('manifest containment rejects managed paths through outside symlinks', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-symlink-'))
  const outside = mkdtempSync(path.join(os.tmpdir(), 'processkit-symlink-outside-'))
  mkdirSync(path.join(root, '.cursor'), { recursive: true })
  symlinkSync(outside, path.join(root, '.cursor/skills'))
  mkdirSync(path.join(root, '.processkit'), { recursive: true })
  writeFileSync(
    path.join(root, '.processkit/install-manifest.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      package: '@platform/processkit',
      packageVersion: '0.2.0',
      type: 'docs',
      toolApi: 1,
      harnessApi: 1,
      installedAt: new Date().toISOString(),
      files: {
        '.cursor/skills/escaped/SKILL.md': {
          source: 'harness/docs/skills/escaped/SKILL.md',
          sha256: '0'.repeat(64),
          stale: true,
        },
      },
    })}\n`,
  )

  assert.throws(
    () => pruneHarness({ projectRoot: root, yes: true }),
    /escapes project root through a symlink/,
  )
  assert.throws(
    () => installHarness({ projectRoot: root, type: 'docs', force: true }),
    /escapes project root through a symlink/,
  )
  assert.deepEqual(readdirSync(outside), [])
})

test('incompatible manifest API fails before harness writes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-compat-'))
  installHarness({ projectRoot: root, type: 'docs' })
  const manifestFile = path.join(root, '.processkit/install-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  manifest.harnessApi = 999
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  const before = readFileSync(
    path.join(root, '.cursor/skills/business-impact-review/SKILL.md'),
    'utf8',
  )

  assert.equal(harnessStatus(root).compat, 'fail')
  assert.throws(
    () => installHarness({ projectRoot: root, type: 'fe', force: true }),
    /Unsupported Processkit install manifest API/,
  )
  assert.throws(
    () => pruneHarness({ projectRoot: root, yes: true }),
    /Unsupported Processkit install manifest API/,
  )
  assert.equal(
    readFileSync(path.join(root, '.cursor/skills/business-impact-review/SKILL.md'), 'utf8'),
    before,
  )
})

test('CLI status and prune require --yes for deletion', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-cli-'))
  installHarness({ projectRoot: root, type: 'docs' })
  installHarness({ projectRoot: root, type: 'fe' })
  const cli = path.resolve('bin/processkit.mjs')
  const run = (args) =>
    spawnSync(process.execPath, [cli, ...args, '--project-root', root], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

  const status = run(['status'])
  assert.equal(status.status, 0, status.stderr)
  assert.equal(JSON.parse(status.stdout).type, 'fe')

  const dryRun = run(['prune'])
  assert.equal(dryRun.status, 0, dryRun.stderr)
  assert.match(dryRun.stdout, /would remove|Dry-run only/)
  assert.ok(harnessStatus(root).stale.length > 0)

  const deleteRun = run(['prune', '--yes'])
  assert.equal(deleteRun.status, 0, deleteRun.stderr)
  assert.match(deleteRun.stdout, /removed:/)
  assert.equal(harnessStatus(root).stale.length, 0)
})

test('CLI init with no agents still installs harness and prints add-later hint', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-empty-'))
  const cli = path.resolve('bin/processkit.mjs')
  const init = spawnSync(
    process.execPath,
    [cli, 'init', '--type=docs', '--target=none', '--project-root', root, '--yes'],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  )
  assert.equal(init.status, 0, init.stderr)
  // No agent selected → nothing wired, but the member is told how to add later.
  assert.match(init.stdout, /→ \(none\)/)
  assert.match(init.stdout, /no agents wired/)
  assert.match(init.stdout, /re-run `processkit init`/)
  // Harness lands regardless of the empty agent set.
  assert.equal(harnessStatus(root).type, 'docs')
  assert.ok(existsSync(path.join(root, '.cursor')))
  // No MCP config is written when no agent is chosen.
  assert.equal(existsSync(path.join(root, '.cursor', 'mcp.json')), false)
  // Only the exclusively-owned + shared harness dirs are ignored.
  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.match(gitignore, /\/\.processkit\//)
  assert.match(gitignore, /\/\.cursor\//)
})

test('CLI deinit is repo-local and uninstall defaults to global all', () => {
  const cli = path.resolve('bin/processkit.mjs')
  const home = mkdtempSync(path.join(os.tmpdir(), 'processkit-home-'))
  const state = mkdtempSync(path.join(os.tmpdir(), 'processkit-cli-state-'))
  const installDir = path.join(home, '.processkit')
  const binDir = path.join(home, '.local', 'bin')
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-cli-lifecycle-'))
  const env = {
    ...process.env,
    HOME: home,
    PROCESSKIT_STATE_DIR: state,
    PROCESSKIT_INSTALL_DIR: installDir,
    PROCESSKIT_BIN_DIR: binDir,
  }

  const init = spawnSync(
    process.execPath,
    [cli, 'init', '--type=docs', '--project-root', root, '--yes'],
    { encoding: 'utf8', env },
  )
  assert.equal(init.status, 0, init.stderr)
  const deinit = spawnSync(
    process.execPath,
    [cli, 'deinit', '--project-root', root, '--yes'],
    { encoding: 'utf8', env },
  )
  assert.equal(deinit.status, 0, deinit.stderr)
  assert.match(deinit.stdout, /Uninstalled \(repo\)/)
  assert.equal(existsSync(path.join(root, '.processkit/install-manifest.json')), false)
  const localMcp = JSON.parse(readFileSync(path.join(root, '.cursor/mcp.json'), 'utf8'))
  assert.equal('processkit' in localMcp.mcpServers, false)

  const second = mkdtempSync(path.join(os.tmpdir(), 'processkit-cli-global-'))
  const secondInit = spawnSync(
    process.execPath,
    [cli, 'init', '--type=fe', '--project-root', second, '--yes'],
    { encoding: 'utf8', env },
  )
  assert.equal(secondInit.status, 0, secondInit.stderr)
  mkdirSync(path.join(home, '.cursor'), { recursive: true })
  writeFileSync(
    path.join(home, '.cursor/mcp.json'),
    `${JSON.stringify({
      mcpServers: {
        processkit: { command: 'processkit-mcp' },
        keep: { command: 'keep' },
      },
    }, null, 2)}\n`,
  )
  mkdirSync(installDir, { recursive: true })
  mkdirSync(binDir, { recursive: true })
  writeFileSync(path.join(installDir, 'marker'), 'installed\n')
  writeFileSync(path.join(binDir, 'processkit'), 'shim\n')
  writeFileSync(path.join(binDir, 'processkit-mcp'), 'shim\n')

  const preview = spawnSync(process.execPath, [cli, 'uninstall'], {
    encoding: 'utf8',
    env,
  })
  assert.equal(preview.status, 0, preview.stderr)
  assert.match(preview.stdout, /Dry-run \(all\)/)
  assert.equal(existsSync(installDir), true)
  assert.equal(existsSync(path.join(second, '.processkit/install-manifest.json')), true)

  const uninstall = spawnSync(process.execPath, [cli, 'uninstall', '--yes'], {
    encoding: 'utf8',
    env,
  })
  assert.equal(uninstall.status, 0, uninstall.stderr)
  assert.match(uninstall.stdout, /Uninstalled \(all\)/)
  assert.equal(existsSync(path.join(second, '.processkit/install-manifest.json')), false)
  assert.equal(existsSync(installDir), false)
  assert.equal(existsSync(path.join(binDir, 'processkit')), false)
  assert.equal(existsSync(path.join(state, 'installs.json')), false)
  const globalMcp = JSON.parse(readFileSync(path.join(home, '.cursor/mcp.json'), 'utf8'))
  assert.equal('processkit' in globalMcp.mcpServers, false)
  assert.deepEqual(globalMcp.mcpServers.keep, { command: 'keep' })
  rmSync(home, { recursive: true, force: true })
})

test('init wizard asks agents first (detected pre-checked), then lane, no tech step', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-wizard-'))
  mkdirSync(path.join(root, '.cursor'), { recursive: true })
  const calls = []

  const result = await runInitWizard({
    cwd: root,
    prompts: {
      checkbox: async (opts) => {
        calls.push('agents')
        assert.match(opts.message, /agents/i)
        const cursor = opts.choices.find((choice) => choice.value === 'cursor')
        assert.ok(cursor, 'cursor must be offered')
        assert.equal(cursor.checked, true, 'detected agent must be pre-checked')
        assert.match(cursor.name, /detected/)
        return ['cursor', 'codex']
      },
      select: async (opts) => {
        calls.push('lane')
        assert.deepEqual(
          opts.choices.map((choice) => choice.value),
          ['docs', 'fe', 'be'],
        )
        return 'be'
      },
    },
  })

  assert.deepEqual(calls, ['agents', 'lane'], 'wizard order must be agents → lane')
  assert.deepEqual(result, { agents: ['cursor', 'codex'], type: 'be' })
})

test('installAgents writes project-local MCP configs for every selected agent', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-agents-'))
  const agents = ['cursor', 'claude', 'codex', 'opencode', 'hermes', 'antigravity']
  const result = installAgents({ projectRoot: root, agents })
  assert.deepEqual(result.targets, agents)
  assert.equal(result.skipped.length, 0)

  for (const agent of agents) {
    const file = agentConfigPath(agent, root)
    assert.ok(file.startsWith(root), `${agent} config must live under the repo`)
    assert.ok(existsSync(file), `${agent} config must be written`)
  }

  const cursor = JSON.parse(readFileSync(path.join(root, '.cursor', 'mcp.json'), 'utf8'))
  assert.equal(cursor.mcpServers.processkit.env.PROCESSKIT_ROOT, root)
  const codex = readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8')
  assert.match(codex, /\[mcp_servers\.processkit\]/)
  const claudePerms = JSON.parse(
    readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'),
  )
  assert.ok(claudePerms.permissions.allow.includes('mcp__processkit__*'))
})

test('uninstallAgents unwires every agent written at init, dry-run first', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-unwire-agents-'))
  const agents = ['cursor', 'claude', 'codex', 'hermes']
  installAgents({ projectRoot: root, agents })

  const dryRun = uninstallAgents({ projectRoot: root })
  assert.equal(dryRun.dryRun, true)
  assert.equal(
    dryRun.removed.filter((entry) => !entry.includes('(permissions)')).length,
    agents.length,
  )
  for (const agent of agents) {
    assert.ok(existsSync(agentConfigPath(agent, root)), 'dry-run must not delete entries')
  }

  const applied = uninstallAgents({ projectRoot: root, yes: true })
  assert.equal(applied.dryRun, false)
  const cursor = JSON.parse(readFileSync(path.join(root, '.cursor', 'mcp.json'), 'utf8'))
  assert.equal('processkit' in cursor.mcpServers, false)
  assert.doesNotMatch(
    readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8'),
    /mcp_servers\.processkit/,
  )
  assert.doesNotMatch(
    readFileSync(path.join(root, '.hermes', 'config.yaml'), 'utf8'),
    /processkit/,
  )
  const claudePerms = JSON.parse(
    readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'),
  )
  assert.equal(claudePerms.permissions.allow.includes('mcp__processkit__*'), false)

  const again = uninstallAgents({ projectRoot: root, yes: true })
  assert.equal(again.removed.length, 0)
})

test('CLI init wires multiple agents locally and deinit unwires them all', () => {
  const cli = path.resolve('bin/processkit.mjs')
  const home = mkdtempSync(path.join(os.tmpdir(), 'processkit-multi-home-'))
  const state = mkdtempSync(path.join(os.tmpdir(), 'processkit-multi-state-'))
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-multi-root-'))
  const env = { ...process.env, HOME: home, PROCESSKIT_STATE_DIR: state }

  const init = spawnSync(
    process.execPath,
    [cli, 'init', '--type=fe', '--target=cursor,codex,claude', '--project-root', root, '--yes'],
    { encoding: 'utf8', env },
  )
  assert.equal(init.status, 0, init.stderr)
  assert.ok(existsSync(path.join(root, '.cursor', 'mcp.json')))
  assert.ok(existsSync(path.join(root, '.codex', 'config.toml')))
  assert.ok(existsSync(path.join(root, '.claude.json')))
  assert.ok(existsSync(path.join(root, '.processkit', 'install-manifest.json')))

  const deinit = spawnSync(
    process.execPath,
    [cli, 'deinit', '--project-root', root, '--yes'],
    { encoding: 'utf8', env },
  )
  assert.equal(deinit.status, 0, deinit.stderr)
  const cursor = JSON.parse(readFileSync(path.join(root, '.cursor', 'mcp.json'), 'utf8'))
  assert.equal('processkit' in cursor.mcpServers, false)
  assert.doesNotMatch(
    readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8'),
    /mcp_servers\.processkit/,
  )
  const claude = JSON.parse(readFileSync(path.join(root, '.claude.json'), 'utf8'))
  assert.equal('processkit' in claude.mcpServers, false)
})

test('gitignore merge is idempotent, equivalence-aware, and EOL-preserving', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-gitignore-'))

  // Missing file is created.
  const first = ensureGitignoreEntries(root, ['/.processkit/', '/.cursor/'])
  assert.equal(first.changed, true)
  assert.deepEqual(first.added, ['/.processkit/', '/.cursor/'])

  // Double init adds nothing.
  const second = ensureGitignoreEntries(root, ['/.processkit/', '/.cursor/'])
  assert.equal(second.changed, false)
  assert.deepEqual(second.added, [])

  // Equivalent member-authored patterns are recognized (.cursor/ == /.cursor/).
  const crlf = mkdtempSync(path.join(os.tmpdir(), 'processkit-gitignore-crlf-'))
  writeFileSync(path.join(crlf, '.gitignore'), 'node_modules/\r\n.cursor/\r\n')
  const merged = ensureGitignoreEntries(crlf, ['/.cursor/', '/.processkit/'])
  assert.deepEqual(merged.added, ['/.processkit/'])
  const content = readFileSync(path.join(crlf, '.gitignore'), 'utf8')
  assert.equal(content, 'node_modules/\r\n.cursor/\r\n/.processkit/\r\n')

  // Removal drops only the requested patterns, preserving member lines + EOL.
  const removed = removeGitignoreEntries(crlf, ['/.processkit/'])
  assert.deepEqual(removed.removed, ['/.processkit/'])
  assert.equal(readFileSync(path.join(crlf, '.gitignore'), 'utf8'), 'node_modules/\r\n.cursor/\r\n')
  assert.equal(canonicalGitignorePattern('/.cursor/'), canonicalGitignorePattern('.cursor'))
})

test('generatedTargets derives entries from actual writes only', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-targets-'))
  const written = [
    path.join(root, '.cursor', 'mcp.json'),
    path.join(root, '.claude.json'),
    `${path.join(root, '.claude', 'settings.json')} (permissions)`,
    path.join(root, '.gemini', 'settings.json'),
    path.join(root, '.gemini', 'config', 'mcp_config.json'),
    path.join(root, 'opencode.jsonc'),
    path.join(os.homedir(), '.codex', 'config.toml'),
  ]
  const entries = generatedTargets(root, written)
  const patterns = entries.map((entry) => entry.pattern)

  assert.deepEqual(patterns, [
    '/.cursor/',
    '/.processkit/',
    '/.claude.json',
    '/.claude/',
    '/.gemini/',
    '/opencode.jsonc',
  ])
  // Gemini + Antigravity collapse into one /.gemini/; global paths are excluded.
  assert.equal(patterns.filter((pattern) => pattern === '/.gemini/').length, 1)
  assert.ok(!patterns.some((pattern) => pattern.includes('codex')))
  // Only opencode.jsonc (actually written) is ignored, not opencode.json.
  assert.ok(!patterns.includes('/opencode.json'))
  // .processkit/ is the only exclusive entry; everything else is shared.
  for (const entry of entries) {
    assert.equal(Boolean(entry.shared), entry.pattern !== '/.processkit/')
  }
})

test('manifest records exact ignore entries and status reports missing ones', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-ignore-status-'))
  const entries = generatedTargets(root, [path.join(root, '.cursor', 'mcp.json')])
  ensureGitignoreEntries(root, entries.map((entry) => entry.pattern))
  installHarness({ projectRoot: root, type: 'docs', gitignoreEntries: entries })

  const manifest = JSON.parse(
    readFileSync(path.join(root, '.processkit/install-manifest.json'), 'utf8'),
  )
  assert.deepEqual(manifest.gitignore, [
    { pattern: '/.cursor/', shared: true },
    { pattern: '/.processkit/' },
  ])

  const healthy = harnessStatus(root)
  assert.ok(healthy.gitignore.every((entry) => entry.present))

  removeGitignoreEntries(root, ['/.processkit/'])
  const degraded = harnessStatus(root)
  const missing = degraded.gitignore.find((entry) => entry.pattern === '/.processkit/')
  assert.equal(missing.present, false)
  assert.equal(missing.shared, false)
  assert.equal(degraded.gitignore.find((entry) => entry.pattern === '/.cursor/').present, true)
})

test('deinit removes exclusive ignore entries but keeps shared multi-toolkit ones', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-ignore-deinit-'))
  // Another toolkit already relies on .cursor/ (unanchored member form).
  writeFileSync(path.join(root, '.gitignore'), '# member\n.cursor/\nother-toolkit.local.json\n')

  const entries = generatedTargets(root, [path.join(root, '.cursor', 'mcp.json')])
  const merged = ensureGitignoreEntries(root, entries.map((entry) => entry.pattern))
  assert.deepEqual(merged.added, ['/.processkit/'], 'equivalent .cursor/ must not duplicate')
  installHarness({ projectRoot: root, type: 'fe', gitignoreEntries: entries })

  const dryRun = uninstallHarness({ projectRoot: root })
  assert.deepEqual(dryRun.gitignoreRemoved, ['/.processkit/'])
  assert.deepEqual(dryRun.gitignoreKept, ['/.cursor/'])
  assert.match(readFileSync(path.join(root, '.gitignore'), 'utf8'), /\.processkit/)

  const applied = uninstallHarness({ projectRoot: root, yes: true })
  assert.deepEqual(applied.gitignoreRemoved, ['/.processkit/'])
  const after = readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.equal(after, '# member\n.cursor/\nother-toolkit.local.json\n')
})

test('CLI init merges gitignore from actual writes and re-init is idempotent', () => {
  const cli = path.resolve('bin/processkit.mjs')
  const home = mkdtempSync(path.join(os.tmpdir(), 'processkit-gi-home-'))
  const state = mkdtempSync(path.join(os.tmpdir(), 'processkit-gi-state-'))
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-gi-root-'))
  const env = { ...process.env, HOME: home, PROCESSKIT_STATE_DIR: state }
  const run = (args) =>
    spawnSync(process.execPath, [cli, ...args, '--project-root', root, '--yes'], {
      encoding: 'utf8',
      env,
    })

  const init = run(['init', '--type=docs', '--target=cursor,claude'])
  assert.equal(init.status, 0, init.stderr)
  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.ok(gitignore.includes('/.cursor/'))
  assert.ok(gitignore.includes('/.processkit/'))
  assert.ok(gitignore.includes('/.claude.json'))
  assert.ok(gitignore.includes('/.claude/'))
  assert.ok(!gitignore.includes('.mcp.json'), 'detection-only paths are never ignored')

  const again = run(['init', '--type=docs', '--target=cursor,claude'])
  assert.equal(again.status, 0, again.stderr)
  assert.equal(readFileSync(path.join(root, '.gitignore'), 'utf8'), gitignore)

  const deinit = run(['deinit'])
  assert.equal(deinit.status, 0, deinit.stderr)
  const after = readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.ok(!after.includes('/.processkit/'))
  assert.ok(after.includes('/.cursor/'), 'shared entries survive deinit')
})

test('cross-repo routing rule is installed for every lane', () => {
  for (const type of ['docs', 'fe', 'be']) {
    const root = mkdtempSync(path.join(os.tmpdir(), `processkit-routing-${type}-`))
    const harness = installHarness({ projectRoot: root, type })
    const rule = path.join(root, '.cursor/rules/processkit-cross-repo-index.mdc')
    assert.ok(harness.written.includes(rule), `${type} lane must install the routing rule`)
    const body = readFileSync(rule, 'utf8')
    assert.match(body, /HUBDOCS_ROOT/)
    assert.match(body, /codegraph-<key>/)
    assert.match(body, /CODEGENKIT_DOCS_ROOT/)
    assert.match(body, /Never run `codegraph init` in a workspace parent/)
    assert.match(body, /platform-dna codegraph:wire/)
    assert.match(body, /ArtifactGraph stays local-only/)
  }
})

test('lifecycle APIs are exported from the package entry point', async () => {
  const api = await import('../dist/index.js')
  assert.equal(typeof api.harnessStatus, 'function')
  assert.equal(typeof api.pruneHarness, 'function')
  assert.equal(typeof api.uninstallHarness, 'function')
  assert.equal(typeof api.discoverInstalls, 'function')
  assert.equal(api.PROCESSKIT_TOOL_API, 1)
  assert.equal(api.PROCESSKIT_HARNESS_API, 1)
  assert.equal(typeof api.ReadMeasurement, 'function')
  assert.equal(typeof api.MissingOptionalEventEmitter, 'function')
  assert.equal(typeof api.validateMissingOptionalEvent, 'function')
})

test('package manifests stay version-aligned', () => {
  const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'))
  const mcpPkg = JSON.parse(readFileSync(path.resolve('mcp-package.json'), 'utf8'))
  const server = readFileSync(path.resolve('src/mcp/server.ts'), 'utf8')
  assert.equal(pkg.version, '0.4.0')
  assert.equal(mcpPkg.version, pkg.version)
  assert.match(server, new RegExp(`version: '${pkg.version.replaceAll('.', '\\.')}'`))
})

test('0.3.0 unnamespaced schema becomes stale and prune-safe on re-init', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-schema-ns-'))
  const schemaContent = readFileSync(
    path.resolve('schemas/missing-optional-event.schema.json'),
    'utf8',
  )
  const oldRel = '.cursor/schemas/missing-optional-event.schema.json'
  const newRel = '.cursor/schemas/processkit/missing-optional-event.schema.json'
  const oldTarget = path.join(root, ...oldRel.split('/'))
  const newTarget = path.join(root, ...newRel.split('/'))

  mkdirSync(path.join(root, '.processkit'), { recursive: true })
  mkdirSync(path.dirname(oldTarget), { recursive: true })
  writeFileSync(oldTarget, schemaContent)
  writeFileSync(
    path.join(root, '.processkit/install-manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        package: '@platform/processkit',
        packageVersion: '0.3.0',
        type: 'docs',
        toolApi: 1,
        harnessApi: 1,
        installedAt: new Date().toISOString(),
        files: {
          [oldRel]: {
            source: 'schemas/missing-optional-event.schema.json',
            sha256: createHash('sha256').update(schemaContent).digest('hex'),
          },
        },
      },
      null,
      2,
    )}\n`,
  )

  const result = installHarness({ projectRoot: root, type: 'docs' })
  assert.ok(existsSync(newTarget))
  assert.ok(result.written.includes(newTarget))
  assert.ok(result.stale.includes(oldTarget))
  assert.equal(existsSync(oldTarget), true)

  const status = harnessStatus(root)
  assert.equal(status.packageVersionInstalled, '0.4.0')
  assert.ok(status.stale.includes(oldTarget))
  assert.ok(status.healthy.includes(newTarget))

  const pruned = pruneHarness({ projectRoot: root, yes: true })
  assert.ok(pruned.removed.includes(oldTarget))
  assert.equal(existsSync(oldTarget), false)
  assert.equal(existsSync(newTarget), true)
  assert.equal(harnessStatus(root).stale.includes(oldTarget), false)
})

test('CodeGraph fixture proves deterministic accelerator and fallback metrics', () => {
  const fixture = path.resolve('test/fixtures/codegraph-fallback')
  const corpus = path.join(fixture, 'corpus')
  const lookup = 'CheckoutService.submit'

  const acceleratorReads = new ReadMeasurement()
  const index = JSON.parse(
    acceleratorReads.readText(path.join(fixture, 'accelerator-index.json')),
  )
  const acceleratorResult = acceleratorReads.readText(path.join(fixture, index[lookup]))

  const targetedReads = new ReadMeasurement()
  const routeMap = targetedReads.readText(path.join(fixture, 'routes.map'))
  const targetMatch = routeMap.match(
    new RegExp(`${lookup.replace('.', '\\.')} -> (corpus/[^\\s]+)`),
  )
  assert.ok(targetMatch)
  const targetedResult = targetedReads.readText(path.join(fixture, targetMatch[1]))

  const fullReads = new ReadMeasurement()
  let fullResult = ''
  for (const name of readdirSync(corpus).sort()) {
    const content = fullReads.readText(path.join(corpus, name))
    if (content.includes('class CheckoutService')) fullResult = content
  }

  assert.equal(acceleratorResult, targetedResult)
  assert.equal(acceleratorResult, fullResult)
  assert.deepEqual(acceleratorReads.snapshot(), { fileReads: 2, contextBytes: 162 })
  assert.deepEqual(targetedReads.snapshot(), { fileReads: 2, contextBytes: 377 })
  assert.deepEqual(fullReads.snapshot(), { fileReads: 6, contextBytes: 638 })
  assert.ok(
    acceleratorReads.snapshot().contextBytes <=
      targetedReads.snapshot().contextBytes * 0.5,
    'accelerator must use at least 50% fewer context bytes than targeted fallback',
  )
  assert.ok(
    acceleratorReads.snapshot().contextBytes <= fullReads.snapshot().contextBytes * 0.3,
    'accelerator must use at least 70% fewer context bytes than full fallback',
  )
})

test('missing optional event validates measured metrics and deduplicates run/optional', () => {
  const fixture = path.resolve('test/fixtures/codegraph-fallback')
  const reads = new ReadMeasurement()
  reads.readText(path.join(fixture, 'routes.map'))
  reads.readText(path.join(fixture, 'corpus/checkout-service.ts'))

  const emitter = new MissingOptionalEventEmitter()
  const input = {
    runId: 'fixture-run-1',
    optional: 'codegraph',
    reason: 'unavailable',
    fallback: 'targeted-local-search',
    metrics: reads.snapshot(),
  }
  const event = emitter.emit(input)
  assert.deepEqual(event, {
    schemaVersion: '1.0.0',
    event: 'processkit.missing-optional',
    package: '@platform/processkit',
    ...input,
  })
  assert.deepEqual(validateMissingOptionalEvent(event), { ok: true, errors: [] })
  assert.equal(emitter.emit(input), null)
  assert.ok(emitter.emit({ ...input, optional: 'hubdocs' }))

  const schema = JSON.parse(
    readFileSync(path.resolve('schemas/missing-optional-event.schema.json'), 'utf8'),
  )
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, Object.keys(event))
  assert.equal(schema.properties.metrics.additionalProperties, false)
})

for (const optionalServers of [
  {},
  { codegraph: { command: 'codegraph' } },
  {
    codegraph: { command: 'codegraph' },
    hubdocs: { command: 'hubdocs-mcp' },
    artifactgraph: { command: 'artifactgraph-mcp' },
  },
]) {
  test(`init preserves ${Object.keys(optionalServers).length} optional accelerators`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-optional-'))
    mkdirSync(path.join(root, '.cursor'), { recursive: true })
    writeFileSync(
      path.join(root, '.cursor', 'mcp.json'),
      `${JSON.stringify({ mcpServers: optionalServers }, null, 2)}\n`,
    )
    installCursorMcp(root)
    const config = JSON.parse(readFileSync(path.join(root, '.cursor', 'mcp.json'), 'utf8'))
    assert.deepEqual(
      Object.keys(config.mcpServers).filter((id) => id !== 'processkit'),
      Object.keys(optionalServers),
    )
    for (const [id, entry] of Object.entries(optionalServers)) {
      assert.deepEqual(config.mcpServers[id], entry)
    }
    assert.ok(config.mcpServers.processkit)
  })
}
