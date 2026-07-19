---
name: business-process-trace
extractBundle: business-process-trace
description: /business-process-trace — brownfield cross-system business process trace through code/evidence; curated product journeys use /journey (FLOW-*).
disable-model-invocation: true
---

# /business-process-trace — Brownfield business process

Trace an **observed** end-to-end business process through legacy/code evidence.
Do **not** invent missing hops. Curated product journeys stay under **`/journey`** (`FLOW-*`).

**Owner:** Processkit · Accelerators optional: CodeGraph · Hubdocs · ArtifactGraph

## Load

| Load | Skip |
|------|------|
| `legacy/project-config.md` progressive | Treating FE docs as architecture SSOT |
| Cross-repo route/job/event evidence | Writing new product `FLOW-*` without evidence |
| Step vocabulary in extract `business-process-trace.md` | Full `platform-repos.json` dump |

## Workflow

1. Discover entrypoint(s): page / API / webhook / command / schedule / job.
2. Trace steps: `page | api | call | persist | job | event | listener | command | mail`.
3. Per step record: system/repo, route/symbol, input/output, sync/async, evidence location.
4. Mark unverified hops and process gaps; never invent missing calls.
5. Handoff to `/journey` only when promoting a curated target journey; handoff to `/legacy-spec` for module IR.

## Accelerators (optional)

Route per intent (rule `processkit-cross-repo-index.mdc`): never one merged
workspace graph — always the correct per-repo index.

```text
if CodeGraph available: symbol/caller/call-chain lookup — for repo X use its
  own server `codegraph-<key>` (--project-root = X's checkout), never the open
  repo's index; unindexed repo → report `cd <root> && codegraph init`
else: targeted local search/read; unresolved hop → compact model evidence slice

if Hubdocs available: resolve CMP/CTR/FLOW IDs and doc paths via HUBDOCS_ROOT
  (never CodeGraph for architecture Markdown)
else: repository path conventions/search

if ArtifactGraph available: parity/tag slice when contract/registry is touched
  (local-only — never a shared index for other repos)
else: model review from scoped evidence

IR / registry / generation questions → pointer kits
  (CODEGENKIT_DOCS_ROOT, TESTKIT_DOCS_ROOT, TESTKIT_TESTS_ROOT)
```

At run start, assign one stable `runId`. For each unavailable optional MCP,
continue the fallback and count successful file reads plus exact raw bytes read
into context. After that optional's fallback completes, emit exactly one
`processkit.missing-optional` JSON event for the `runId` + optional pair using
`.cursor/schemas/processkit/missing-optional-event.schema.json`. Deduplicate retries. Report
`fileReads` and `contextBytes`; never invent token counts or vague savings.

## Aliases

- `/flow-trace` → thin deprecated redirect to this skill (one compatibility cycle)

## Done

- Verified steps/evidence + process map, or explicit residual gaps listed.
