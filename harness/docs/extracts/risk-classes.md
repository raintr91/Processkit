# Risk classes checklist

Use with [SKILL.md](SKILL.md). Tick each class against the vertical + horizontal maps.

## AuthZ / IDOR

- [ ] Resource by id checked against current tenant (`storeId` / `hotel_id` from trusted source)
- [ ] Body/query `store_id` cannot switch store context for another hotel
- [ ] Admin/batch skip of ownership is intentional and not reachable from store UI JWT
- [ ] Report/filter/list-by-ids rejects foreign ids (404), not only empty data

## Request bag / contract

- [ ] ID lists use **named keys** (`ids`, `arrId`, `survey_ids`, `scenarioList`) — not bare `[1,2]` → `0=1`
- [ ] `$request->all()` / `query()` not treated as “array of business ids”
- [ ] Middleware `merge` fields (`store_id`, `storeId`, …) stripped or unused when parsing id lists
- [ ] Allowlist vs denylist clear for context keys vs business keys

**Context denylist (typical after ScenarioAuthentication):**  
`store_id`, `storeId`, `service_id`, `serviceId`, `m_service_id`, `isAdmin`, `apiKey`, pagination/date noise if normalizing “all numbers”.

**ID allowlist (prefer):**  
`ids`, `arrId`, `survey_ids`, `scenario_ids`, `scenarioList`

## Trust boundary / proxy

- [ ] Upstream 404 stays 404 (or explicit not-found JSON), not 200 + empty Resource
- [ ] FE `throwError` / `createError` aligned with real HTTP status
- [ ] JWT/`attributes` preferred over client-supplied tenant ids

## Over-broad parse

- [ ] No “every positive int in the array is an id” unless array is already allowlisted
- [ ] CSV/string explode paths do not swallow unrelated query params

## Null / empty

- [ ] Missing model → 404 vs empty collection semantics documented
- [ ] `whereIn([], …)` / empty id list behavior safe (no accidental match-all)
- [ ] Optional relations null-safe before property access

## Error collapsing

- [ ] Distinct failures keep distinct outcomes (authZ 404 ≠ relation-exists ≠ server error)
- [ ] Controller does not always return one business message when helper returns `true` for multiple reasons

## Hardcode / magic

- [ ] No production hardcode of hotel/store/survey/scenario ids
- [ ] Magic status/codes named or constanted when added

## Async / Jobs / Events

- [ ] Job payload carries needed tenant/service context (or reloads safely)
- [ ] Job path does not assume HTTP middleware ran (`merge`, `attributes->storeId`)
- [ ] Retries are idempotent for writes/deletes
- [ ] Failed pre-check cannot leave partial side effects
- [ ] `dispatch` callers listed in horizontal table

## Business rules

- [ ] Relation/existence gates: false positive and false negative both considered
- [ ] Delete/update constraints still correct after ownership changes
- [ ] Soft-deleted rows excluded/included as product intends

## Data / transactions

- [ ] Multi-step delete/update atomic where required
- [ ] Soft delete vs force delete consistency with “exists” checks
