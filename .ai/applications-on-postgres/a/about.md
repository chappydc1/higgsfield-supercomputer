# applications-on-postgres — Project Blueprint

## Mission
Move the **`applications`** table (and its drafts) from self-hosted MySQL 8.0.31 (docker container, ephemeral `db_data` volume on a VM) to the durable **Cloud SQL postgres `lita-ehousing`** instance that PR #144 already attached. Every submission to `POST /api/v1/applications` and every read of `GET /api/v1/applications` will hit postgres after this change. The MySQL container stays running as a fallback for the rest of the operational schema (`users`, `customer_sessions`, billing, scoring, transunion, etc.) — only the application-intake closure migrates.

The pain solved: live submissions persist forever instead of "resetting" every time the docker volume is rebuilt or the VM is rotated.

## Final Architecture

### Backend dual-engine reuse
- Reuse the existing `tx_engine` / `TxSessionLocal` / `TxBase` from PR #144 (`backend/src/config/database.py:194-263`, `backend/src/infra/postgres/database.py:1-7`). No new engine plumbing.
- Define a new alias `applications_engine = tx_engine` (or pass `TxSessionLocal()` directly) and a new dependency `get_application_db()` that yields a postgres session, mirroring `get_db()` (mysql) and `get_tx_db()` (postgres).
- `HousingApplicationModel` moves from `Base` to `TxBase` (re-exported from `infra/postgres/models.py`, kept importable from `infra/mysql/models.py` for legacy callers — same trick as the canonical models).
- `ApplicationDraftModel` also moves to postgres (drafts are written from the same submit endpoint and the unified-session repository keeps the FK-free draft path simple).
- `SQLAlchemyHousingApplicationRepository` is reworked to take a postgres session; all 18 endpoints in `http_endpoints.py` and the 2 in `open_banking_endpoints.py` switch their `Depends(get_db)` to `Depends(get_application_db)`.
- The MySQL `applications`/`application_drafts` tables stay in place but become read-only/unused. Drop after a release of dual-write quiet.

### Schema reconciliation (postgres ALTERs required)
Postgres `applications` was created with the pre-PR-#143 schema (every legacy column `NOT NULL`). The SQLAlchemy model is post-#143 (most legacy columns nullable). To match the model, run the following ALTERs **before deploy**:
```
ALTER TABLE applications
  ALTER COLUMN phone DROP NOT NULL,
  ALTER COLUMN country DROP NOT NULL,
  ALTER COLUMN property_type DROP NOT NULL,
  ALTER COLUMN purchase_intent DROP NOT NULL,
  ALTER COLUMN budget_range DROP NOT NULL,
  ALTER COLUMN savings DROP NOT NULL,
  ALTER COLUMN income DROP NOT NULL,
  ALTER COLUMN income_currency DROP NOT NULL,
  ALTER COLUMN employment_status DROP NOT NULL,
  ALTER COLUMN financing_consent DROP NOT NULL;
```
The 9 postgres-only extras (`date_of_birth`, `profession`, `current_employer`, `job_title`, `industry`, `website`, `linkedin`, `identifier`, `metadata jsonb`) stay nullable on the DB and remain ignored by the model in this PR (reads still flow through the embedded `connected_accounts._application_metadata` JSON for backwards compat — adding columns to the SQLAlchemy model is a follow-up).

### Dashboard read path (the user's pain point)
- Frontend page: `frontend/app/applicants/page.tsx:742` calls `fetch("/api/applications")`.
- Next.js route: `frontend/app/api/applications/route.ts:68-114` (GET) → `fetchApplicationsFromBackend` in `frontend/app/api/applications/common.ts:287-342`.
- Backend endpoint: `${BACKEND}/api/v1/applications` → `list_housing_applications_endpoint` at `backend/src/interface/http_endpoints.py:2367-2410` → `_load_housing_applications` (`http_endpoints.py:1582-1635`) → `SQLAlchemyHousingApplicationRepository.list_recent`.
- After this PR, that whole chain reads from postgres. Field-rendering compatibility verified: `BackendApplication` interface (`frontend/lib/application-types.ts:28-70`) consumes only fields already in the model.

### FK closure
Postgres `customer_applicants` (FK to `applications.id`, ON DELETE CASCADE) and `open_banking_consents` (FK to `applications.id`) both have **0 rows** today on postgres (verified via psql). MySQL is the live source of those tables. **Decision: keep `customer_applicants` and `open_banking_consents` on MySQL**; drop the FK on the postgres side (or accept the FK is non-enforcing — both tables are currently empty on postgres). The application_id reference on the MySQL side becomes a "soft" cross-DB integer reference. Recommendation: drop the postgres FKs because the live data lives elsewhere.

### MySQL → postgres data migration (one-time)
Today MySQL `applications` holds id=1 = `tobias@tobiasa.com` (per the prompt). Postgres has 4 rows: ids 2, 3, 9, 10 (Yui Suzuki, Sota Takahashi, Alex Morgan, tobias). To preserve Tobias' production submission:
1. SSH to the prod VM, dump MySQL: `docker exec mysql mysqldump --no-create-info --skip-extended-insert lita_production applications | grep tobias`.
2. Translate `INSERT` to postgres syntax (drop backticks, replace `0/1` for booleans with `false/true`, add a serialized `connected_accounts` value if required).
3. Run on postgres with explicit `id` (the postgres sequence starts after the highest existing id = 10).
4. Verify `SELECT id, email, full_name FROM applications` matches expectation.
5. Cap the postgres id sequence: `SELECT setval('applications_id_seq', (SELECT MAX(id) FROM applications));`

### Login / credentials interaction
`_provision_applicant_credentials` (`http_endpoints.py:301-347`) writes to MySQL `users` (FK `users.application_id` → MySQL `applications.id`). After cutover, the MySQL FK constraint becomes invalid because the application id lives on postgres. Mitigation: drop the MySQL `users.application_id` FK constraint (the column itself stays as a soft integer reference — the schema-ensure migration in `schema.py:175-190` already added it as plain `INTEGER NULL`). Login lookup (`SQLAlchemyUserRepository.get_user_by_email`) does not join `applications`, so login continues to work for postgres-backed applications. **No login flow code changes required**.

### Tests
- `backend/tests/conftest.py:30-43` already creates both `Base.metadata` and `PgBase.metadata` tables on the same SQLite test engine (note: `infra/postgresql/database.py` imports `Base` from `src.config.database` — this is the legacy MySQL `Base`, not `TxBase`). After moving `HousingApplicationModel` to `TxBase`, the conftest must also call `TxBase.metadata.create_all(bind=test_engine)` or the test suite breaks.
- The tests currently mix MySQL- and postgres-bound tables in one SQLite engine, which is fine for unit tests; the application logic does not need a real postgres in CI.

### Deployment
`backend/cloudbuild.yaml:22-23` already wires `POSTGRES_*` env vars and a second Cloud SQL instance. No infra changes needed for this PR — the postgres engine is already reachable at runtime. Update the same env file by adding the ALTER TABLE migration step (run via psql before flipping traffic).

## Definition of Done
1. `POST /api/v1/applications` writes a new row into postgres `applications` (verified by `psql -c "SELECT count(*) FROM applications"`).
2. `GET /api/v1/applications` (and the dashboard `/applicants` page) returns rows from postgres including the migrated id=11 Tobias row.
3. Existing 4 postgres rows (ids 2, 3, 9, 10) plus migrated Tobias are visible after deploy.
4. Backend test suite passes (conftest updated to create `TxBase` tables on the SQLite test engine).
5. Login via `/api/v1/applications/send-login-email` works against a postgres application id (writes a `users` row in MySQL with that id as a soft reference).
6. MySQL `applications` is no longer written to (logged via warning if the legacy code path is hit).
