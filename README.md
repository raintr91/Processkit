# Processkit

Standalone MCP/harness package for:

- `/business-process-trace` — brownfield cross-system process evidence
- `/business-impact-review` — vertical × horizontal code-change review
- deprecated `/flow-trace` redirect

Optional accelerators: CodeGraph, Hubdocs and ArtifactGraph. Processkit works
without them through targeted repository search/model analysis.

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

## Portability

`init --type=docs` seeds empty `legacy-repos.json` and
`legacy-repos.example.json` only when missing. Machine checkout roots belong in
ignored `legacy-repos.local.json`; the package never writes them.
