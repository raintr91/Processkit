# `processkit init`

Run from the target repository — no flags needed:

```bash
processkit init
```

In a TTY this opens a short wizard, always in this order:

1. **Agents** — checkbox (↑↓ · Space · Enter); detected agents are
   pre-checked. Supported: Claude Code, Cursor, Codex CLI, opencode, Hermes,
   Gemini CLI, Antigravity, Kiro, Kilo.
2. **Lane** — `docs` | `fe` | `be`.
3. Tech — Processkit has none, so there is no third prompt.

There is no location question: every selected agent gets a project-local MCP
config under the current repo (`.cursor/mcp.json`, `.claude.json`,
`.codex/config.toml`, `.hermes/config.yaml`, `.gemini/config/mcp_config.json`,
…), then the lane harness is installed.

CI keeps the long flags (any flag or `--yes` skips the wizard):

```bash
processkit init --type=docs --target=cursor --yes
processkit init --type=fe --target=cursor,codex --yes
processkit init --type=be --target=auto --yes   # auto = detected agents
```

`docs` syncs `/business-process-trace`, `/business-impact-review` and the
deprecated `/flow-trace` redirect. `fe`/`be` sync only impact review.

The command:

1. merges a Processkit MCP entry into each selected agent's project-local
   config at the repo root;
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
unwires the local Processkit MCP entry from every agent config written at init
(Cursor, Claude, Codex, …). Member-modified files are preserved and reported;
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
