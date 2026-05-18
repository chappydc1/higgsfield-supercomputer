# Code Review — Round 1

## Verdict: NEEDS_CHANGES

## Summary
The intake-hardening change is mostly sound: the schema layer cleanly relaxes
the legacy affordability fields, the sentinel-coercing pre-validator is
defensive and emits useful breadcrumbs, and the per-column merge in the
repository is well-structured. However, several issues warrant fixes before
merge: (1) the `(full_name, phone)` idempotency key silently breaks when
`phone` is `NULL` because phone is now nullable but the unique constraint
treats every NULL as distinct, so phoneless re-submissions create duplicate
rows and bypass the merge path entirely; (2) the repository's
`review_status` precedence was silently flipped from
`application.review_status or existing.review_status` to
`existing.review_status or application.review_status`, which is an
out-of-scope behavioural change relative to the agreed plan; (3) the
frontend `BackendApplication` TypeScript interface still declares
`phone`, `country`, `employment_status`, `financing_consent` as
non-optional `string`, which is now wrong and lets future call-sites assume
non-null values. The merge-preservation test, while correct, only exercises
the "preserved" path — there is no negative test asserting that a meaningful
incoming value still overwrites a stale existing one. A handful of minor
issues (unused `field_validator` import, MySQL-path coverage gap for the
nullable migration, field-presence log fires before the 400 short-circuits,
runtime ALTER not invoked from app startup) round out the list.

## Findings

### CRITICAL
- (none)

### MAJOR
1. **Unique-constraint regression for phoneless submissions.**
   `backend/src/infra/mysql/models.py:47-53` keeps the
   `UniqueConstraint("full_name", "phone")` while
   `backend/src/infra/mysql/models.py:57` and the runtime ALTER in
   `backend/src/infra/mysql/schema.py:22-33` relax `phone` to `NULL`. In
   ANSI SQL and MySQL InnoDB, multiple `NULL` values are treated as
   distinct in a `UNIQUE` index — so once two phoneless submissions arrive
   for the same `full_name`, BOTH rows persist. The new
   `_find_existing` short-circuit
   (`backend/src/infra/mysql/housing_application_repository.py:269-274`)
   even hard-codes "return None when phone is None", guaranteeing a
   fresh insert on every phoneless re-submit. Result: the merge path
   never runs, the "telegram-bulletproof" preservation guarantee in
   `about.md:5` is silently void for phoneless flows, and the dashboard
   can show duplicate applications. Either (a) widen the idempotency key
   to `(full_name, COALESCE(phone, email))` (or fall back to email when
   phone is missing), or (b) document the regression and guard with a
   functional unique index. The change cannot ship as-is for users who
   submit without a phone.

2. **Out-of-scope flip of `review_status` precedence.**
   `backend/src/infra/mysql/housing_application_repository.py:331-336`
   reverses the operands from
   `application.review_status or existing.review_status or "pending"`
   (the plan-mandated form at `.ai/intake-hardening/a/plan.md:355-357`) to
   `existing.review_status or application.review_status or "pending"`.
   The flip is arguably a bug fix in itself — the original always
   returned `"pending"` because `submit_housing_application` hard-codes
   `application.review_status="pending"` and `or` short-circuits on the
   first truthy operand — but it is an undocumented behavioural change
   outside the agreed intake-hardening scope. A re-submission can no
   longer reset a row from `"approved"`/`"denied"` back to `"pending"`,
   which may matter for compliance flows (e.g. the
   `test_applicant_cannot_update_application_status` chain at
   `backend/tests/interface/test_application_endpoint.py:781`). Either
   call out the change in the CHANGELOG entry under
   `workspace/CHANGELOG.md:5-15` and add a regression test, or revert to
   the plan's order and ship the fix separately.

3. **Frontend type contract not updated for nullable response fields.**
   `frontend/lib/application-types.ts:32-41` still declares
   `phone: string`, `country: string`, `employment_status: string`,
   `financing_consent: string`. After the schema relax in
   `backend/src/interface/schemas.py:139-148` these fields can be `null`
   on the wire. The applicants list happens to be safe today
   (`frontend/app/applicants/page.tsx:583, 586` use `application.phone || ""`)
   but `frontend/app/applicants/page.tsx:1134-1138` does
   `applicant.phone.toLowerCase()` and similar — those are safe only
   because the immediate-prior normalisation step coerces null→"". Any
   new caller relying on the (now-incorrect) type will hit a runtime
   `TypeError: cannot read properties of null` on the dashboard or
   admin console. Update the type to `string | null` for the four
   affected fields and let TS surface unprotected reads.

4. **Test coverage gap: no "overwritten" assertion on the merge path.**
   `backend/tests/interface/test_application_endpoint.py:323-376` exercises
   only the *preserved* branch (sentinel-laden re-submission preserves real
   prior values). There is no test asserting the symmetric, equally-load-bearing
   case: a meaningful incoming value DOES overwrite a stale existing value
   and `[intake.merge]` lists it under `overwritten=`. Without that, a future
   refactor could degrade the loop into a no-op for everything and only
   the preserved-path test would catch it. Add a second test that submits
   `country="Japan"` then `country="Sweden"` and asserts the response shows
   `"SE"` plus an `overwritten=['country', ...]` log.

5. **MySQL ALTER path is not covered by any test.**
   `backend/tests/test_schema_migrations.py:193-200` only invokes the
   helper against SQLite, where the implementation is documented as a
   soft no-op. The MySQL branch — `information_schema.columns` query,
   per-column ALTER decisions, the `_is_missing_table_error`
   short-circuit on a missing table — has no test. The plan's
   acceptance criteria at `.ai/intake-hardening/a/plan.md:209-220`
   explicitly require "After repository instantiation against a fresh
   MySQL test DB, `information_schema.columns` reports `IS_NULLABLE='YES'`
   for all 10 columns" — this is unverified by the suite. The whole
   reason the runtime helper exists is to relax columns at deploy time
   without an offline migration window; if it silently raises on MySQL
   (e.g. due to a typo in an ALTER) production traffic gets `NOT NULL`
   constraint violations for the first request. At minimum, add an
   integration-style test that mocks the engine dialect and captures
   the executed SQL, or use a docker-based MySQL fixture if one is
   already available in CI.

6. **Field-presence log fires even when the request is destined for a
   400/422.**
   `backend/src/interface/http_endpoints.py:2016-2028` runs before the
   email/full_name/agree_policy checks at lines 2034-2050, so a payload
   that will be rejected still emits an `[intake.field-presence]` line.
   That is harmless logging-wise but makes log volume during a malformed-
   payload incident artificially high and clutters dashboards that count
   one line per *successful* submission. Move the log emit to after line
   2050 (or after `_mark("validated-inputs")` at line 2076) so it only
   fires on accepted payloads.

### MINOR
1. **Unused import.** `backend/src/interface/schemas.py:3` adds
   `field_validator` to the pydantic import line, but the module only
   uses `model_validator`. Remove `field_validator` to keep the import
   surface tight.
2. **Migration helper is not invoked from app startup.**
   `backend/src/main.py:34-50` calls `ensure_application_archived_column`,
   `ensure_application_review_status_column`, and `ensure_user_role_columns`
   at FastAPI startup but does NOT add `ensure_application_legacy_nullable`
   alongside them. The helper is only invoked from
   `housing_application_repository.py:103-104` on first repository
   instantiation, meaning the very first `POST /api/v1/applications` after
   a cold deploy pays the latency hit. For consistency and to prevent the
   first user from seeing a slow request, also call it from `main.py`.
3. **`@staticmethod` from the plan was promoted to a module-level
   helper.** The plan asked for the helper inside the repository class
   (`plan.md:316-321`); the implementation puts `_is_meaningful` at module
   scope (`housing_application_repository.py:38-49`). That is fine and
   arguably cleaner, but the divergence from the plan is unflagged.
4. **`extra="forbid"` 422 will burn a soft-launch grace window.** Cite
   `frontend/app/api/applications/route.ts:30-36`: the proxy
   `ApplicationPayload` type still allows `date_of_birth`, `profession`,
   `current_employer`, `job_title`, `industry`, `website`, `linkedin`,
   `created_at` keys. The current frontend doesn't send them, but a
   stale browser cache that submits a *previously valid* payload (e.g.
   from a bookmark or deep-link replay) will now 422. A grace window of
   a few days is typical when introducing `extra="forbid"`. Consider
   softening to `extra="ignore"` and emitting a WARNING on unknown keys
   for the first release, then tightening to `forbid` once metrics
   confirm zero unknown-key traffic. (Out-of-scope for this PR — flag
   so the on-call team has a rollback lever ready.)
5. **`existing.connected_accounts = connected_accounts_json`
   unconditionally overwrites.** Line 328 is a pre-existing behaviour,
   not a regression — but the merge philosophy of "preserve when
   incoming is missing" is *not* applied to `connected_accounts`. If a
   re-submission arrives without bank-account data and without a draft
   fallback (which the handler does try at lines 2062-2067), the column
   becomes `"{}"`. Pre-existing risk; flag as NOTE only because this PR
   advertises preservation.
6. **Sentinel-coerce log uses `→` (U+2192).**
   `backend/src/interface/schemas.py:130` and the `about.md` blueprint
   include the literal Unicode arrow `→`. Most production log
   aggregators (Cloud Logging, Datadog, ELK) handle UTF-8 fine, but
   some grep-based on-call scripts on legacy boxes can choke. Consider
   plain ASCII `->` for log-line robustness.
7. **Missing newline / trailing newline conventions.**
   `backend/src/infra/mysql/schema.py` (the new helper) ends without a
   trailing newline in some shell views; cosmetic only.
8. **Test deletes mutate `payload` in place.** At
   `backend/tests/interface/test_application_endpoint.py:294-297`, the
   `del payload[key]` calls mutate the dict returned by `build_payload()`
   — fine because `build_payload()` returns a fresh dict — but a future
   refactor that memoises the helper would silently corrupt sibling
   tests. Use `{**payload, "property_type": ...}`-style copies to be
   defensive.

### NOTE (Follow-up suggestions)
1. **Backfill existing `"not_provided"` rows.** The CHANGELOG note at
   `workspace/CHANGELOG.md:14` correctly states existing rows are NOT
   backfilled. Queue a one-off `UPDATE applications SET property_type
   = NULL WHERE property_type IN ('not_provided', 'N/A', '')` (etc.)
   so the dashboard renders consistently for legacy users too.
2. **Sentinel set is duplicated between schema and repo.**
   `backend/src/interface/schemas.py:77-79` and
   `backend/src/infra/mysql/housing_application_repository.py:33-35`
   both define `{"not_provided", "not provided", "n/a", "na", "none", ""}`
   independently. The plan acknowledges this (`plan.md:399-407`) but the
   redundancy invites drift. Promote the constant to a single shared
   location (e.g. `backend/src/domain/sentinels.py`) and import from
   both sites.
3. **`HousingApplication` dataclass field re-ordering.**
   `backend/src/domain/housing_application.py:13-17` moves `full_name`,
   `agree_policy`, `receive_updates` ahead of the optionals to satisfy
   dataclass-default ordering. Any external constructor relying on
   positional args will silently swap meanings. Search downstream
   callers; flag if any remain.
4. **MySQL `ALTER TABLE ... MODIFY COLUMN` per call holds
   metadata-lock for the duration.** Per-column inside its own
   `engine.begin()` (schema.py lines 269-275) means 10 sequential
   metadata locks rather than 1. At Lita's row count this is
   sub-second total, but consider batching: `ALTER TABLE applications
   MODIFY COLUMN phone VARCHAR(64) NULL, MODIFY COLUMN country
   VARCHAR(128) NULL, ...` is one DDL.
5. **`request.model_dump(exclude={"connected_accounts"})` does NOT
   exclude `metadata`.** Today the field-presence log only emits *keys*,
   so this is fine. If a future change ever logs the *values* (e.g. for
   debugging), `metadata.residence_permit_number` would leak PII. Add
   `metadata` to the exclude set defensively even though only keys are
   logged.

## On-call diagnosis check
**Adequate, with gaps.** If a 3am page fires for "submission rejected", the
on-call engineer has four breadcrumbs:
- `[sentinel-coerce] field=… sentinel=…` — coerced sentinel values.
- `[intake.field-presence] keys_total=… present=… nonempty=…` — what arrived.
- `[intake.merge] application_id=… overwritten=… preserved=…` — upsert
  decisions.
- `[intake.merge.preserve] application_id=… fields=…` — when prior values
  were defended.

Diagnostic flow:
1. grep `submit.intake` in Cloud Logging for the affected timestamp.
2. Cross-check `[intake.field-presence]` against the expected payload —
   missing keys point at the frontend; unexpected keys point at a stale
   bundle hitting `extra="forbid"`.
3. If the issue is "applicant data wiped on re-submit", look for
   `[intake.merge.preserve]` (defended) vs absence of it (overwritten).

**Gaps**:
- A 422 from `extra="forbid"` does NOT log under `submit.intake` —
  FastAPI's request-validation handler at `backend/src/main.py` (lines
  not changed by this PR) emits a different format. The on-call won't
  immediately know an unknown-key payload was the cause; they'll have
  to read raw FastAPI logs. Consider a small middleware that logs 422s
  under `submit.intake` too.
- The `[intake.field-presence]` log fires before the 400 short-circuits
  for missing email/full_name/agree_policy (see MAJOR #6). Without
  cross-referencing the response status, the engineer can't tell from
  the log alone whether the row was actually persisted.
- The runtime ALTER (MAJOR #5) has no test, so a typo or edge-case
  failure on the 10-column relax would only surface as `NOT NULL
  constraint failed: applications.country` errors at request time, with
  no `submit.intake` breadcrumb to explain the failure.

## Test coverage gaps
**Missing**:
- Negative merge case: meaningful incoming value DOES overwrite stale
  existing value (MAJOR #4).
- MySQL path of `ensure_application_legacy_nullable` (MAJOR #5).
- Phoneless re-submission collision regression (MAJOR #1) — currently
  no test exercises two POSTs with `phone: null` for the same
  `full_name` to confirm the resulting row count.
- Frontend test asserts `payload.metadata.residence_permit_number ===
  null` but does not assert the absence of any other implicit
  key (e.g. that `created_at` is still gone in BOTH `Object.keys`
  AND `Object.keys(payload.metadata)` — a future regression that
  put `created_at` inside `metadata` would silently pass).
- `[sentinel-coerce]` test only checks `property_type`; it does not
  confirm the `caplog` records do NOT include `email` or `full_name`
  (i.e. that the validator never coerces non-listed fields).

**Adequately tested**:
- Sentinel-string coercion happy path.
- Optional-fields acceptance (omit 5 keys).
- `extra="forbid"` rejection with detail visibility.
- Field-presence log emission on a minimal payload.
- Frontend `buildSubmissionPayload` — sentinel absence, null phone,
  null residence permit, no `created_at`.
- SQLite soft-no-op of the runtime ALTER (idempotency).

## Verdict justification
NEEDS_CHANGES. The core change is well-architected and the test additions
are targeted, but three items must be addressed before merge:
1. The `(full_name, phone)` idempotency regression (MAJOR #1) silently
   breaks the "merge preserves prior values" guarantee for phoneless
   users — the very promise the changelog advertises.
2. The undocumented `review_status` precedence flip (MAJOR #2) is an
   out-of-scope behavioural change that should be either reverted or
   called out in the CHANGELOG with a dedicated test.
3. The frontend `BackendApplication` type (MAJOR #3) lies about
   nullability and will let regressions land silently in the dashboard
   the next time a developer reads `application.phone.replace(...)`
   without a guard.
The remaining MAJOR items (test gaps, log-fire-before-400) are
addressable with small additions; the MINORs are polish. With those
fixes plus an answer on whether the `review_status` flip is intentional
scope creep, this PR can land cleanly.
