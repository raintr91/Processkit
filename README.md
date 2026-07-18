# Processkit

Standalone MCP/harness package for:

- `/business-process-trace` — brownfield cross-system process evidence
- `/business-impact-review` — vertical × horizontal code-change review
- deprecated `/flow-trace` redirect

Optional accelerators: CodeGraph, Hubdocs and ArtifactGraph. Processkit works
without them through targeted repository search/model analysis. Missing
optionals produce one schema-validated evidence event per run/optional with
actual file-read and context-byte metrics; see
[`docs/OPTIONAL-ACCELERATORS.md`](docs/OPTIONAL-ACCELERATORS.md).

## Install (local checkout)

```bash
pnpm install
pnpm build

cd /path/to/project
node /path/to/Processkit/bin/processkit.mjs init --type=docs --target=cursor --yes
```

Profiles:

- `docs`: process trace + impact review + deprecated redirect
- `fe` / `be`: impact review only

## Managed harness lifecycle

`init` records only Processkit-managed harness assets and their installed hashes
in `.processkit/install-manifest.json`. Switching profiles marks assets from the
previous profile as stale; it does not delete them or manage shared registries
and project maps.

```bash
processkit status --project-root /path/to/project
processkit prune --project-root /path/to/project        # dry-run
processkit prune --project-root /path/to/project --yes  # delete safe stale files
```

Prune deletes only stale files still matching their recorded hash. Customized
files are retained. `platform-repos.json`, shared extract registries and any
file absent from the Processkit install manifest are never prune targets.
Unsupported manifest APIs and unsafe paths fail before harness writes or
deletions.

## MCP tools

- `business_process_validate`
- `business_impact_validate`
- `business_diff_scope`

Processkit has no runtime dependency on CodeGraph. `init` preserves an existing
CodeGraph MCP entry and does not require the server to be live.

## Portability

Processkit does not write project maps (`platform-repos*.json`,
`legacy-repos*.json`); they are Platform DNA-owned and optional. Machine
checkout roots belong in ignored `legacy-repos.local.json`; the package never
writes them.
