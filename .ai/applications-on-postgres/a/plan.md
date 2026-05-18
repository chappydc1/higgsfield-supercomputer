# applications-on-postgres — Implementation Plan

All paths absolute from worktree root `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/zen-solomon-13f3f4`. Every file:line reference below was verified on disk during planning.

## Status
Phases: 7
- [ ] Phase 4a — DB layer: postgres applications relaxation + ORM move
- [ ] Phase 4b — Repository relocation (postgres-bound)
- [ ] Phase 4c — Dependency switch (16 endpoint sites + open_banking helper)
- [ ] Phase 4d — Cross-engine read helper safety (`_resolve_application_metadata` + 5 dual-repo endpoints)
- [ ] Phase 4e — Test fixtures + 2 new tests
- [ ] Phase 4f — Data migration script
- [ ] Phase 4g — CHANGELOG + about.md + deploy preconditions

## Rollback Plan
If submit fails after deploy, revert the backend deploy (code-only rollback restores `Depends(get_db)` on all 16 sites). Postgres ALTER COLUMN ... DROP NOT NULL is forward-only but harmless (re-adding NOT NULL would require a backfill); FK drops on `customer_applicants_application_id_fkey` and `open_banking_consents_application_id_fkey` are reversible via `ADD CONSTRAINT` once data is consistent.

## Deploy preconditions checklist
- [ ] Apply `backend/migrations/postgres/001_relax_applications.sql` against Cloud SQL postgres (10 DROP NOT NULL + 2 DROP CONSTRAINT IF EXISTS), or run `ensure_postgres_applications_relaxed(tx_engine)` once at backend startup (Phase 4a wires both).
- [ ] Run `python -m backend.scripts.migrate_mysql_applications_to_postgres` once on a tagged build BEFORE traffic flips. Verify `psql -c "SELECT count(*) FROM applications"` matches `MAX(id) + sequence skip` and prints non-zero `setval` result.
- [ ] After verification, deploy the new backend revision. The first request after deploy hits postgres for application reads/writes.
- [ ] No `cloudbuild.yaml` change required — `backend/cloudbuild.yaml:22-23` already exposes `POSTGRES_*` env vars (PR #144).

---

## Phase 4a — DB layer: postgres relax + ORM move

### Files to touch
- `backend/src/infra/postgres/database.py` (verified — has `TxBase = declarative_base()` at L6).
- `backend/src/infra/postgres/models.py` (verified — currently 5 canonical models at L29-181).
- `backend/src/infra/mysql/models.py` (verified — `HousingApplicationModel` at L54-84, `ApplicationDraftModel` at L299-309). Replace inline class bodies with re-exports from postgres.
- `backend/src/infra/postgres/schema.py` (NEW). Mirrors the helper pattern in `backend/src/infra/mysql/schema.py:131-232` (`ensure_application_legacy_nullable`).
- `backend/migrations/postgres/001_relax_applications.sql` (NEW; `backend/migrations/postgres/` directory does not yet exist — verified `ls backend/migrations/postgres` returns "No such file or directory").

### Steps
1. Add `HousingApplicationModel` and `ApplicationDraftModel` to `backend/src/infra/postgres/models.py`, bound to `TxBase`. Schema bytes-for-bytes match `backend/src/infra/mysql/models.py:54-84` and L299-309 — same column names, same nullability (post-#143), same `UniqueConstraint("full_name", "phone", name="uq_applications_full_name_phone")`. Ignore postgres-only extras (`date_of_birth`, `profession`, `current_employer`, `job_title`, `industry`, `website`, `linkedin`, `identifier`, `metadata jsonb`) — out of scope per prompt.
2. In `backend/src/infra/mysql/models.py`, replace the inline `class HousingApplicationModel(Base): ...` (L54-84) and `class ApplicationDraftModel(Base): ...` (L299-309) bodies with a re-export shim that imports from `src.infra.postgres.models`. Mirror the existing canonical re-export at L23-29 of `mysql/models.py`. Legacy callers (`from src.infra.mysql.models import HousingApplicationModel`) keep working.
3. Create `backend/src/infra/postgres/schema.py` with `ensure_postgres_applications_relaxed(engine: Engine) -> None`:
   - On `engine.dialect.name == "postgresql"` only — soft no-op on `sqlite`/`mysql`.
   - Inspects `information_schema.columns` for `applications` columns. For each of `phone, country, property_type, purchase_intent, budget_range, savings, income, income_currency, employment_status, financing_consent`, if `is_nullable = 'NO'`, run `ALTER TABLE applications ALTER COLUMN <col> DROP NOT NULL`.
   - Then issues `ALTER TABLE customer_applicants DROP CONSTRAINT IF EXISTS customer_applicants_application_id_fkey` and `ALTER TABLE open_banking_consents DROP CONSTRAINT IF EXISTS open_banking_consents_application_id_fkey`.
   - Idempotent: re-running is a no-op. Pattern mirrors `ensure_application_legacy_nullable` (`backend/src/infra/mysql/schema.py:193-232`) but uses `ALTER COLUMN ... DROP NOT NULL` (postgres dialect) instead of `MODIFY COLUMN ... NULL` (MySQL).
   - Logs each ALTER it runs at INFO level; logs skips at DEBUG.
4. Create `backend/migrations/postgres/001_relax_applications.sql` containing the 10 `ALTER TABLE applications ALTER COLUMN <col> DROP NOT NULL` statements and the 2 `ALTER TABLE ... DROP CONSTRAINT IF EXISTS ...` statements. Postgres-dialect SQL with `IF EXISTS` guards on the constraint drops; the column drops are inherently idempotent (re-running a `DROP NOT NULL` on an already-nullable column is a no-op).
5. Wire `ensure_postgres_applications_relaxed(tx_engine)` into `backend/src/main.py` startup, alongside the existing MySQL ensure_* calls at `backend/src/main.py:45-46`. Guard with `if tx_engine is not None:` (production-safe; local dev without postgres still boots). This makes the helper run once per process, not per request.

### Acceptance criteria
- `python -c "from src.infra.postgres.models import HousingApplicationModel; print(HousingApplicationModel.__tablename__)"` prints `applications`.
- `python -c "from src.infra.mysql.models import HousingApplicationModel as M; from src.infra.postgres.models import HousingApplicationModel as P; assert M is P"` passes (same class via re-export).
- After running `ensure_postgres_applications_relaxed` against a freshly-restored postgres `applications` schema (NOT NULL legacy columns), `\d applications` shows all 10 columns nullable and the 2 FKs gone.
- Re-running the helper a second time logs "already nullable" debug lines and issues 0 ALTERs.
- `pytest backend/tests/infra/test_housing_application_repository.py -x` passes (after Phase 4e fixture changes).

### Risks
- `TxBase` is a separate declarative metadata from `Base`, so any code that does `Base.metadata.create_all` will no longer create `applications`. Confirmed only `backend/tests/conftest.py:33,38` and `backend/src/main.py:36-39` call `metadata.create_all`. `main.py:36-39` runs `Base.metadata.create_all(bind=engine)` against MySQL; the MySQL `applications` table already exists in production (legacy) so the missing CREATE is irrelevant. Tests are addressed in Phase 4e.
- Postgres `applications.created_at` is `timestamp WITHOUT time zone` (per context.md L127). The model declares `DateTime(timezone=True)`. pg8000 accepts naive datetimes — no behavior change. Document but do not fix in this PR.

---

## Phase 4b — Repository relocation (postgres-bound)

### Files to touch
- `backend/src/infra/mysql/housing_application_repository.py` (verified, 668 lines). Will be replaced with a re-export shim.
- `backend/src/infra/postgres/housing_application_repository.py` (NEW). Receives the moved class.
- Importers (verified by grep):
  - `backend/src/interface/http_endpoints.py:69` — `from src.infra.mysql.housing_application_repository import SQLAlchemyHousingApplicationRepository`
  - `backend/src/interface/open_banking_endpoints.py:23` — same import
  - `backend/src/scripts/check_applications_db.py:12,41`
  - `backend/src/scripts/clear_housing_applications.py:9-10,51`
  - Several test files under `backend/tests/`
  All keep the `from src.infra.mysql.housing_application_repository import ...` path through the re-export shim.

### Steps
1. Move the entire body of `backend/src/infra/mysql/housing_application_repository.py` to `backend/src/infra/postgres/housing_application_repository.py`. Same file, just relocated.
2. In the moved file, change the `_ensure_schema_columns` method (currently L73-120 in the old file) so it:
   - Skips the MySQL-flavoured `ensure_application_*_column` and `ensure_application_legacy_nullable` calls (L95-103 of current file).
   - On a postgres dialect engine, calls the new `ensure_postgres_applications_relaxed(engine)` from `src.infra.postgres.schema` (Phase 4a).
   - On a sqlite dialect engine (tests), keeps the existing soft no-op behavior — the SQLite branch in `ensure_application_legacy_nullable` (L204-232) is the existing precedent.
   - Drop the imports of the MySQL `ensure_*` helpers (L21-26 in current file).
   - Remove `_legacy_applications_table_mode` and the `applicants` table fallback path (L110-116 in current file) — the postgres deploy always has the `applications` table.
3. Replace `backend/src/infra/mysql/housing_application_repository.py` with a minimal re-export:
   ```python
   from src.infra.postgres.housing_application_repository import (  # noqa: F401
     SQLAlchemyHousingApplicationRepository,
     _is_meaningful,
     _LEGACY_SENTINELS,
   )
   ```
   Mirrors the canonical re-export pattern from PR #144.
4. The repository constructor signature stays `__init__(self, session: Session)` — no signature change. Callers pass whichever session they want; Phase 4c flips them to TxSessionLocal-backed sessions.

### Acceptance criteria
- `from src.infra.mysql.housing_application_repository import SQLAlchemyHousingApplicationRepository` continues to work at runtime (re-export proven).
- Constructing `SQLAlchemyHousingApplicationRepository(TxSessionLocal())` against a real postgres `applications` table succeeds (no MySQL-only `ensure_application_archived_column` etc. is called).
- `pytest backend/tests/infra/test_housing_application_repository.py -x` passes (the existing 4 tests use a SQLite session — the SQLite branch must remain a no-op for both ensure paths).

### Risks
- The schema-trace logging at L73-120 currently calls `ensure_application_*` then `_detect_review_status_column`. The detect call (L105-108) issues `SELECT * FROM applications LIMIT 1 ... WHERE 1=0` to introspect — this is engine-agnostic and works on postgres. No change needed to that helper.
- `_fallback_application_from_row` (L139-167) — used only when `_supports_review_status` is False. On postgres the column always exists, so `_supports_review_status` will resolve to True via the introspection check; the fallback path is dead code on the new path but kept for SQLite test compat. Acceptable — out of scope to remove.
- `repository.create` (L266-401) persists `connected_accounts` as `json.dumps(...)` into the `TEXT` column on postgres (column type `text`, verified). pg8000 accepts string -> text seamlessly. No driver-specific change.

---

## Phase 4c — Dependency switch (16 endpoint sites + open_banking helper)

### Files to touch
- `backend/src/config/database.py` (verified — `tx_engine` and `TxSessionLocal` at L194-263; `get_tx_db` at L255-263).
- `backend/src/interface/http_endpoints.py` (16 sites verified by grep — see table below).
- `backend/src/interface/open_banking_endpoints.py:139-142` (`get_housing_repository` helper).

### Verified call-site table (`grep -nE "SQLAlchemyHousingApplicationRepository\(db\)" backend/src/interface/http_endpoints.py`):

| File:Line | Endpoint | `db` also used for non-application repo? |
|---|---|---|
| `http_endpoints.py:1589` | `_load_housing_applications` helper (called by list endpoints) | No |
| `http_endpoints.py:1980` | `POST /v1/applications/send-login-email` | **Yes** — passes `db` to `_provision_applicant_credentials` (which uses `SQLAlchemyUserRepository(db)` → MySQL) |
| `http_endpoints.py:2145` | `POST /v1/applications` (submit) | **Yes** — `SQLOpenBankingConsentRepository(db)` at L2238, `_provision_applicant_credentials(db, ...)` at L2265 |
| `http_endpoints.py:2317` | `POST /v1/applications/draft` | No |
| `http_endpoints.py:2350` | `GET /v1/applications/draft` | No |
| `http_endpoints.py:2419` | `GET /v1/applications/lookup` | No |
| `http_endpoints.py:2442` | `DELETE /v1/applications` (delete_all) | No |
| `http_endpoints.py:2467` | `POST /v1/applications/{id}/archive` | No |
| `http_endpoints.py:2505` | `GET /v1/applications/{id}` | No |
| `http_endpoints.py:2623` | `GET /v1/applications/{id}/credit-score` | **Yes** — `SQLBankDataSnapshotRepository(db)` at L2632, `SQLCreditScoreRepository(db)` at L2633 (MySQL) |
| `http_endpoints.py:2966` | `GET /v1/applications/{id}/account-balances` | **Yes** — `SQLBankDataSnapshotRepository(db)` at L2972 |
| `http_endpoints.py:3008` | `GET /v1/applications/{id}/transactions` | **Yes** — `SQLBankDataSnapshotRepository(db)` at L3045 |
| `http_endpoints.py:3087` | `GET /v1/applications/{id}/payment-history` | **Yes** — `SQLOpenBankingConsentRepository(db)` at L3106 |
| `http_endpoints.py:3130` | `GET /v1/applicants/{id}/account-coverage` | No |
| `http_endpoints.py:3178` | `GET /v1/applicants/{id}/dummy-account-indicators` | No |
| `http_endpoints.py:3251` | `POST /v1/applications/{id}/decision` | No |

### Steps
1. Add `get_application_db` to `backend/src/config/database.py`, immediately after `get_tx_db` (L255-263):
   ```python
   def get_application_db():
       """Yield a postgres session for the applications/application_drafts tables.

       After applications-on-postgres cutover, all reads/writes of HousingApplicationModel
       and ApplicationDraftModel route through this dependency.
       """
       if TxSessionLocal is None:
           raise RuntimeError("Postgres engine not configured; set POSTGRES_* env vars.")
       db = TxSessionLocal()
       try:
           yield db
       finally:
           db.close()
   ```
2. In `backend/src/interface/http_endpoints.py`, for each of the 16 sites in the table:
   - **Single-engine sites** (no `Yes` in the right column — 9 sites: 1589 (its caller), 2317, 2350, 2419, 2442, 2467, 2505, 3130, 3178, 3251): change the function signature parameter from `db: Session = Depends(get_db)` to `db: Session = Depends(get_application_db)`. Note: line 1589 is inside `_load_housing_applications`, whose `db` parameter is forwarded by callers — those callers (the route handlers at L2380 (list) and any other) need their own `Depends(get_application_db)`. Concretely the route handler around L2367-2410 calls `_load_housing_applications(db, ...)` so flipping the route's dependency suffices.
   - **Dual-engine sites** (7 sites: 1980, 2145, 2623, 2966, 3008, 3087): add a SECOND parameter alongside the existing `db`:
     ```python
     def endpoint(
         ...,
         db: Session = Depends(get_db),                       # MySQL: snapshot/consent/user repos
         application_db: Session = Depends(get_application_db),  # postgres: HousingApplicationRepository
         ...
     ):
         repository = SQLAlchemyHousingApplicationRepository(application_db)
         ...
         snap_repo = SQLBankDataSnapshotRepository(db)  # unchanged
     ```
     The constructor on the existing `db: Session` line stays MySQL-bound. Only the application repository swaps to `application_db`. This pattern keeps the cross-engine repos (snapshot, consent, user, credit-score) on MySQL and isolates the postgres session.
   - For the `submit` (2145) and `send-login-email` (1980) endpoints in particular: `_provision_applicant_credentials(db, application)` keeps `db` (MySQL — the `users` table). Internally it does NOT need the postgres application id to live in MySQL `users.application_id` because the `users.application_id` column is plain `INTEGER NULL` (per context.md L210; `schema.py:175-190`). Verify the live MySQL `users` table has no FK constraint on `application_id` — covered in Phase 4g preconditions.
3. In `backend/src/interface/open_banking_endpoints.py`, change `get_housing_repository` (L139-142) to depend on `get_application_db`:
   ```python
   def get_housing_repository(
       application_db: Session = Depends(get_application_db),
   ) -> SQLAlchemyHousingApplicationRepository:
       return SQLAlchemyHousingApplicationRepository(application_db)
   ```
   Also add the `from src.config.database import get_application_db` import at the top. The existing `get_repository` for `SQLOpenBankingConsentRepository` (L135-136) keeps `Depends(get_db)` (MySQL — open_banking_consents stays on MySQL per scope).
4. Routes that consume `get_housing_repository` (`open_banking_endpoints.py:210, 461`) need no change — the dependency wrapper does the swap.
5. Routes 553 and 589 in `open_banking_endpoints.py` use `Depends(get_db)` directly without `SQLAlchemyHousingApplicationRepository` — they stay MySQL.

### Acceptance criteria
- `grep -nE "SQLAlchemyHousingApplicationRepository\((db|application_db)\)" backend/src/interface/http_endpoints.py` shows every site uses `application_db` (or — for endpoints kept dual-engine — was renamed). Concretely: every `SQLAlchemyHousingApplicationRepository(...)` argument is bound to a postgres session.
- `grep -nE "Depends\(get_db\)" backend/src/interface/http_endpoints.py` no longer matches the 9 single-engine sites listed above (they now read `Depends(get_application_db)`); the dual-engine sites STILL match because they retain a MySQL `db` for snapshot/consent/user repos.
- The submit endpoint (`POST /v1/applications`) creates a row in postgres (`SELECT count(*) FROM applications` increments) and a corresponding MySQL `users` row with `application_id` = the postgres id.
- Backend boots locally without postgres (set `POSTGRES_*` empty): `get_application_db` raises `RuntimeError` only when an application endpoint is hit. Other endpoints continue to work.

### Risks
- The submit endpoint at line 2145 passes `db` (now MySQL) to `_provision_applicant_credentials`. The function internally hits MySQL `users` — keep as-is. No `application_db` use inside `_provision_applicant_credentials`.
- `_load_housing_applications` (L1582) is called from multiple route handlers — verify all callers' Depends. Search: `grep -n "_load_housing_applications" backend/src/interface/http_endpoints.py` — the function takes `db: Session` as its first arg. All callers receive `db` from their `Depends(...)` and pass it. The caller route handlers must be the ones flipped to `Depends(get_application_db)`.
- Tests that override `app.dependency_overrides[get_db]` (`conftest.py:70`) must also override `get_application_db` to point at the same shared SQLite session — see Phase 4e.

---

## Phase 4d — Cross-engine read helper safety

Per the prompt, `_resolve_application_metadata` was flagged as joining `applications` with `bank_data_snapshots`. Verified by reading `backend/src/interface/http_endpoints.py:1039-1086`: it does NOT touch `bank_data_snapshots` — it calls SaltEdge HTTP via `_collect_saltedge_customers()` (L879, network only). Therefore `_resolve_application_metadata` is engine-agnostic by construction; **no change needed**.

The actual cross-engine concern lives in the **5 dual-engine endpoints** identified in the Phase 4c table (1980, 2145, 2623, 2966, 3008, 3087). They are addressed by the dual-parameter pattern in Phase 4c step 2.

### Files to touch
None directly under this phase — verification only.

### Steps
1. Re-read `_resolve_application_metadata` (`http_endpoints.py:1039-1086`) and confirm zero DB calls. (Verified during planning.)
2. Re-read `_bulk_canonical_transaction_summary` (`http_endpoints.py:1246-1306`) — it already opens its own `TxSessionLocal()` at L1270 and is idempotent across engine setups. **No change.**
3. Re-read `_application_to_response` (`http_endpoints.py:1309-1374`) — pure transformation, no DB calls. **No change.**
4. Verify the `SQLOpenBankingConsentRepository(db)` use inside the submit endpoint (L2238) and payment-history endpoint (L3106) — both stay bound to MySQL `db`. No change because Phase 4c keeps `db` MySQL on dual-engine endpoints.
5. Verify the `SQLBankDataSnapshotRepository(db)` use inside credit-score (L2632), account-balances (L2972), transactions (L3045) — all stay MySQL via the dual-engine pattern.

### Acceptance criteria
- A submit (`POST /v1/applications`) writes one row to postgres `applications` AND one row to MySQL `users` AND syncs MySQL `open_banking_consents` from any provided Plaid tokens — all in one request.
- A read (`GET /v1/applications/{id}/account-balances`) returns balances for an application stored on postgres, sourced from MySQL `bank_data_snapshots`. The 200 response payload is unchanged from pre-PR.

### Risks
- If a future caller adds a JOIN between `applications` and `bank_data_snapshots` in a single SQL query (instead of two separate repository calls), this PR breaks it. No such caller exists today — verified by grep.

---

## Phase 4e — Test fixtures + 2 new tests

### Files to touch
- `backend/tests/conftest.py` (verified, 106 lines).
- `backend/tests/interface/test_application_endpoint.py` — verify only; should not need source changes if conftest is correct.
- `backend/tests/interface/test_application_postgres_routing.py` (NEW). Houses the 2 new tests.

### Steps
1. Update `backend/tests/conftest.py`:
   - Add `from src.infra.postgres.database import TxBase` next to the existing `from src.infra.postgresql.database import Base as PgBase` at L8.
   - Add `from src.config.database import get_application_db` next to L7 (`get_db`).
   - Inside the `test_db` fixture (L29-43), after `Base.metadata.drop_all(...)` and `PgBase.metadata.drop_all(...)`, add `TxBase.metadata.drop_all(bind=test_engine)`. After the corresponding `create_all` calls, add `TxBase.metadata.create_all(bind=test_engine)`. Also add `from src.infra.postgres import models as _tx_models  # noqa: F401` next to the existing `_pg_models` import.
   - Inside the `client` fixture (L58-105), in addition to `app.dependency_overrides[get_db] = override_get_db` (L70), add `app.dependency_overrides[get_application_db] = override_get_db`. The same SQLite session backs both — fine because SQLite has no per-engine schema separation and both bases now create the same tables on the same engine.
2. Run the existing test suite to verify nothing regresses:
   ```bash
   pytest backend/tests/ -x --tb=short
   ```
   Expected: all 357 tests pass. Likely caught issues: SQLite cannot enforce postgres-style `JSONB` — the `metadata jsonb` column is OUT OF SCOPE (model doesn't include it), so this is moot.
3. Add `backend/tests/interface/test_application_postgres_routing.py` with 2 new tests:
   - `test_application_submit_persists_to_postgres(client, test_session)`: POST `/api/v1/applications` with a valid sample payload; query `test_session` (which is bound to the shared in-memory engine acting as both bases) for `HousingApplicationModel` and assert exactly one row was inserted with the expected `email` and `full_name`. Asserts that the dependency override is wired correctly through `get_application_db`.
   - `test_list_applications_reads_from_postgres(client, test_session)`: pre-seed two `HousingApplicationModel` rows directly via `test_session` with distinct `created_at`. GET `/api/v1/applications`; assert the response payload contains exactly those two rows and the order is `created_at DESC` (matching `list_recent` at `housing_application_repository.py:439-467`).

### Acceptance criteria
- `pytest backend/tests/ -x` reports the previous green count + 2 new tests, all passing.
- `pytest backend/tests/interface/test_application_postgres_routing.py -v` shows both new tests pass.
- `pytest backend/tests/infra/test_housing_application_repository.py -x` continues to pass (4 existing tests).

### Risks
- The `client` fixture (`conftest.py:59`) registers an admin user via `/api/auth/register` (L78-86). Auth endpoints write `users` rows on the MySQL `Base`. Both `Base` and `TxBase` now share the same SQLite engine, but the `users` table is on `Base` only. SQLite has no schema separation — `users` is created once and lives at the engine level. Confirmed via inspection: no name collision between `Base` and `TxBase` tables.

---

## Phase 4f — Data migration script

### Files to touch
- `backend/scripts/migrate_mysql_applications_to_postgres.py` (NEW; `backend/scripts/` exists and is verified).

### Steps
1. Create the script with a `main()` entrypoint:
   - Imports `engine` (MySQL) and `tx_engine, TxSessionLocal` from `src.config.database`.
   - Imports `HousingApplicationModel` from `src.infra.postgres.models`.
   - Asserts both engines are configured (`tx_engine is not None`); aborts with a clear message otherwise.
   - Opens `SessionLocal()` against MySQL and `TxSessionLocal()` against postgres in two separate context managers.
   - Streams MySQL `applications` rows in chunks of 200 (raw `SELECT *` to avoid coupling to ORM column lists).
   - For each MySQL row, builds an UPSERT on the postgres engine using the `INSERT ... ON CONFLICT (full_name, phone) DO UPDATE` SQL (matching the unique constraint `uq_applications_full_name_phone`). Only writes columns common to both schemas (the 20 columns listed in `context.md` §3, excluding the 9 postgres-only extras `date_of_birth`, `profession`, `current_employer`, `job_title`, `industry`, `website`, `linkedin`, `identifier`, `metadata`).
   - Preserves the original `id` from MySQL by including it in the INSERT (postgres allows explicit id assignment when the sequence default isn't relied on).
   - After the loop, `SELECT setval('applications_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM applications), 0), nextval('applications_id_seq') - 1), true)`. Wrapping with `setval('applications_id_seq', (SELECT COALESCE(MAX(id), 0) FROM applications))` is sufficient and idempotent.
   - Logs `"[migrate] copied N rows; setval -> M"`.
   - Idempotent: re-running on the same data is a no-op (every row is an UPSERT; the sequence converges).
2. Add a `--dry-run` flag that prints the would-be SQL for each row without committing.
3. Add `if __name__ == "__main__": main()` so the script runs as `python -m backend.scripts.migrate_mysql_applications_to_postgres`.

### Acceptance criteria
- `python -m backend.scripts.migrate_mysql_applications_to_postgres --dry-run` against staging prints N "would upsert" lines and exits 0 without writing.
- `python -m backend.scripts.migrate_mysql_applications_to_postgres` (no flag) writes rows and prints `[migrate] copied 1 rows; setval -> 11` (or matching counts).
- Re-running the script writes 0 NEW rows (UPSERT no-ops) and prints `[migrate] copied 1 rows; setval -> 11` again.
- Postgres `SELECT id, email FROM applications ORDER BY id` includes id=1 (Tobias migrated from MySQL) plus the existing ids 2, 3, 9, 10. (If postgres already has id=10 = `tobias@tobiasa.com` from prior testing, the conflict update merges fields.)

### Risks
- If MySQL has a row with a postgres-id collision on a different `(full_name, phone)`, the explicit-id INSERT fails. Mitigation: the script logs the offending row and skips it. Operator should review the log; in practice, the MySQL prod database has only id=1 today (per `about.md` L46), so collision risk is low.
- The `connected_accounts` column is `TEXT` on both sides — the script copies the raw string, no JSON re-serialisation needed.

---

## Phase 4g — CHANGELOG + about.md + deploy preconditions

### Files to touch
- `CHANGELOG.md` (verify path; add entry).
- `.ai/applications-on-postgres/a/about.md` (verified, 68 lines).
- `backend/cloudbuild.yaml` — **read-only**. Verified L22-23 already wires `POSTGRES_*` env vars.

### Steps
1. Append a CHANGELOG entry under the current unreleased section:
   ```
   ## applications-on-postgres
   - The `applications` and `application_drafts` tables now live on Cloud SQL postgres (`lita-ehousing`).
   - One-time data migration: `python -m backend.scripts.migrate_mysql_applications_to_postgres` after applying `backend/migrations/postgres/001_relax_applications.sql`.
   - MySQL `applications` table remains as a fallback for one release; future PR will decommission.
   - No infra change to `cloudbuild.yaml`; `POSTGRES_*` env vars from PR #144 are reused.
   ```
2. Update `.ai/applications-on-postgres/a/about.md`:
   - Mark the cutover phases done.
   - Note the dual-engine pattern adopted in 7 endpoints (the 7 sites in Phase 4c step 2).
   - Note the 2 new tests added.
   - Note that decommissioning MySQL `applications` is deferred to a follow-up PR.
3. Document the deploy preconditions in the repo's deploy runbook (or in CHANGELOG if no runbook exists):
   - Apply `backend/migrations/postgres/001_relax_applications.sql` against postgres.
   - Run the one-time migration script.
   - On MySQL, `SHOW CREATE TABLE users\G` and `ALTER TABLE users DROP FOREIGN KEY <fk_name>` IF a real FK exists on `application_id` (per `context.md` §8 / §10). The schema-ensure path (`backend/src/infra/mysql/schema.py:175-190`) declares it as plain `INTEGER NULL`, but if a prior `Base.metadata.create_all` materialised the FK, drop it.
   - Deploy backend.
   - Smoke-test `GET /api/v1/applications` and a fresh `POST /api/v1/applications` from the UI.

### Acceptance criteria
- `CHANGELOG.md` entry committed with a link to this plan.
- `about.md` updated to reflect "implemented" state of the listed phases.
- The deploy preconditions appear in the same commit as the CHANGELOG so the operator can run them in order.

### Risks
- If MySQL `users.application_id` has a real FK and the operator forgets to drop it, the next `_provision_applicant_credentials` call after deploy fails with `IntegrityError` on a FK referencing the non-existent postgres id in MySQL. The pre-flight check in deploy preconditions guards this.

---

## Cross-Phase Notes

### Sequencing
4a alone first (sets up `TxBase` registration + the relax helper + the SQL file). 4b can land after 4a (the moved repository imports the new ensure helper). 4c after 4b (it depends on the relocated repo and the new dependency in `database.py`; technically only the new dependency in `config/database.py` blocks 4c). 4d is verification-only — runs in parallel with 4b/4c since it touches no files. 4e can run after 4b (test fixtures need to import the relocated model). 4f can run after 4a (only depends on the postgres model existing under `TxBase`). 4g last — depends on everything else for the CHANGELOG to be accurate.

### Concurrency safety
- `ensure_postgres_applications_relaxed` runs once at boot, guarded by the same `_SCHEMA_LOCK` used in `housing_application_repository.py:27`. Re-using the lock prevents concurrent ALTERs from two backend workers.
- The dual-parameter endpoints (Phase 4c) run two SQLAlchemy sessions per request: one MySQL, one postgres. Both close in the FastAPI lifecycle. No transactional coordination needed because the two writes (postgres `applications` + MySQL `users`) are not strictly required to be atomic — `_provision_applicant_credentials` already runs after `submit_housing_application` in submit flow (`http_endpoints.py:2172, 2265`) and is wrapped in a try/except that logs failures (L2266-2268) without rolling back the postgres write. This matches the pre-PR behavior on a single MySQL engine: a partial failure leaves the application without credentials, never the reverse.
- The 4f migration script holds two long-lived sessions; OK because it runs once during cutover, not at request time.

### Test database semantics
- Both `Base` and `TxBase` create their tables in the SAME SQLite engine (`sqlite:///./test.db`). Table names do not collide: `applications`, `application_drafts` are on `TxBase` only; `users`, `customer_applicants`, `applicants`, `phone_applications`, `bank_data_snapshots`, `tokens`, `customers`, etc. stay on `Base`. Verified by inspecting `backend/src/infra/mysql/models.py:31-545` vs the new `infra/postgres/models.py` adds.
- The test client's dependency override binds both `get_db` and `get_application_db` to the same SQLite session — no integration friction for the test suite.

---

## Parallelization
- Round 1: 4a alone (sets up `TxBase` and `ensure_postgres_applications_relaxed`).
- Round 2: 4b + 4d in parallel (4b moves the repo; 4d is read-only verification).
- Round 3: 4c alone (large surface area — 16 endpoint sites + 1 helper).
- Round 4: 4e + 4f in parallel (tests + migration script — independent files).
- Round 5: 4g (CHANGELOG + about.md + deploy preconditions).

## Assessed: yes
