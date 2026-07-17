# Business process trace — step template

Brownfield/cross-system process evidence. Prefer skill **`/business-process-trace`**.
Curated product journeys: **`/journey`** → `architecture/06-runtime/journeys/` (`FLOW-*`).

## Sections only

`# title` · `## Steps` · `## Diagram` (one mermaid) · `## Gaps` (optional)

## Step types

```
page [{system}] {route}
api [{system}] {METHOD} {path}
call [{from} → {to}] {METHOD} {path} — note
persist [{system}] {table/model}
job [{system}] dispatch({ClassName})
event [{system}] {EventName}
listener [{system}] {ListenerName}
command [{system}] {CommandName}
mail [{system}] template: {relative/path}
```

Systems: use repo/product ids from evidence (`portal` | `api` | legacy checkouts via `legacy-repos.local.json`). Never invent sibling paths.

Resolve roots: `legacy/project-config.md` (progressive — needed ids only, no full JSON dump)

## Missing optional accelerators

CodeGraph and other MCP accelerators are optional. Continue with targeted local
search/read. For each run/optional pair, emit one
`processkit.missing-optional` event after fallback completes. Measure successful
file reads and exact raw context bytes; deduplicate retries and do not estimate
tokens. Contract: `.cursor/schemas/processkit/missing-optional-event.schema.json`.

## Example shape (verify in code)

```markdown
# Survey notification

## Steps
1. page [mairy-fullsco] `/admin/surveys/create`
2. api [mairy-backend] `POST /api/admin/surveys`
3. call [mairy-backend → mairy-scenario] `POST /api/sync/survey`
4. job [mairy-backend] `dispatch(SendSurveyThankYouMail)`
5. mail [mairy-backend] `template: resources/views/emails/survey/thank-you.blade.php`

## Diagram
\`\`\`mermaid
sequenceDiagram
  ...
\`\`\`
```

No UI colors/layout. After a curated promote: write/link under `architecture/06-runtime/journeys/` via `/journey`.
