# `processkit init`

Run from the target repository:

```bash
processkit init --type=docs --target=cursor --yes
processkit init --type=fe --target=cursor --yes
processkit init --type=be --target=cursor --yes
```

`docs` syncs `/business-process-trace`, `/business-impact-review` and the
deprecated `/flow-trace` redirect. `fe`/`be` sync only impact review.

The command:

1. merges a machine-local Processkit MCP entry into `.cursor/mcp.json`;
2. safely syncs profile-owned harness assets;
3. records the destination in
   `$XDG_STATE_HOME/processkit/installs.json` (falling back to
   `~/.local/state/processkit/installs.json`).

Processkit never writes `platform-repos*.json` or `legacy-repos*.json`; project
maps are Platform DNA-owned and optional. Legacy evidence roots stay in the
member-owned `legacy-repos.local.json`.

Existing MCP server entries, including a preconfigured CodeGraph server, are
preserved. Init does not probe or require CodeGraph, so Processkit-only and
Processkit+CodeGraph installs are deterministic offline.

It never writes `legacy-repos.local.json`.

## Deinitialize one destination

Run from the destination repo (or pass `--project-root`):

```bash
processkit deinit
processkit deinit --project-root /path/to/project --yes
```

This removes the current destination's unmodified managed harness files and
local Processkit MCP entry. Member-modified files are preserved and reported;
only Processkit-owned keys are removed from the shared extract registry. The
destination is then forgotten from the install ledger.

Without `--yes`, the command is a dry-run in non-interactive use. In a TTY it
shows the same preview and asks for confirmation.

## Uninstall Processkit globally

```bash
processkit uninstall
processkit uninstall --yes
processkit uninstall --discover ~/workspace --yes
```

`uninstall` can run from any directory and defaults to all: every ledger
destination, local and global Processkit MCP wiring, CLI shims, and the
Processkit CLI install directory. `--discover <dir>` finds older harness
installs created before the ledger existed.

`processkit prune` remains a separate stale-only operation; it does not remove
current harness files, MCP wiring, or the CLI. Advanced `--scope` and
`--keep-mcp` filters are available for partial cleanup.
