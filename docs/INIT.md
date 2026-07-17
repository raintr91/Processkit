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
3. merges only Processkit skill IDs into `platform-repos.json`;
4. for docs, seeds empty portable legacy maps if missing.

It never writes `legacy-repos.local.json`.
