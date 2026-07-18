import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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
} from '../dist/install/harness.js'
import { installCursorMcp } from '../dist/install/cursor-mcp.js'
import {
  MissingOptionalEventEmitter,
  ReadMeasurement,
  validateMissingOptionalEvent,
} from '../dist/optional/fallback-evidence.js'

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

test('lifecycle APIs are exported from the package entry point', async () => {
  const api = await import('../dist/index.js')
  assert.equal(typeof api.harnessStatus, 'function')
  assert.equal(typeof api.pruneHarness, 'function')
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
  assert.equal(pkg.version, '0.3.1')
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
  assert.equal(status.packageVersionInstalled, '0.3.1')
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
