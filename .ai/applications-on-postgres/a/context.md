# applications-on-postgres — Phase 1 Context Map

All paths absolute from worktree root `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/zen-solomon-13f3f4`.

## 0. Quick file map (load-bearing files)
- `backend/src/config/database.py:181-263` — both `engine` (mysql) and `tx_engine` (postgres) live here. `SessionLocal` (mysql) and `TxSessionLocal` (postgres) are the two factories. PR #144 added the postgres half (lines 194-263).
- `backend/src/infra/postgres/database.py:1-7` — `TxBase = declarative_base()` (postgres-only metadata).
- `backend/src/infra/postgres/models.py:23-182` — five canonical models bind to `TxBase` (PR #144).
- `backend/src/infra/mysql/database.py:1-4` — re-exports `Base, SessionLocal, engine, get_db` from `src.config.database`.
- `backend/src/infra/mysql/models.py:1-545` — every MySQL-bound model. `HousingApplicationModel` at L54-84, `ApplicationDraftModel` at L299-309, `CustomerApplicantModel` at L364-379, `OpenBankingConsentModel` at L128-170, `ApplicantModel` at L382-419, `UserModel` at L31-42 (`users.application_id` FK at L40).
- `backend/src/infra/mysql/housing_application_repository.py:55-668` — repository the entire app uses for applications **and** drafts.
- `backend/src/domain/housing_application.py:1-121` — `HousingApplication` dataclass + `HousingApplicationRepository` ABC; abstract methods L45-120.
- `backend/src/usecase/housing_application.py:1-117` — six usecase functions; all consumers below go through them.
- `backend/src/interface/http_endpoints.py` — every consumer endpoint (see §2).
- `backend/src/interface/open_banking_endpoints.py:23,141-142,210,461` — extra consumers via `get_housing_repository`.
- `backend/src/scripts/check_applications_db.py:12,41` and `clear_housing_applications.py:9-10,51` — CLI scripts that import the same repository.
- `backend/cloudbuild.yaml:22-23` — env-var wiring for both Cloud SQL instances (already adds POSTGRES_*).
- `frontend/app/applicants/page.tsx:742` — `fetch("/api/applications")` from the dashboard list page.
- `frontend/app/api/applications/route.ts:68-114` (GET), `116-203` (POST), `205-223` (DELETE) — Next.js proxy.
- `frontend/app/api/applications/common.ts:275-342` (`fetchApplicationsFromBackend`) — calls `${BACKEND}/api/v1/applications`.
- `frontend/lib/application-types.ts:28-70` — `BackendApplication` interface (response shape).
- `platform/deployment/prod/docker-compose.yml:131-150` — MySQL 8.0.31 docker container with `db_data:/var/lib/mysql` volume (the volume that gets reset).
- `.github/workflows/deploy.yml:261` — `--force-recreate backend frontend caddy` (NOT mysql, but VM rebuilds wipe the volume).

## 1. HousingApplicationModel and repository inventory

### Model — `backend/src/infra/mysql/models.py:54-84`
```
__tablename__ = "applications"
UniqueConstraint(full_name, phone, name="uq_applications_full_name_phone")
id, email (255 NOT NULL), phone (64 NULL), country (128 NULL), property_type (128 NULL),
purchase_intent (64 NULL), budget_range (64 NULL), savings (64 NULL), income (64 NULL),
income_currency (16 NULL), employment_status (128 NULL), financing_consent (32 NULL),
full_name (255 NOT NULL), agree_policy (BOOL NOT NULL), receive_updates (BOOL NOT NULL DEFAULT 0),
skipped_connect_accounts (BOOL NOT NULL DEFAULT 0), connected_accounts (TEXT NULL),
created_at (DateTime tz=True), archived (BOOL NOT NULL DEFAULT 0),
review_status (VARCHAR(32) NOT NULL DEFAULT 'pending')
relationship: customer_applicants (back_populates)
```
Bound to `Base` (MySQL); needs to move to `TxBase` (postgres) — see §3.

### Repository — `backend/src/infra/mysql/housing_application_repository.py`
Public methods (line numbers):
- `__init__` L56-60 — calls `_ensure_schema_columns` (idempotent ALTERs at startup).
- `_ensure_schema_columns` L73-120 — runs ALTER TABLE for legacy MySQL schema. **Postgres ignores the MySQL-only `MODIFY COLUMN` path (`schema.py:204-232`)**, but the `_ensure_column` helper still runs `ALTER TABLE ADD COLUMN` against the engine for `archived`, `review_status`, `skipped_connect_accounts`, `connected_accounts`. After the move, this whole block needs to no-op on postgres because the postgres schema already has all columns. Either keep it (the pre-check at `_column_exists` short-circuits when columns exist — verified L88-92) or skip on postgres dialect.
- `_to_domain` L234-264 — model → `HousingApplication` dataclass.
- `_fallback_application_from_row` L139-167 — raw-SQL fallback (drops if `review_status` column missing).
- `create` L266-401 — **the write path**. Idempotency via `(full_name, phone)`; merges with `_is_meaningful` sentinel-coercion. Persists `connected_accounts` as `json.dumps(...)` STRING into the `TEXT` column (L267, L381).
- `get_by_id` L403-416.
- `get_application_by_email` L418-437.
- `list_recent` L439-467 — **the dashboard read path** (filters `archived = False`, orders by `created_at DESC`).
- `search_by_phone` L469-523 — Python-side LIKE-ish over digits.
- `delete_all` L525-534.
- `archive` L536-546 — destroys (uses `delete`, not the soft-archive flag — likely a bug, but out of scope).
- `update_review_status` L548-572.
- `_draft_to_domain` L578-598, `upsert_draft` L600-647, `get_draft_by_email` L649-658, `delete_draft_by_email` L660-668.

### Domain interface — `backend/src/domain/housing_application.py:45-120`
ABC declares 11 methods. Any postgres-bound impl must implement all.

### Usecase entry points — `backend/src/usecase/housing_application.py`
`submit_housing_application` L12-61 (writer), `list_housing_applications` L64-71, `get_housing_application` L74-84, `search_housing_applications_by_phone` L87-95, `delete_all_housing_applications` L98-103, `archive_housing_application` L106-116.

## 2. Read sites + dashboard read path

### Dashboard read path (the user's pain point)
1. Browser GET `https://ehousing.joinlita.com/applicants` → React component `frontend/app/applicants/page.tsx`.
2. Inside `useEffect` (`page.tsx:742`): `await fetch("/api/applications", …)`.
3. Next.js handler `frontend/app/api/applications/route.ts:68-114` calls `fetchApplicationsFromBackend({ headerList, authToken: extractAuthToken(...), allowAnonymous: true })`.
4. `fetchApplicationsFromBackend` (`common.ts:287-342`) hits `${BACKEND_API_URL}/api/v1/applications` (line 279).
5. FastAPI route `list_housing_applications_endpoint` (`http_endpoints.py:2367-2410`) → `_load_housing_applications` (L1582-1635) → `SQLAlchemyHousingApplicationRepository.list_recent`.
6. After `list_recent`, `_resolve_application_metadata` (L1039-1086) runs (Salt Edge customer enrichment for non-US rows — issues a real HTTP call, but skips US-only listings) and `_bulk_canonical_transaction_summary` (L1246-1306) groups canonical_transactions by applicant_id.
7. Each row is shaped via `_application_to_response` (L1309-1374) into `ApplicationResponse`.
8. The frontend reads only the fields declared in `BackendApplication` (`frontend/lib/application-types.ts:28-70`) — verified compatible with the model.

### All endpoints reading `HousingApplicationModel` via the repository
From `grep -n "SQLAlchemyHousingApplicationRepository(db)"` in `backend/src/interface/http_endpoints.py`:
| Line | Route | Purpose |
|------|-------|---------|
| 1589 | `_load_housing_applications` helper | feeds list+search endpoints |
| 1980 | `POST /v1/applications/send-login-email` | look up by email; provision creds |
| 2145 | `POST /v1/applications` | submit (write) |
| 2317 | `POST /v1/applications/draft` | upsert draft (write) |
| 2350 | `GET /v1/applications/draft` | get draft |
| 2419 | `GET /v1/applications/lookup` | lookup id by email |
| 2442 | `DELETE /v1/applications` | delete_all |
| 2467 | `POST /v1/applications/{id}/archive` | archive (delete by id) |
| 2505 | `GET /v1/applications/{id}` | get one |
| 2623 | `GET /v1/applications/{id}/credit-score` | get app for scoring |
| 2966 | `GET /v1/applications/{id}/account-balances` | |
| 3008 | `GET /v1/applications/{id}/transactions` | |
| 3087 | `GET /v1/applications/{id}/payment-history` | |
| 3130 | other `/v1/applications/{id}/...` | |
| 3178 | other | |
| 3251 | `POST /v1/applications/{id}/decision` | update review status |
| open_banking_endpoints.py:142,210,461 | open-banking sync routes | |

Plus the OTP/verify-passcode/SSE-stream/HTML helpers under `/v1/applications/...` that don't directly use the repo (they look up via OTP table or stream events).

### `_application_to_response` and `_bulk_canonical_transaction_summary`
- `_application_to_response` (`http_endpoints.py:1309-1374`) outputs a 19-field response with `transactions_count` and `transactions_synced_at` (post-PR-#144 additions, L1340-1343). It pulls `metadata`/`identifier` either from a Salt Edge enrichment dict or from the embedded `connected_accounts._application_metadata` (the intake-hardening pattern).
- `_bulk_canonical_transaction_summary` (`http_endpoints.py:1246-1306`) opens a fresh `TxSessionLocal()` (postgres, PR #144). When `tx_engine` is None it returns `{}`. Compatible with the new world: this code already lives on postgres — no change.

## 3. Schema reconciliation table

Postgres `\d applications` (live, queried 2026-05-05 via `psql -h 127.0.0.1 -p 5432`):

| column | MySQL model (post-#143) | Postgres live | ALTER needed |
|---|---|---|---|
| id | int PK auto | int PK nextval | none |
| email | VARCHAR(255) NOT NULL | varchar(255) NOT NULL | none |
| phone | VARCHAR(64) NULL | varchar(64) **NOT NULL** | `ALTER COLUMN phone DROP NOT NULL` |
| country | VARCHAR(128) NULL | varchar(128) **NOT NULL** | DROP NOT NULL |
| property_type | VARCHAR(128) NULL | varchar(128) **NOT NULL** | DROP NOT NULL |
| purchase_intent | VARCHAR(64) NULL | varchar(64) **NOT NULL** | DROP NOT NULL |
| budget_range | VARCHAR(64) NULL | varchar(64) **NOT NULL** | DROP NOT NULL |
| savings | VARCHAR(64) NULL | varchar(64) **NOT NULL** | DROP NOT NULL |
| income | VARCHAR(64) NULL | varchar(64) **NOT NULL** | DROP NOT NULL |
| income_currency | VARCHAR(16) NULL | varchar(16) **NOT NULL** | DROP NOT NULL |
| employment_status | VARCHAR(128) NULL | varchar(128) **NOT NULL** | DROP NOT NULL |
| financing_consent | VARCHAR(32) NULL | varchar(32) **NOT NULL** | DROP NOT NULL |
| full_name | VARCHAR(255) NOT NULL | varchar(255) NOT NULL | none |
| agree_policy | BOOL NOT NULL | bool NOT NULL | none |
| receive_updates | BOOL NOT NULL DEFAULT 0 | bool NOT NULL DEFAULT false | none |
| skipped_connect_accounts | BOOL NOT NULL DEFAULT 0 | bool NOT NULL DEFAULT false | none |
| connected_accounts | TEXT NULL | text NULL | none |
| created_at | DateTime(timezone=True) server_default=func.now() | **timestamp WITHOUT time zone** DEFAULT CURRENT_TIMESTAMP | minor mismatch — model claims tz=True; postgres column is `timestamp without time zone`. Functionally OK because pg8000 will accept naive datetimes; possible future ALTER `TYPE timestamptz` for parity. |
| archived | BOOL NOT NULL DEFAULT 0 | bool NOT NULL DEFAULT false | none |
| review_status | VARCHAR(32) NOT NULL DEFAULT 'pending' | varchar(32) NOT NULL DEFAULT 'pending' | none |
| date_of_birth | (not in model) | date NULL | postgres-only extra; ignored |
| profession | (not in model) | varchar(255) NULL | ignored |
| current_employer | (not in model) | varchar(255) NULL | ignored |
| job_title | (not in model) | varchar(255) NULL | ignored |
| industry | (not in model) | varchar(128) NULL | ignored |
| website | (not in model) | varchar(512) NULL | ignored |
| linkedin | (not in model) | varchar(512) NULL | ignored |
| identifier | (not in model) | varchar(255) NULL | ignored (read embedded from `connected_accounts._application_identifier`) |
| metadata | (not in model) | jsonb NULL | ignored (read embedded from `connected_accounts._application_metadata`) |

**Indexes** (postgres): `applications_pkey (id)`, `applications_full_name_phone_key UNIQUE (full_name, phone)` — same as the MySQL `UniqueConstraint`.

**Bottom line**: ten ALTER COLUMN ... DROP NOT NULL statements unblock the move. Everything else is compatible. The 9 postgres-only extras stay nullable and unused by this PR.

## 4. FK closure decision

### Inbound FKs to postgres `applications.id` (live `\d applications`)
1. `customer_applicants.application_id` → `applications.id` ON DELETE CASCADE (`\d customer_applicants` confirmed). **0 rows in postgres** today.
2. `open_banking_consents.application_id` → `applications.id` (no cascade). **0 rows in postgres** today.

### MySQL side
- `customer_applicants` lives on MySQL (`models.py:364-379`) and is the **active** copy. `customer_applicants.application_id` is `Integer ForeignKey("applications.id"), nullable=False`.
- `open_banking_consents` lives on MySQL (`models.py:128-170`) and is the active copy.
- Note: per PR #144 about.md, `open_banking_consents` exists on both sides; **MySQL is authoritative for now**.

### Decision
**Do NOT move `customer_applicants` or `open_banking_consents` to postgres in this PR.** Instead:
- Drop the postgres FK constraints (`customer_applicants_application_id_fkey`, `open_banking_consents_application_id_fkey`) so postgres `applications` has no inbound FK requirements (both tables are 0-rows on postgres anyway).
- The MySQL versions of those tables keep their FK to MySQL `applications.id`. After cutover, **the MySQL `applications` table stays as a stub** (frozen) so MySQL inbound FKs continue to validate. New customer_applicants rows will reference postgres-issued ids that don't exist on MySQL — the MySQL FK will fail. **Mitigation: drop the MySQL `customer_applicants.application_id` FK constraint** (column stays as plain integer reference). Currently this table is mostly empty in production (per intake-hardening context), but verify before deploy.
- Net effect: cross-DB integer references with no FK enforcement on either side. Acceptable trade-off — moving these tables is a follow-up PR.

Pros: small blast radius, single PR.  
Cons: loss of FK integrity (already weak — postgres copies are empty, MySQL FK becomes invalid post-cutover).

## 5. Data migration plan

### Current state
- MySQL prod `applications`: id=1, `tobias@tobiasa.com`, full_name=`tobias`, AP_0IP9A04 (per prompt). Self-hosted MySQL container, `db_data` volume on a VM. **At risk of disappearing on next VM rebuild.**
- Postgres `lita-ehousing` `applications` (verified live):
  - id=2  | `yui.suzuki2@joinlita.com` | Yui Suzuki     | 2026-03-16 12:15:59
  - id=3  | `sota.takahashi3@joinlita.com` | Sota Takahashi | 2026-03-16 12:15:59
  - id=9  | `alex.morgan@example.com` | Alex Morgan | 2026-04-03 10:00:00
  - id=10 | `tobias@tobiasa.com` | tobias | 2026-04-22 12:47:22 (NB: this row exists on postgres already, possibly from prior testing/manual seed)

Because postgres already has a `tobias@tobiasa.com` row (id=10), the migration may be a **no-op** — verify before importing. If MySQL id=1 has materially different content (newer `connected_accounts`, different `created_at`), copy the fields, otherwise skip.

### Recommended path (option a, with smart upsert)
```bash
# Run on the prod VM
docker exec -i mysql mysqldump --no-create-info \
  --skip-extended-insert --complete-insert lita_production applications > tobias.sql

# Inspect tobias.sql; convert backticks → no quotes; convert MySQL booleans (0/1) → false/true
# Then on postgres: ON CONFLICT (full_name, phone) DO UPDATE the affected fields.
psql -h 127.0.0.1 -U lita-ehousing -d lita-ehousing -f tobias_pg.sql

# Reset sequence after import
psql -c "SELECT setval('applications_id_seq', (SELECT COALESCE(MAX(id), 0) FROM applications));"
```

### Rejected options
- (b) accept loss of Tobias — bad UX, poor signal that production was ephemeral.
- (c) dual-write for one release — more code; unnecessary because postgres is already ahead by 4 rows and MySQL has only 1 row to merge.

## 6. Metadata embedding decision

- Today the API stores `metadata` inside `connected_accounts._application_metadata` (`http_endpoints.py:1091-1093, 2162-2167`) and `identifier` inside `connected_accounts._application_identifier`. Both are then unpacked by `_extract_embedded_application_enrichment` (L1146-1168) on read.
- Postgres has a first-class `metadata jsonb` column and an `identifier varchar(255)` column on `applications`.
- **Decision for this PR**: keep the embedding pattern. Reading from the embedded JSON is the existing logic — moving it to first-class columns is a separate cleanup (frontends and tests rely on the current shape via `connected_accounts._application_metadata`). The first-class columns stay nullable and unused.
- Follow-up PR can add `metadata = Column(JSONB(...).with_variant(JSON, "sqlite"), nullable=True)` to the SQLAlchemy model and add a migration shim that copies embedded → first-class on read for legacy rows.

## 7. Related tables

| Table | Lives on (today) | Lives on (after this PR) | Notes |
|---|---|---|---|
| `applications` | MySQL (active) + postgres (4 rows) | **postgres only** (writes routed) | This PR's main target |
| `application_drafts` | MySQL only | **postgres** | Moves with `applications` because the same repository class manages both, and the same submit endpoint reads/writes both in one transaction |
| `applicants` | MySQL (`models.py:382-419`) | MySQL (no change) | Customer-API canonical applicant; uses `application_id` as soft int reference; no FK |
| `customer_applicants` | MySQL active, postgres empty | MySQL only | FK to MySQL `applications.id`; mitigation: drop the FK so cross-DB ints don't error |
| `open_banking_consents` | MySQL active, postgres empty | MySQL only | Same FK mitigation |
| `users` | MySQL | MySQL | `users.application_id` (`models.py:40`) becomes a soft cross-DB int. The schema-ensure path (`schema.py:175-190`) already declares it as plain `INTEGER NULL` (no FK), so no DDL change. **However the live MySQL `users` table may have a real FK created by an earlier run with `Base.metadata.create_all` — verify and drop if present.** |
| `phone_applications` | MySQL | MySQL | Independent table, unaffected |
| `bank_data_snapshots` / refresh events / Lita / TransUnion / billing / scoring | MySQL | MySQL | All unaffected |
| canonical (post-PR-#144) | postgres | postgres | Unchanged |

The Next.js dashboard `/applicants` page only renders fields covered by `BackendApplication` (`application-types.ts:28-70`). It does not render anything from `customer_applicants`, `applicants`, or `users` directly. Verified no rendering breaks from the move.

## 8. Auth / login_credentials

`_provision_applicant_credentials` (`http_endpoints.py:301-347`) is the credential factory:
- Looks up `users` by email (MySQL).
- Either updates the existing user (sets `application_id = application.id`) or creates a new user (`User(application_id=application.id, ...)`).
- Returns `UserCredentialsResponse(temporary_password=password, application_id=user.application_id, ...)`.
Called from:
- `POST /v1/applications` (L2265) — included in submit response as `login_credentials`.
- `POST /v1/applications/send-login-email` (L1992) — generates a fresh password and emails it.

Login flow itself (`backend/src/interface/auth_endpoints.py` not modified by this PR, but called via `/api/auth/token`) authenticates against `users.email` + `users.hashed_password`. **Login does NOT join `applications`.** So a postgres-issued `application_id` stored in MySQL `users` works fine for authentication.

What does break (subtly): if MySQL `users.application_id` has a real FK constraint to MySQL `applications.id`, inserting a postgres id (e.g. 11) will fail because that id doesn't exist in MySQL. The schema-ensure path adds the column without a FK (`schema.py:188-190` is `INTEGER NULL` with no FK clause), but if `Base.metadata.create_all` previously ran on the live MySQL with `ForeignKey("applications.id")` (per `models.py:40`), the FK exists. **Action item**: pre-deploy, run `SHOW CREATE TABLE users` on MySQL prod and `ALTER TABLE users DROP FOREIGN KEY ...` if the FK is present.

## 9. Existing tests

`backend/tests/conftest.py:1-43`:
```py
from src.infra.mysql.database import Base, get_db
from src.infra.postgresql.database import Base as PgBase
...
@pytest.fixture(scope="function")
def test_db(test_engine):
    Base.metadata.drop_all(bind=test_engine)
    PgBase.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    PgBase.metadata.create_all(bind=test_engine)
```
Both bases write to the **same** SQLite file `sqlite:///./test.db`. **Critical observation**: `infra/postgresql/database.py:1-4` re-exports the legacy `Base` (the MySQL one), NOT `TxBase`. So `PgBase.metadata` is identical to `Base.metadata`. After moving `HousingApplicationModel` to `TxBase`, the conftest must change to also import `TxBase` and call `TxBase.metadata.create_all(bind=test_engine)`, otherwise the model's table won't exist in tests.

Existing test files that touch the application repo:
- `backend/tests/infra/test_housing_application_repository.py:1-68` — 4 tests. Uses `test_session` fixture, builds a `HousingApplication`, calls `create`/`delete_all`/`get_by_id`. After the move these still work as long as `TxBase.metadata.create_all(bind=test_engine)` runs.
- `backend/tests/interface/test_application_endpoint.py` — 899 lines, exercises the FastAPI route handlers via `TestClient` with the `client` fixture.
- `backend/tests/interface/test_application_transactions_canonical.py` — uses a separate in-memory `TxBase` engine fixture (lines 824-899 per prompt). Already correct.

Plan: add `TxBase` import + create_all/drop_all to conftest.

## 10. Deployment / cutover plan

### Pre-deploy migration (run once)
```sql
-- on Cloud SQL postgres lita-ehousing
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

ALTER TABLE customer_applicants
  DROP CONSTRAINT IF EXISTS customer_applicants_application_id_fkey;

ALTER TABLE open_banking_consents
  DROP CONSTRAINT IF EXISTS open_banking_consents_application_id_fkey;

-- on prod MySQL lita_production
-- (only if SHOW CREATE TABLE users shows an FK on application_id)
ALTER TABLE users DROP FOREIGN KEY <fk_name>;

-- One-time data copy from MySQL → postgres for the Tobias row (if still relevant)
-- See §5.
```

### Code change scope (Phase 2+)
- `backend/src/infra/postgres/models.py`: add `HousingApplicationModel` (and `ApplicationDraftModel`) bound to `TxBase`. Re-export from `backend/src/infra/mysql/models.py` (matching the canonical pattern).
- `backend/src/config/database.py`: optionally add `get_application_db()` dependency that yields `TxSessionLocal()`.
- `backend/src/infra/mysql/housing_application_repository.py`: rename to `application_repository.py` under `infra/postgres/` (or keep the file, it just receives a postgres session). Soften the MySQL-specific `_ensure_schema_columns` path so it no-ops on postgres dialect (the existing column-presence check at L88-92 already handles this gracefully — the `ALTER TABLE ADD COLUMN` is a no-op when the column exists).
- `backend/src/interface/http_endpoints.py`: every `db: Session = Depends(get_db)` that creates a `SQLAlchemyHousingApplicationRepository(db)` becomes `db: Session = Depends(get_application_db)`. ~18 call sites in this file plus `open_banking_endpoints.py:141-142` (`get_housing_repository`).
- `backend/tests/conftest.py`: replace `from src.infra.postgresql.database import Base as PgBase` with `from src.infra.postgres.database import TxBase as PgBase` (or add as a third base) and ensure both bases hit the same SQLite engine.

### Cloudbuild
No changes required — `POSTGRES_*` env vars are already set (`backend/cloudbuild.yaml:22-23`).

### Cutover order
1. Merge the PR; CI passes against SQLite (where both metadata bases share the test engine).
2. Run the postgres ALTER scripts above (out-of-band psql).
3. Optional: copy MySQL `applications` id=1 row to postgres if it has fresh data not already in postgres id=10.
4. Deploy backend. The first request after deploy hits postgres for both reads and writes.
5. Smoke-test: `GET /api/v1/applications` returns the existing 4 postgres rows. Submit a fresh application from the UI; verify `psql -c "SELECT count(*) FROM applications"` increments.
6. Watch logs for `[intake.merge]` and any unexpected exceptions for ~24h.
7. (Follow-up PR) drop the MySQL `applications` table, refactor first-class metadata column.

## 11. Hypotheses for what's broken on the live `/applicants` page TODAY

- **Hypothesis A (confirmed by user)**: MySQL container's `db_data` volume is being recreated when the VM restarts or compose redeploys in a way that prunes volumes. Submissions land but vanish the next deploy.
- **Hypothesis B**: deploy.yml `--force-recreate backend frontend caddy` (line 261) excludes mysql but does not protect the volume — if compose down ever runs with `-v` (e.g. manual operator), volumes are wiped.
- **Hypothesis C** (less likely): the prod backend is somehow pointing at a different DB host post-deploy. Per `.env`, the root creds point to postgres (port 5432), but the backend container uses `DB_HOST: mysql` (compose internal) per `docker-compose.yml:66`. So the backend is using MySQL — confirms A.

After this PR, A/B/C are all moot: writes go to Cloud SQL postgres, which has automated backups and can't be wiped by a VM rebuild.

## 12. DeploymentSafety: NEEDS-MIGRATION

- Pre-deploy postgres ALTERs are mandatory (10 columns DROP NOT NULL).
- Pre-deploy postgres FK drops on `customer_applicants` and `open_banking_consents` are mandatory.
- Pre-deploy MySQL `users.application_id` FK drop is mandatory **if present**.
- Optional one-time data copy of MySQL applications id=1 → postgres.
- All migrations are reversible: re-add NOT NULL after backfilling, re-add FKs against postgres `applications.id`.

No data loss risk if the data copy step is performed before flipping traffic.
