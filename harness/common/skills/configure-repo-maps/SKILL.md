---
name: configure-repo-maps
description: /configure-repo-maps — describe repo topology in natural language; write machine-local checkout maps (merge-by-key).
disable-model-invocation: true
---

<!-- toolkit:configure-repo-maps-thin -->

# /configure-repo-maps

SSOT owner: **Platform DNA**. This Processkit copy keeps the skill available when
DNA is not installed. Prefer the DNA skill if both are present.

Members describe checkout topology in natural language. The agent writes the
correct machine-local map(s). **Do not** ask members to hand-edit JSON.

## Which file

| Member intent | Write |
|---------------|-------|
| Live platform repos (portal, api, docs, tests, …) | `platform-repos.local.json` |
| Legacy / brownfield / keys `legacy-*` | `legacy-repos.local.json` |

Portable catalogs (`platform-repos.json`, `legacy-repos.json`) stay with DNA /
Docskit — never put absolute machine paths in portable maps.

## Workflow

1. Parse the NL description for roles, keys, and absolute roots.
2. Ask when role / path / key is missing — never invent sibling paths.
3. **Merge by key** into the target `.local.json` (create skeleton if missing).
   Do not wipe unrelated keys unless the member asks to replace.
4. Validate: each entry needs a usable `root`; prefer key names that match
   CodeGraph server ids (`codegraph-<key>`).
5. After writes: remind `platform-dna codegraph:wire`. If a checkout has no
   `.codegraph/`, print `cd <root> && codegraph init`.

## Example prompts

**Platform multi-repo:**

> 2 portal: admin at `/home/me/ws/portal-admin`, line at `/home/me/ws/portal-line`;
> 2 API: core at `/home/me/ws/api-core`, scenario at `/home/me/ws/api-scenario`;
> docs = `/home/me/ws/base-docs`; tests = `/home/me/ws/base-tests`.

→ merge keys into `platform-repos.local.json`.

**Legacy:**

> Legacy ERP checkout is at `D:\legacy\erp`, key `legacy-erp`.

→ merge into `legacy-repos.local.json` under `legacy-erp`.

## Done

- Maps updated (merge-by-key) + wire/init hints printed.
- Idempotent: same description twice does not duplicate keys.
