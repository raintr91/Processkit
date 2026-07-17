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

```text
if CodeGraph available: symbol/caller/call-chain lookup
else: targeted local search/read; unresolved hop → compact model evidence slice

if Hubdocs available: resolve CMP/CTR/FLOW IDs and doc paths
else: repository path conventions/search

if ArtifactGraph available: parity/tag slice when contract/registry is touched
else: model review from scoped evidence
```

At run start, assign one stable `runId`. For each unavailable optional MCP,
continue the fallback and count successful file reads plus exact raw bytes read
into context. After that optional's fallback completes, emit exactly one
`processkit.missing-optional` JSON event for the `runId` + optional pair using
`.cursor/schemas/missing-optional-event.schema.json`. Deduplicate retries. Report
`fileReads` and `contextBytes`; never invent token counts or vague savings.

## Aliases

- `/flow-trace` → thin deprecated redirect to this skill (one compatibility cycle)

## Done

- Verified steps/evidence + process map, or explicit residual gaps listed.
