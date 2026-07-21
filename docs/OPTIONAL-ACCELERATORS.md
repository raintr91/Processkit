# Optional accelerator fallback evidence

CodeGraph, Docskit and ArtifactGraph are optional. A missing accelerator must
not stop a Processkit trace or review.

For each run, assign one stable `runId`. If an optional MCP is unavailable:

1. continue with targeted local search/read and model analysis over that scoped
   evidence;
2. count actual file reads and raw bytes returned as model context;
3. after fallback search completes, emit one
   `processkit.missing-optional` JSON event for that `runId` + `optional`;
4. deduplicate later attempts for the same pair.

The event schema is
[`schemas/missing-optional-event.schema.json`](../schemas/missing-optional-event.schema.json).
`fileReads` counts every successful file read, including repeated reads.
`contextBytes` is the sum of the byte lengths of those file contents. Do not
estimate tokens or report vague token savings. A model-only fallback that reads
no files reports zero for both metrics.

```json
{
  "schemaVersion": "1.0.0",
  "event": "processkit.missing-optional",
  "package": "@platform/processkit",
  "runId": "impact-2026-07-17T14:00:00Z",
  "optional": "codegraph",
  "reason": "unavailable",
  "fallback": "targeted-local-search",
  "metrics": {
    "fileReads": 4,
    "contextBytes": 1832
  }
}
```

The package API exports `ReadMeasurement`,
`MissingOptionalEventEmitter`, and `validateMissingOptionalEvent`. These helpers
have no CodeGraph dependency. An agent may apply the same contract without
calling the helpers.

`processkit init` merges only its own MCP entry. Existing CodeGraph and other
server entries in `.cursor/mcp.json` are preserved byte-for-value at the parsed
JSON level; no live server probe is required.

## Cross-repo index routing

When an accelerator is available, route it per repo/intent — never merge every
repository into one workspace graph. `init` installs the always-apply rule
`cross-repo-index.mdc` (Platform DNA SSOT filename) into `.cursor/rules/` for
every lane so Processkit-only installs still have the contract; when DNA is
already present the same file is shared (no second `processkit-*` rule):

- architecture ID / C4 path → Docskit (`DOCSKIT_ROOT`), never CodeGraph;
- IR / registry / generation → pointer kits (`CODEGENKIT_DOCS_ROOT`,
  `TESTKIT_DOCS_ROOT`, `TESTKIT_TESTS_ROOT`);
- symbol / call-graph of repo `X` → that repo's own `codegraph-<key>` server
  (`--project-root` = `X`'s checkout), not the currently open repo's index.

Checkout maps (machine-local only):

| System id | Map |
|-----------|-----|
| `legacy-*` | `legacy-repos.local.json` |
| platform portal/api/tests/… | `platform-repos.local.json` |

`init` ensures both `.local.json` skeletons exist (create-if-missing). Fill roots
with **`/configure-repo-maps`** (NL). Cross-repo with empty/missing keys → Gaps
+ that skill; then `platform-dna codegraph:wire`. Processkit never hand-writes
cross-repo CodeGraph wiring. ArtifactGraph stays local-only.

Example before `/business-process-trace`:

```text
/configure-repo-maps
Portal admin is at /home/me/ws/portal; API core at /home/me/ws/api;
legacy ERP at /mnt/d/legacy/erp with key legacy-erp.
```
