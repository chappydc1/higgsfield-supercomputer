# applicants-table — Implementation Plan

Drop the three unused snake_case postgres tables (`applicants`, `customer_applicants`, `phone_applications`) and every line of code, schema, test, and documentation that references them. The `/applicants` dashboard and the `applications` table are unaffected — the dashboard reads `housing_applications` via `GET /api/applicants` (note: prefix `/api`, no `/v1`), which is implemented at `backend/src/interface/http_endpoints.py:3308-3340` and is **not** the doomed customer-API endpoint.

## Status

Phases: 5

- [ ] Phase 4a — Drop SQLAlchemy models + relationships in `mysql/models.py`
- [ ] Phase 4b — Remove dead repositories, services, usecases, endpoints, schemas, tests
- [ ] Phase 4c — Drop the 3 tables on postgres (operator runs SQL, then code deploy)
- [ ] Phase 4d — Add `docs/db-schema.md`
- [ ] Phase 4e — CHANGELOG entry

## Rollback Plan

If 4a/4b break import or boot, `git revert` the single combined commit; the schema deletion in 4c is the only operator step that is *not* trivially reversible. If the operator runs the DROP SQL in 4c against an environment that the rollback then deploys to, the rollback's code will fail to load `ApplicantModel` against a missing table — so the runbook for 4c states **deploy the code first**, monitor for one deploy cycle, then drop the tables. This sequencing makes the cleanup recoverable until the DROP runs. The 3 tables are all empty in production today (verified in Phase 1 context.md: 0 rows in each), so no data backup is required, but per the operator-side standard a `pg_dump --table=applicants --table=customer_applicants --table=phone_applications` snapshot before DROP is cheap insurance.

## Phase 4a — SQLAlchemy model removal

### Files to touch

- `backend/src/infra/mysql/models.py`

### Removal sites (file:line)

| Line | What | Action |
|---|---|---|
| `models.py:49-55` | `class PhoneApplicationModel(Base)` (full class) | DELETE |
| `models.py:285` | `applicants = relationship("CustomerApplicantModel", back_populates="customer")` on `CustomerModel` | DELETE the line |
| `models.py:321` | `applicants = relationship("CustomerApplicantModel", back_populates="consent_grant")` on `ConsentGrantModel` | DELETE the line |
| `models.py:324-343` | `class CustomerApplicantModel(Base)` (full class) | DELETE |
| `models.py:346-383` | `class ApplicantModel(Base)` (full class) | DELETE |

The two `relationship()` declarations at lines 285 and 321 are the **mapper-configure traps** — they reference `"CustomerApplicantModel"` by name; if the class is deleted but the relationship lines stay, every test/boot that touches `CustomerModel` or `ConsentGrantModel` raises `InvalidRequestError: When initializing mapper Mapper[CustomerModel(customers)], expression 'CustomerApplicantModel' failed to locate a name`. Both lines must die in the same diff as the class deletions.

### Steps

1. Remove the 3 model classes and the 2 stale `relationship()` declarations.
2. Verify the file still imports cleanly: `python -c "from src.infra.mysql import models"` from `backend/`.
3. Verify mapper config works: `python -c "from src.infra.mysql.models import CustomerModel, ConsentGrantModel; from sqlalchemy.orm import configure_mappers; configure_mappers(); print('OK')"`.

### Acceptance criteria

- `models.py` no longer contains `ApplicantModel`, `CustomerApplicantModel`, `PhoneApplicationModel`, or any `relationship("CustomerApplicantModel", ...)` line.
- Module import succeeds; `configure_mappers()` succeeds.

## Phase 4b — Dead code removal

### Files to delete (whole-file deletions)

| Path | Reason |
|---|---|
| `backend/src/services/applicant_service.py` | `ApplicantService` class — only consumer of `ApplicantModel`. |
| `backend/src/models/applicant.py` | Re-export shim for `ApplicantModel`. |
| `backend/src/api/endpoints/applicants.py` | Customer-API GET/POST `/api/v1/applicants` endpoints — only consumer of `ApplicantService`. Note: this is **not** the dashboard endpoint at `http_endpoints.py:3308`. |
| `backend/src/interface/applicants_endpoints.py` | 4-line `from src.api.endpoints.applicants import router` shim — only re-export of the doomed router. |
| `backend/src/infra/mysql/phone_application_repository.py` | `SQLAlchemyPhoneApplicationRepository` — only consumer of `PhoneApplicationModel`. |
| `backend/src/usecase/phone_application.py` | `submit_phone_application`, `list_phone_applications` usecase functions. |
| `backend/src/domain/phone_application.py` | `PhoneApplication` dataclass and `PhoneApplicationRepository` ABC. |
| `backend/tests/test_applicants.py` | Tests for the doomed customer-API path (5 tests; all import `ApplicantModel`). |
| `backend/tests/interface/test_phone_application_endpoint.py` | Tests for the doomed phone-application endpoints (3 tests). |

### Files to modify

| File | Lines | Action |
|---|---|---|
| `backend/src/main.py` | 17 | DELETE `from src.interface.applicants_endpoints import router as applicants_router` |
| `backend/src/main.py` | 80 | DELETE `app.include_router(applicants_router)` |
| `backend/src/interface/http_endpoints.py` | 35-36 | DELETE `PhoneApplicationCreateRequest,` and `PhoneApplicationResponse,` from the schema import block |
| `backend/src/interface/http_endpoints.py` | 69 | DELETE `from src.infra.mysql.phone_application_repository import SQLAlchemyPhoneApplicationRepository` |
| `backend/src/interface/http_endpoints.py` | 82-85 | DELETE the `from src.usecase.phone_application import (submit_phone_application, list_phone_applications,)` import block |
| `backend/src/interface/http_endpoints.py` | 1562-1571 | DELETE `_phone_application_to_response` helper |
| `backend/src/interface/http_endpoints.py` | 1639-1646 | DELETE `_load_phone_applications` helper |
| `backend/src/interface/http_endpoints.py` | 1659-1694 | DELETE `@router.post("/phone-applications") def create_phone_application` (and its 35-line body) |
| `backend/src/interface/http_endpoints.py` | 1697-1717 | DELETE `@router.get("/phone-applications") def list_phone_applications_endpoint` (and its 21-line body) |
| `backend/src/interface/schemas.py` | 61-69 | DELETE `class PhoneApplicationCreateRequest(BaseModel)` and `class PhoneApplicationResponse(BaseModel)` (9 lines including the blank between them) |
| `backend/src/infra/postgres/schema.py` | 17 | DELETE `("customer_applicants", "customer_applicants_application_id_fkey"),` from `_FK_DROP_TARGETS` (the table is gone after Phase 4c, so its FK-drop becomes a no-op error/log spam — clean removal preferred) |

### Steps

1. Delete the 9 whole files above.
2. Apply the 11 modify-in-place edits above.
3. From `backend/`: `python -c "from src import main"` — must succeed (catches the leftover `applicants_router` import).
4. From `backend/`: `python -c "from src.interface import http_endpoints"` — must succeed (catches leftover `PhoneApplicationResponse` references).
5. From `backend/`: `pytest tests/ -x -q` — full suite must pass. Smoke-watch for `ImportError` in the discovery phase (means a deletion missed a consumer).
6. `grep -rn "ApplicantModel\|CustomerApplicantModel\|PhoneApplicationModel\|ApplicantService\|applicant_service\|phone_application_repository\|src\.usecase\.phone_application\|src\.api\.endpoints\.applicants\|applicants_endpoints" backend/ frontend/` — should return zero matches against `*.py`/`*.ts`/`*.tsx` source files (matches against `docs/` and `.ai/` are tolerated; doc updates handled in Phase 4d).

### Acceptance criteria

- Every doomed import is gone; backend boots; full test suite is green.
- The frontend dashboard at `/applicants`/`/dashboard` continues to operate (unaffected — it uses `/api/applicants` which is untouched).
- Customer-API URLs `GET /api/v1/applicants`, `GET /api/v1/applicants/{id}`, `POST /api/v1/applicants`, `GET /api/v1/health`, `POST /api/phone-applications`, `GET /api/phone-applications` all return 404 (router gone). This is intentional — these endpoints had no live consumer.

## Phase 4c — Production DDL

### SQL file to create

`backend/migrations/postgres/002_drop_dead_applicant_tables.sql`:

```sql
-- applicants-table cleanup: drop the three unused tables.
-- Pre-deploy invariant (verified 2026-05-05 in Phase 1):
--   SELECT COUNT(*) FROM applicants;          -> 0
--   SELECT COUNT(*) FROM customer_applicants; -> 0
--   SELECT COUNT(*) FROM phone_applications;  -> 0
-- Apply as the postgres superuser (the lita-ehousing role does not own these tables).
-- Idempotent — safe to re-run.

DROP TABLE IF EXISTS phone_applications;
DROP TABLE IF EXISTS customer_applicants;
DROP TABLE IF EXISTS applicants CASCADE;  -- CASCADE only drops the FKs FROM customer_applicants
                                          -- (already dropped above) and the applicants→customers,
                                          -- applicants→consent_grants FKs that point OUT of applicants.
                                          -- No surviving table has an FK INTO applicants — verified.
```

### SurvivingFK verification (already done by planner, repeat at deploy time)

```sql
-- Should return zero rows BEFORE the DROP runs:
SELECT
  conname,
  conrelid::regclass AS from_table,
  confrelid::regclass AS to_table
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid::regclass::text IN ('applicants', 'customer_applicants', 'phone_applications')
  AND conrelid::regclass::text NOT IN ('applicants', 'customer_applicants', 'phone_applications');
```

This catches any *external* table that still FKs into the doomed three. Confirmed empty by `grep -rn 'ForeignKey.*applicants\|REFERENCES applicants\|REFERENCES customer_applicants\|REFERENCES phone_applications' backend/ platform/` — zero matches.

### Operator runbook entry

1. **Deploy code first (Phase 4a + 4b commit).** The deployed backend no longer references the three tables, so the tables become inert.
2. Wait one deploy cycle and confirm `/applicants` and `/dashboard` still work.
3. Snapshot for cheap rollback insurance (~3 KB total since all tables empty):
   ```bash
   pg_dump -h <host> -U <super> -d lita-ehousing \
     --table=applicants --table=customer_applicants --table=phone_applications \
     --schema-only > /tmp/dropped_applicant_tables_$(date +%F).sql
   ```
4. Run the SurvivingFK verification SQL above — must return 0 rows.
5. Apply: `psql -h <host> -U <super> -d lita-ehousing -f backend/migrations/postgres/002_drop_dead_applicant_tables.sql`.
6. Verify: `\dt applicants*` and `\dt phone_applications` both return "did not match any relation".
7. Also remove the stale FK-drop in `backend/migrations/postgres/001_relax_applications.sql:15` (the `customer_applicants` line) in the same code commit as Phase 4a/4b — the migration is idempotent so leaving it costs only a log line, but cleaner to keep migration history in sync. Same applies to `backend/migrations/003_canonical_applicants.sql` which materialises both `customer_applicants` and the legacy `applicants` table — flag it as superseded but do **not** modify (historical migrations should remain immutable; the `IF NOT EXISTS` guards keep it safe to never re-run, and the table-drop in 4c will eventually retire that path).

## Phase 4d — `docs/db-schema.md`

### What to document

A flat reference of the surviving postgres + MySQL tables that this FastAPI backend *actually uses*. Sections:

1. **Postgres (TxBase) — application data**
   - `applications` (housing application submissions; rows: 4; written by `SQLAlchemyHousingApplicationRepository`; read by `GET /api/applicants`).
   - `application_drafts` (in-progress submissions; PR #145; written by the drafts repository).
   - `raw_provider_payloads`, `canonical_financial_accounts`, `canonical_transactions`, `canonical_identity_profiles`, `canonical_income_summaries` (canonical bank-data layer; postgres-only, defined in `src/infra/postgres/models.py`).

2. **MySQL (Base) — auxiliary data**
   - `users`, `customers`, `customer_sessions`, `consent_grants` (auth + consent).
   - `open_banking_consents`, `open_banking_refresh_events`, `bank_data_snapshots`, `credit_scores` (bank-data and scoring).
   - `lita_consents`, `lita_access_tokens`, `lita_data_snapshots`, `lita_score_decisions` (Lita-API surface).
   - `transunion_batch_ingestions`, `transunion_batch_rows`, `transunion_batch_issues` (TransUnion batch).
   - `otp_verifications`, `data_access_audit_log`, `decision_audit_log`, `feature_snapshots`, `scoring_jobs`, `provider_connection_status`, `retention_policies`.
   - `billing_plans`, `billing_subscriptions`, `billing_invoices`, `billing_events`.

3. **Removed (this PR)**
   - `applicants`, `customer_applicants`, `phone_applications` — never had non-zero rowcount in production; legacy customer-API and phone-only signup scaffolds.

4. **Owned by `services/us-api/` Prisma microservice (DO NOT TOUCH)**
   - 29 PascalCase tables (`Applicant`, `ApplicantApplication`, `AccessLog`, …). Coordinated separately; left alone here.

5. **Cross-engine note**
   - `applications` lives on postgres while `users`, `open_banking_consents`, etc. live on MySQL. Cross-engine FKs are unenforceable — the codebase keeps `application_id` columns as plain `Integer` with no `ForeignKey()` declaration; the runtime helper `ensure_postgres_applications_relaxed` in `src/infra/postgres/schema.py` drops any latent FK constraints.

## Phase 4e — CHANGELOG

### Entry text

Append a new entry to `workspace/CHANGELOG.md` directly above the existing `## [2026-05-05] – Applications on postgres` entry, in the same format:

```
## [<deploy-date>] – Drop unused customer-API + phone-application scaffolding

**Type:** chore (dead code + DDL)
**Areas:** backend, db

**Summary:**
Remove the three unused postgres tables (`applicants`, `customer_applicants`, `phone_applications`) and every SQLAlchemy model, repository, service, usecase, HTTP endpoint, Pydantic schema, and test that referenced them. All three tables had zero rows in production. The `/applicants` admin dashboard is unchanged — it reads `applications` via `GET /api/applicants` (housing applications), which is implemented at `http_endpoints.py:3308-3340` and was never coupled to the doomed tables.

**Removed:**
- 3 SQLAlchemy classes in `backend/src/infra/mysql/models.py` (`PhoneApplicationModel`, `CustomerApplicantModel`, `ApplicantModel`) and the 2 stale `back_populates` relationships on `CustomerModel.applicants` / `ConsentGrantModel.applicants`.
- 9 source files: `services/applicant_service.py`, `models/applicant.py`, `api/endpoints/applicants.py`, `interface/applicants_endpoints.py`, `infra/mysql/phone_application_repository.py`, `usecase/phone_application.py`, `domain/phone_application.py`, plus the 2 test files `tests/test_applicants.py` and `tests/interface/test_phone_application_endpoint.py`.
- 3 customer-API endpoints (`GET /api/v1/applicants`, `GET /api/v1/applicants/{id}`, `POST /api/v1/applicants`) and 2 phone-application endpoints (`POST /api/phone-applications`, `GET /api/phone-applications`).

**Deploy preconditions** (operator must run AFTER the code deploy lands):

1. Snapshot the empty tables (insurance):
   ```bash
   pg_dump -h <host> -U <super> -d lita-ehousing \
     --table=applicants --table=customer_applicants --table=phone_applications \
     --schema-only > /tmp/dropped_applicant_tables_$(date +%F).sql
   ```
2. Apply DROP SQL as postgres superuser:
   ```bash
   psql -h <host> -U <super> -d lita-ehousing -f backend/migrations/postgres/002_drop_dead_applicant_tables.sql
   ```
3. Verify: `\dt applicants*` and `\dt phone_applications` return "did not match any relation".

**Notes:**
- The 29 `services/us-api/` Prisma-managed PascalCase tables (`Applicant`, `ApplicantApplication`, …) are deliberately left alone; they are owned by a sibling microservice.
- `backend/src/infra/postgres/schema.py` no longer attempts to drop `customer_applicants_application_id_fkey` (the table is gone).
```

## Cross-Phase Notes

### Sequencing

- 4a + 4b ship as **one combined commit/PR** — splitting them would break a mid-state where the model is gone but the repository/service/router still imports it (or vice versa).
- 4d (docs) and 4e (CHANGELOG) belong in the same commit as 4a/4b — atomic, reviewable, and the CHANGELOG entry references the removal-line counts that the code change introduces.
- 4c is the **only operator step**, and it runs *after* the code deploy has been live for one cycle. Once 4a/4b are deployed, the doomed tables are inert; the DROP is housekeeping. Reversing the order (DROP first, then deploy) is unsafe because if the deploy is rolled back, the rolled-back code's `Base.metadata.create_all` and `ApplicantService` queries hit a missing table.

### Test verification commands

From `backend/`:
```
python -c "from src.infra.mysql import models"
python -c "from src.infra.mysql.models import CustomerModel, ConsentGrantModel; from sqlalchemy.orm import configure_mappers; configure_mappers(); print('mappers OK')"
python -c "from src import main"
pytest tests/ -x -q
```

### Grep cleanliness gate (run after 4b)

```
grep -rn "ApplicantModel\|CustomerApplicantModel\|PhoneApplicationModel\|ApplicantService\|applicant_service\|phone_application_repository\|src\.usecase\.phone_application\|src\.api\.endpoints\.applicants\|applicants_endpoints" backend/ frontend/ | grep -v "^.*\.ai/\|^.*docs/"
```

Expected output: empty.

## Assessed: yes
