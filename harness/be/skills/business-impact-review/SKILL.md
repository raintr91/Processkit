---
name: business-impact-review
description: Business-process blast-radius review across vertical request/job paths and horizontal callers.
disable-model-invocation: true
---

# /business-impact-review

Read-only analysis by default. Do not implement fixes unless explicitly asked.

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

```text
if CodeGraph available: changed symbols + callers + call graph
else: targeted repository search/read

if Hubdocs available: map process steps to CMP/CTR/FLOW docs
else: repository conventions/search

if ArtifactGraph available: affected tags/registries/parity
else: model review from scoped evidence
```

Missing accelerators never block the review. Assign one stable `runId` at run
start. For each unavailable optional MCP, use targeted local search/read and
count successful file reads plus exact raw bytes read into context. After that
optional's fallback completes, emit exactly one
`processkit.missing-optional` JSON event for the `runId` + optional pair using
`.cursor/schemas/processkit/missing-optional-event.schema.json`; deduplicate retries. Report only
actual `fileReads` and `contextBytes`, never invented token claims.
