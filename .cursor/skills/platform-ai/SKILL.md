---
name: platform-ai
description: /platform-ai — build and maintain the independent Processkit MCP package.
disable-model-invocation: true
---

# /platform-ai — build Processkit MCP

Use this skill to design, implement, test, package, and release Processkit as
an independent MCP. Do not implement product features or process documents here.

## Scope

- Own Processkit tools, CLI/API, installers, packaged harness, tests, and docs.
- Keep deterministic process validation and impact-report logic in the package.
- Keep process orchestration in Processkit-owned harness assets.
- Do not keep `platform-repos.json`, Platform DNA assets, or sibling topology.

## Workflow

1. Freeze tool and ownership contracts in `mcp-package.json`.
2. Implement behavior in `src/` and package-owned `harness/`.
3. Keep lane subsets explicit and `init` managed-hash protected.
4. Update tests and docs with every observable behavior change.
5. Run `pnpm test` and `pnpm pack --dry-run` before release.

## Done

- Package works without sibling repositories.
- Shipped files contain only Processkit-owned assets.
- Destination changes are conflict-safe and uninstallable.
- Version, manifest compatibility, docs, and tests agree.
