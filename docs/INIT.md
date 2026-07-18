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
2. safely syncs profile-owned harness assets.

Processkit never writes `platform-repos*.json` or `legacy-repos*.json`; project
maps are Platform DNA-owned and optional. Legacy evidence roots stay in the
member-owned `legacy-repos.local.json`.

Existing MCP server entries, including a preconfigured CodeGraph server, are
preserved. Init does not probe or require CodeGraph, so Processkit-only and
Processkit+CodeGraph installs are deterministic offline.

It never writes `legacy-repos.local.json`.
