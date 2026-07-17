import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  scopeUnifiedDiff,
  validateBusinessProcess,
  validateImpactReport,
} from '../dist/process/validate.js'
import { installHarness } from '../dist/install/harness.js'
import { seedProjectMaps } from '../dist/install/project-maps.js'
import { installCursorMcp } from '../dist/install/cursor-mcp.js'

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
  seedProjectMaps(root, 'docs')
  const platform = JSON.parse(readFileSync(path.join(root, 'platform-repos.json'), 'utf8'))
  assert.ok(platform.harness.profiles.docs.skills.includes('business-process-trace'))
  assert.ok(platform.harness.profiles.docs.skills.includes('flow-trace'))
  const legacy = JSON.parse(readFileSync(path.join(root, 'legacy-repos.json'), 'utf8'))
  assert.deepEqual(legacy.projects, {})
})

test('FE profile syncs impact review only', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'processkit-fe-'))
  installHarness({ projectRoot: root, type: 'fe' })
  seedProjectMaps(root, 'fe')
  const platform = JSON.parse(readFileSync(path.join(root, 'platform-repos.json'), 'utf8'))
  assert.deepEqual(platform.harness.profiles.fe.skills, ['business-impact-review'])
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
    assert.ok(config.mcpServers.processkit)
  })
}
