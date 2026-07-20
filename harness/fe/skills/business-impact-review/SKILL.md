---
name: business-impact-review
description: Business-process blast-radius review across vertical request/job paths and horizontal callers.
disable-model-invocation: true
---

# /business-impact-review

Read-only analysis by default. Do not implement fixes unless explicitly asked.

## Checkout resolution

Cross-repo callers/callees:

| System id | Map |
|-----------|-----|
| `legacy-*` | `legacy-repos.local.json` |
| Otherwise | `platform-repos.local.json` |

Missing/empty map or missing key → **Gaps** + **`/configure-repo-maps`**; never
guess paths. Then remind `platform-dna codegraph:wire` if needed. Ambiguous
matches → ask or Gaps.

## Workflow

1. Scope changed public/protected methods, routes, Jobs, Events, Listeners,
   Commands and Schedules from diff/user files.
2. Search every direct and indirect caller; follow one hop beyond
   facade/dispatch/proxy boundaries.
3. Trace each reachable vertical path:

```text
Client/FE or Scheduler/Webhook
  → route/command/job
  → auth/middleware/context rewrite
  → controller/handler
  → service/domain
  → repository/model/database
  → event/listener/job/external API
  → response/error/status mapping
  → FE/consumer/next async hop
```

4. Apply `risk-classes.md`: authZ/IDOR, request bag, trust boundary,
   over-broad parse, null/empty, error collapsing, hardcode/magic,
   async context/idempotency, business rules, transactions and compatibility.
5. Report evidence and unsearched repos explicitly.

## Required report

```text
Summary / ship recommendation
Changed symbols
Horizontal callers
Vertical process paths
Findings: severity · class · evidence · impact · verify
Unsearched repos / residual risks
Targeted test plan
```

## Accelerators (optional)

Route per intent (rule `cross-repo-index.mdc`): never one merged
workspace graph — always the correct per-repo index.

```text
if CodeGraph available: changed symbols + callers + call graph — for repo X use
  its own server `codegraph-<key>` (--project-root = X's checkout), never the
  open repo's index; unindexed repo → report `cd <root> && codegraph init`
else: targeted repository search/read

if Hubdocs available: map process steps to CMP/CTR/FLOW docs via HUBDOCS_ROOT
  (never CodeGraph for architecture Markdown)
else: repository conventions/search

IR / registry / generation questions → pointer kits
  (CODEGENKIT_DOCS_ROOT, TESTKIT_DOCS_ROOT, TESTKIT_TESTS_ROOT)

if ArtifactGraph available: affected tags/registries/parity
  (local-only — never a shared index for other repos)
else: model review from scoped evidence
```

Missing accelerators never block the review. Assign one stable `runId` at run
start. For each unavailable optional MCP, use targeted local search/read and
count successful file reads plus exact raw bytes read into context. After that
optional's fallback completes, emit exactly one
`processkit.missing-optional` JSON event for the `runId` + optional pair using
`.cursor/schemas/processkit/missing-optional-event.schema.json`; deduplicate retries. Report only
actual `fileReads` and `contextBytes`, never invented token claims.
