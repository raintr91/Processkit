# Processkit

Standalone MCP/harness package for:

- `/business-process-trace` — brownfield cross-system process evidence
- `/business-impact-review` — vertical × horizontal code-change review
- `/configure-repo-maps` — NL → machine-local checkout maps (cross-repo)
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
is no location prompt. Init also:

- ensures `platform-repos.local.json` and `legacy-repos.local.json` when missing
  (never overwrites; never seeds portable `*-repos.json`);
- merges generated local targets into `.gitignore` (idempotent; unanchored
  patterns `.cursor/` / `.processkit/` matching Platform DNA / Codegenkit);
- installs shared `cross-repo-index.mdc` (DNA SSOT filename — no duplicate
  `processkit-cross-repo-index.mdc`);
- records entries in the install manifest so `status` can report missing
  ignore lines and empty local maps.

CI keeps the long flags:

```bash
processkit init --type=docs --target=cursor --yes
```

### Local checkout / global CLI

From a local checkout:

```bash
pnpm install && pnpm build
# one-shot init without global install:
node /path/to/Processkit/bin/processkit.mjs init

# or refresh ~/.processkit + PATH shims from this checkout:
./install.sh --from /path/to/Processkit
# equivalent: PROCESSKIT_SRC=/path/to/Processkit ./install.sh
```

When Platform DNA should invoke this checkout instead of an older global
`processkit` on PATH:

```bash
export PLATFORM_DNA_PROCESSKIT_ROOT=/path/to/Processkit
platform-dna init
```

Profiles:

- `docs`: process trace + impact review + configure-repo-maps + deprecated redirect
- `fe` / `be`: impact review + configure-repo-maps

## Cross-repo routing

| Step system id | Checkout map |
|----------------|--------------|
| `legacy-*` | `legacy-repos.local.json` |
| otherwise | `platform-repos.local.json` |

In-repo-only work needs no map. Cross-repo with empty/missing keys → Gaps +
`/configure-repo-maps`, then `platform-dna codegraph:wire`.

### Example prompts (`/configure-repo-maps`)

**Platform multi-repo** (writes `platform-repos.local.json`):

```text
/configure-repo-maps
2 portal: admin at ~/ws/portal-admin, line at ~/ws/portal-line;
2 API: core at ~/ws/api-core, scenario at ~/ws/api-scenario;
docs = ~/ws/base-docs; tests = ~/ws/base-tests.
```

**Legacy** (writes `legacy-repos.local.json`):

```text
/configure-repo-maps
Legacy ERP is at D:\legacy\erp, key legacy-erp.
```

Then run `/business-process-trace` or `/business-impact-review` as usual.

## Managed harness lifecycle

`init` records only Processkit-managed harness assets and their installed hashes
in `.processkit/install-manifest.json`. Switching profiles marks assets from the
previous profile as stale; it does not delete them or manage shared registries
and portable project maps. It also records the destination in the XDG install ledger at
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
and forgets the destination from the ledger. Local map files are kept.

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

Processkit never writes portable `platform-repos.json` / `legacy-repos.json`
(Platform DNA / Bundlekit own those). It only ensures ignored
`platform-repos.local.json` and `legacy-repos.local.json` skeletons so
cross-repo skills have a place to resolve checkouts regardless of toolkit
install order.
