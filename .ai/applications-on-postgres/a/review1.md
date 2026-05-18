# Code Review — Round 1

## Verdict: NEEDS_CHANGES

## Summary

The cutover from MySQL to postgres for `applications`/`application_drafts` is well-scoped and the Phase 5 production gaps (permission errors, missing draft table, repo-level ALTERs polluting request sessions) were addressed cleanly. The dual-engine pattern is consistent across the 6 cross-engine endpoints and the FK-drops on the postgres side correctly account for cross-registry impossibility. Tests pass and runtime relaxation is now driven from `main.py` startup with a per-engine cache.

However, several real correctness, observability, and operational gaps remain that must be closed before we can ship to production:

1. The migration script's `ON CONFLICT (full_name, phone)` UPSERT is not idempotent when `phone IS NULL` (PostgreSQL treats nulls in unique-constraint columns as distinct under default `NULLS DISTINCT`). Re-running the migration with a NULL-phone row inserts duplicates.
2. The CHANGELOG / deploy preconditions miss the MySQL `users.application_id` FK drop that plan.md L302 explicitly calls out — a real FK in production MySQL would `IntegrityError` on every applicant credential write after cutover (postgres ids do not exist in MySQL `applications` post-cutover).
3. Cross-engine partial-failure observability is missing: when `_provision_applicant_credentials` fails after a successful postgres application write, the log line carries neither the postgres `application_id` nor a "dual-engine half-failed" breadcrumb — operators cannot correlate the orphaned row.
4. The `delete_draft_by_email` and the second `repository.get_by_id` reload after submit can leave the postgres session aborted (`25P02`) on a fresh deploy where `application_drafts` doesn't yet exist. Only the FIRST `get_draft_by_email` path was given the rollback fix; the symmetric DELETE / re-SELECT paths still pollute logs and waste a query.

The unit-test routing test only exercises dependency-wiring on a shared SQLite engine — useful for regressions but not proof of postgres routing. Phase 5's live E2E provides that proof; flag-only.

## Findings

### CRITICAL

(none — no data loss / security path identified)

### MAJOR

**M1. Migration UPSERT is not idempotent for NULL `phone`.**
File: `backend/src/scripts/migrate_mysql_applications_to_postgres.py:65-85`
Conflict target `(full_name, phone)` matches the postgres `uq_applications_full_name_phone` unique index. After the Phase 4a relaxation `phone` is nullable on postgres. PostgreSQL's default `NULLS DISTINCT` semantics mean rows with `phone = NULL` never collide on the unique constraint — so `ON CONFLICT (full_name, phone)` does not catch a duplicate run. Re-running the migration on a MySQL row whose `phone` is NULL would insert a fresh duplicate row each time (and the explicit `id` would then `IntegrityError` against the prior insert, but only because of the PK collision — not the `(full_name, phone)` conflict). The script's own docstring claim "Idempotent: re-running on the same data is a no-op" is false in this case.
Fix: either coalesce phone to a sentinel string in the conflict target (impossible without a partial unique index) or, more simply, switch to `ON CONFLICT (id) DO UPDATE` since the migration explicitly carries MySQL ids forward. That matches the actual idempotency key — a stable id — rather than a synthesized full_name+phone pair.

**M2. Missing deploy precondition: drop MySQL `users.application_id` FK.**
Files: `workspace/CHANGELOG.md` (Applications-on-postgres entry), `.ai/applications-on-postgres/a/plan.md:302` (precondition documented but never propagated to the operator-facing CHANGELOG).
`_provision_applicant_credentials` writes `users.application_id = <postgres_id>` on every submit (`http_endpoints.py:309-339`). If production MySQL has a real FK from `users.application_id → applications.id` (likely, since prior `Base.metadata.create_all` runs would have materialized it before the model was changed in this PR), the FK now references MySQL `applications` which is *no longer being written to*. Every post-cutover submit will `IntegrityError` on credential provisioning. The CHANGELOG mentions only the postgres SQL migration and the row-copy script — nothing about MySQL DDL. The operator runbook needs:
```sql
SHOW CREATE TABLE users\G
ALTER TABLE users DROP FOREIGN KEY <fk_name>;  -- if present
```
This must land in the CHANGELOG (or a deploy runbook) before merge.

**M3. Dual-engine partial-failure observability gap.**
File: `backend/src/interface/http_endpoints.py:2274-2278`
When `_provision_applicant_credentials(db, application)` raises (MySQL write fails after postgres write succeeded), the error log is:
```
logger.error("Failed to provision applicant credentials: %s", error)
```
No `application_id`, no `email`, no breadcrumb that correlates this to the just-committed postgres row. Operators investigating "applicant submitted but cannot log in" will not be able to find the orphaned application. Same gap exists at lines 2256-2261 (`sync_application_plaid_consents` failure swallowed without `application_id`). Phase 7a prompt #14 / #15 explicitly call this out. Suggested log line:
```
logger.error(
    "[dual-engine] application_id=%s postgres=ok mysql=failed (credentials): %s",
    getattr(application, "id", None), error,
)
```

**M4. Symmetric session-aborted gaps in `create_application`.**
File: `backend/src/interface/http_endpoints.py:2225-2243`
The Phase 5 fix added `application_db.rollback()` after the `get_draft_by_email` failure (L2156-2162), correctly addressing one path where a missing `application_drafts` table left the postgres session in `25P02 current transaction is aborted`. But the symmetric paths are still broken on the same fresh-deploy condition:
- L2225-2230: `repository.delete_draft_by_email(email)` against a missing table aborts the session — no rollback.
- L2233-2243: the immediately-following `repository.get_by_id(application.id)` runs on the aborted session and fails too (then logs "Failed to reload application" misleadingly — the actual cause is the prior aborted transaction).

Both cases are caught and the postgres `applications` write is already committed by `submit_housing_application`, so no data loss occurs. But operators will see double-logged tracebacks and the misleading "Failed to reload" line will dominate triage. Add a `rollback()` after each of those two `except` blocks, mirroring the pattern at L2160.

**M5. `_provision_applicant_credentials` never references the postgres-id mismatch risk.**
File: `backend/src/interface/http_endpoints.py:302-339`
The function still does `application_id=application.id` blindly. Even if M2 (FK drop) is enforced operationally, a single missed environment would silently `IntegrityError` per applicant. Consider catching the FK-violation explicitly and surfacing the operator action ("FK on users.application_id detected — apply DDL drop"). At minimum, add a startup check that probes MySQL information_schema for the FK and fails fast with a clear runtime error, the same way `ensure_postgres_applications_relaxed` warns about missing privileges.

### MINOR

**m1. Dead module-level state.**
File: `backend/src/infra/postgres/housing_application_repository.py:22-23`
`_SCHEMA_LOCK` and `_ENSURED_ENGINES` are declared at module scope but never read or written (the relax helper has its own copies in `infra/postgres/schema.py`). Remove to avoid future confusion.

**m2. Per-request introspection cost.**
File: `backend/src/infra/postgres/housing_application_repository.py:117-121`
Each `SQLAlchemyHousingApplicationRepository(...)` instantiation calls `inspect(engine).get_columns("applications")` to detect `review_status` support — that's an `information_schema` round-trip per HTTP request. The schema is fixed in production; cache the result on the engine (e.g., `_SUPPORTS_REVIEW_STATUS_CACHE: dict[int, bool]`) the same way Phase 5 introduced `_ENSURED_ENGINES`. Low-priority but easy win.

**m3. Submit-trace warnings logged at WARNING level.**
File: `backend/src/infra/postgres/housing_application_repository.py:69-72` and submit handler markers
The `_mark()` helper logs at `WARNING` (`_log.warning("[schema-trace] ...")`). These are tracing breadcrumbs, not warnings. They will pollute production warning-rate dashboards. Drop to DEBUG, or guard behind `if logger.isEnabledFor(logging.DEBUG)`.

**m4. Migration script: `update_set` may be empty when only `id`/`created_at` are present.**
File: `backend/src/scripts/migrate_mysql_applications_to_postgres.py:69-72`
The set-clause is built from `cols if c not in {"id", "created_at"}`. With the current `_COMMON_COLUMNS` list this is fine, but a future change that narrows columns could yield `ON CONFLICT ... DO UPDATE SET ` (empty) — a SQL syntax error. Add an assertion that `update_set` is non-empty before issuing the SQL.

**m5. CHANGELOG omits rollback impact.**
File: `workspace/CHANGELOG.md`
plan.md L15-16 documents the rollback (code-only revert is fine; ALTERs are forward-only but harmless). The CHANGELOG should mirror this, plus add a note that rolling-back the backend after live traffic has hit postgres leaves those rows invisible to MySQL-bound code (so any rollback should pair with re-running the data migration in reverse — or accepting the disappearance of post-cutover submissions until re-roll-forward).

**m6. Migration script `connected_accounts` cross-engine type assumption.**
File: `backend/src/scripts/migrate_mysql_applications_to_postgres.py:43`
The script copies `connected_accounts` as-is between engines. MySQL `TEXT` and postgres `TEXT` are compatible, but the column carries serialized JSON. If a MySQL row has been corrupted (non-UTF8 bytes via `latin1` collation), pg8000 will reject the bind. Add a defensive `try/except UnicodeDecodeError` around the per-row execute and log + skip the offending row.

### NOTE

**n1. The new postgres-routing tests prove dependency-wiring, not engine routing.**
File: `backend/tests/interface/test_application_postgres_routing.py`
Both `get_db` and `get_application_db` resolve to the same SQLite session in tests, so the assertion that "the row is in postgres" really only proves "the row is somewhere accessible via the SQLAlchemy `HousingApplicationModel` import path". The Phase 5 live E2E was the actual postgres routing proof. Acknowledged in the test docstring; this is the right trade-off, but the tests should be renamed to `test_application_routing_dependency_wiring.py` (or similar) to avoid future readers thinking they validate the engine flip.

**n2. 9 postgres-only schema columns ignored by ORM.**
File: `backend/src/infra/postgres/models.py:184-225`
The about.md notes that `date_of_birth, profession, current_employer, job_title, industry, website, linkedin, identifier, metadata jsonb` exist in postgres but aren't declared in the model. Verified: SELECT statements skip them (no behavioral change), INSERT defaults them to NULL. **As long as no production trigger requires non-null values for these columns, this is safe.** Confirmed via plan.md L33: "stay nullable on the DB and remain ignored by the model in this PR." Recommend a follow-up to add them to the model so dashboard/analytics integrations can read them.

**n3. Repository's `_fallback_application_from_row` and `_fallback_list_recent` are dead on the postgres path.**
File: `backend/src/infra/postgres/housing_application_repository.py:140-204`
On postgres `_supports_review_status` is always True (the column exists). The fallback path remains for SQLite test compat. Acceptable; flag as future cleanup.

**n4. `connected_accounts` JSON serialization happens at repo write time.**
File: `backend/src/infra/postgres/housing_application_repository.py:create()`
Persisted as `TEXT` (matching MySQL). Fine for now; consider migrating to `jsonb` in a follow-up so dashboard queries can index/path-extract.

## On-call diagnosis check

Imagine an operator gets paged with "applications submitted but applicants cannot log in".

- Does any single log line correlate the orphaned postgres row to the MySQL credential failure? **No** (M3). Operator must:
  1. Read the WARNING/ERROR feed — no `application_id` available in `_provision_applicant_credentials` failure log.
  2. Cross-reference postgres `applications` rows by timestamp to recently-attempted `users` writes on MySQL. Manual.
- Does any structured event (`application_created` SSE) carry a "credential provisioning failed" flag? **No** — the response includes `login_credentials=None`, but the published event swallows that nuance (L2295-2305).
- Is there a startup probe that asserts MySQL `users.application_id` has no FK before serving traffic? **No** (M5).

The on-call diagnosis is degraded compared to pre-PR (single-engine: `users.application_id` FK fired with both row ids visible).

## Test coverage gaps

1. **No test for the draft-load rollback path** (Phase 5 fix). A unit test that monkey-patches `repository.get_draft_by_email` to raise an arbitrary `OperationalError` and asserts that the subsequent submit succeeds AND `application_db.rollback()` was called would lock in the M4 fix surface area.
2. **No test for symmetric `delete_draft_by_email` failure** (M4). Same shape as #1 but covers the after-submit cleanup path.
3. **No integration test asserting that applicant credentials are written to MySQL `users` AND application_db row references the postgres id**. The Phase 5 live E2E covered this once but it isn't in CI. A test using the conftest's shared SQLite engine (where both bases live) would catch a future regression where someone accidentally swaps `db` and `application_db` in the submit handler.
4. **No test for the migration script.** Even a dry-run-mode test that constructs an in-memory postgres-flavoured engine (or just asserts the SQL string shape) would catch the M1 regression and the m4 empty-`update_set` foot-gun.
5. **No test for missing `application_drafts` recovery.** Drop the table on the conftest engine and assert the submit endpoint still returns 201 — that's the single most production-relevant scenario uncovered by the existing suite.

## Verdict justification

Three MAJOR findings (M1 idempotency, M2 deploy precondition, M3 observability) and one (M4) that re-opens the same Phase 5 class of bug on adjacent paths. Each is a real production failure mode under realistic conditions:

- M1 fires on any second migration-script run with NULL-phone rows; operators are likely to re-run during cutover validation.
- M2 fires on the very first post-cutover applicant submit if the existing MySQL FK is real (high probability — the prior `Base.metadata.create_all` runs would have created it).
- M3 makes M2's failure mode invisible.
- M4 turns every fresh-deploy submit into a 6-line traceback chain in the logs (with one misleading line) until the operator runs the SQL migration.

None are unfixable; estimated total fix effort is ~2 hours. Recommend the team apply M1–M4 and re-submit for review.

Recommendation: **apply fixes then re-review.**
