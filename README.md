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

## Quick start (member)

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/Processkit/main/install.sh | bash
cd /path/to/project
processkit init        # wizard: agents → lane (docs|fe|be)
```

The wizard picks agents (checkbox, detected ones pre-checked), then the lane.
Every selected agent gets a project-local MCP config in the current repo; there
is no location prompt. Init also merges the generated local targets into
`.gitignore` (derived from what it actually wrote, idempotent, member content
and EOL preserved) and records them in the install manifest so `status` can
report missing entries and `deinit` keeps shared ones. CI keeps the long
flags:

```bash
processkit init --type=docs --target=cursor --yes
```

From a local checkout: `pnpm install && pnpm build`, then run
`node /path/to/Processkit/bin/processkit.mjs init` from the target repo.

Profiles:

- `docs`: process trace + impact review + deprecated redirect
- `fe` / `be`: impact review only

## Managed harness lifecycle

`init` records only Processkit-managed harness assets and their installed hashes
in `.processkit/install-manifest.json`. Switching profiles marks assets from the
previous profile as stale; it does not delete them or manage shared registries
and project maps. It also records the destination in the XDG install ledger at
`$XDG_STATE_HOME/processkit/installs.json` (or
`~/.local/state/processkit/installs.json`).

```bash
processkit status --project-root /path/to/project
processkit prune --project-root /path/to/project        # dry-run
processkit prune --project-root /path/to/project --yes  # delete safe stale files
processkit deinit                                       # current repo + local MCP
processkit uninstall                                    # every repo + MCP + CLI
```

Prune deletes only stale files still matching their recorded hash. Customized
files are retained. `platform-repos.json`, shared extract registries and any
file absent from the Processkit install manifest are never prune targets.
Unsupported manifest APIs and unsafe paths fail before harness writes or
deletions.

Without `--yes`, `deinit` and `uninstall` are dry-runs in non-interactive use;
in a TTY they preview and ask for confirmation. `deinit` is the inverse of
`init` for the current destination: it removes hash-matching managed harness
files and unwires local Processkit MCP entries from every agent config written
at init, preserves and reports modified files,
safely removes only Processkit bundle keys from the shared extract registry,
and forgets the destination from the ledger.

`processkit uninstall` can run from anywhere. It defaults to global/all:
every destination in the ledger, each local Processkit MCP entry, the global
Cursor MCP entry, the CLI shims and `~/.processkit`. For installs created before
the ledger existed:

```bash
processkit uninstall --discover ~/workspace --yes
```

Advanced `--scope=repo|all-repos|mcp-local|mcp-global|cli|all`,
`--project-root`, and `--keep-mcp` filters remain available. `prune` remains
stale-only and never performs a full deinitialization.

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
