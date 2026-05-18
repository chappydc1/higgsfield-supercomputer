# postgres-transactions — Project Blueprint

## Mission
Persist every Plaid- and SaltEdge-pulled transaction into a dedicated Cloud SQL **postgres** instance (`lita-ehousing` in project `elemental-day-443510-e0`) and surface per-application transaction history at the existing `GET /v1/applications/{id}/transactions` endpoint and as new `transactions_count` / `transactions_synced_at` fields on the `/api/applications` list response. The MySQL `lita_production` instance keeps owning `applications`, `users`, drafts, and the rest of the operational schema. Postgres is the home for normalised banking transactions only.

## Final Architecture

### Backend: dual-engine setup
- A second SQLAlchemy engine `tx_engine` lives next to the existing MySQL `engine` in `backend/src/config/database.py`. Its env vars are `POSTGRES_CLOUD_SQL_CONNECTION_NAME`, `POSTGRES_DB_USER`, `POSTGRES_DB_PASSWORD`, `POSTGRES_DB_NAME`. When env vars are missing, `tx_engine` is `None` and the canonical writes are silently skipped (graceful fallback for dev / CI).
- A separate declarative base `TxBase` in `backend/src/infra/postgres/database.py` keeps the postgres-bound models off the main `Base.metadata.create_all(...)` startup hook so MySQL table creation does not accidentally try to spin up canonical tables on the wrong engine.
- Five models bind to `TxBase`: `RawProviderPayloadModel`, `CanonicalFinancialAccountModel`, `CanonicalTransactionModel`, `CanonicalIdentityProfileModel`, `CanonicalIncomeSummaryModel`. They are re-exported from `backend/src/infra/mysql/models.py` for legacy import paths. The four FK-related models form a closure (raw → financial_accounts + transactions + identity_profiles), so they live together on postgres to keep `ON DELETE SET NULL` constraints intact.
- The `payload` column on `RawProviderPayloadModel` is `JSONB` on postgres (`with_variant(JSON, "sqlite")` for the in-memory test fixture). Writers pass Python dicts directly — no `json.dumps` step.
- `counterparty_name` and `merchant_name` on `CanonicalTransactionModel` are truncated to 500 chars at the repository writer to match the postgres column width; truncations emit a debug log line.

### Sync flow
- `POST /v1/applications` kicks off `_kick_off_plaid_submit_pull` / `_kick_off_saltedge_submit_pull` daemon threads that open their own `_BankPullSessionLocal()` (MySQL) and pull from Plaid/SaltEdge into `bank_data_snapshots`.
- After each successful raw transactions pull, the bg worker derives `applicant_id = f"app-{application.id:08d}"`, opens a `TxSessionLocal()` against postgres, runs `NormalizationService.normalize_plaid` (or `normalize_saltedge`) to produce a `NormalizedSnapshot`, and calls `CanonicalRepository(tx_session).persist_snapshot(...)` to upsert into the four canonical tables.
- The whole canonical block is wrapped in `try/except Exception` so canonical failures NEVER kill the Plaid/SaltEdge pull thread — `bank_data_snapshots` continues to record the raw payload regardless.
- Canonical persistence is idempotent: the postgres unique constraint on `(provider_name, provider_transaction_id)` deduplicates re-runs.

### Read flow
- `GET /v1/applications/{id}/transactions` (and the `/v1/applicants/...` alias) reads from postgres `canonical_transactions` first when the `INTAKE_CANONICAL_TRANSACTIONS_READ` env var is `true`, falling back transparently to the legacy `bank_data_snapshots` path otherwise. Both paths return a `source` field (`"canonical_transactions"` or `"bank_data_snapshots"`) so consumers can tell which side served the data.
- `GET /v1/applications` exposes per-row `transactions_count` and `transactions_synced_at` populated by a single grouped query (`_bulk_canonical_transaction_summary`) that joins `canonical_transactions` to `raw_provider_payloads.received_at` — N+1 safe.

### Frontend
- `BackendApplication` in `frontend/lib/application-types.ts` exposes the two new optional fields. The Next.js proxy at `frontend/app/api/applications/route.ts` passes them through and the dummy-data fallback emits `transactions_count: 0, transactions_synced_at: null` so dev mode renders cleanly.
- No UI changes in this PR — surfacing the count in the dashboard is a follow-up.

### Tests
- `backend/tests/infra/test_canonical_repository_persist.py` — 5 tests (Plaid/SaltEdge happy path, idempotency on `provider_transaction_id`, name truncation, payload-as-dict, no `fetched_at`).
- `backend/tests/interface/test_application_transactions_canonical.py` — 3 tests (canonical-on returns canonical rows, flag-off falls back to legacy, postgres-unavailable falls through).
- `backend/tests/interface/test_application_endpoint.py` — 1 new test for `transactions_count` / `transactions_synced_at` on the list response.
- All 9 new tests pass; full backend suite at 357 passing (was 348).

### Observability
- Every successful canonical persistence emits `[canonical.plaid] applicant=… txns=N persisted` or `[canonical.saltedge] …`. Failures emit `[canonical.plaid] persist failed (non-fatal)` via `logger.exception`.
- The repository writer logs `[canonical] truncated counterparty_name len=… to 500` at DEBUG when a name exceeds 500 chars.
- The read endpoint includes the `source` field so logs of downstream API consumers can filter by canonical vs. legacy.

### Deployment
- `backend/cloudbuild.yaml` adds `POSTGRES_CLOUD_SQL_CONNECTION_NAME`, `POSTGRES_DB_NAME`, and `INTAKE_CANONICAL_TRANSACTIONS_READ=false` to `--set-env-vars`; binds `POSTGRES_DB_USER` and `POSTGRES_DB_PASSWORD` from new Secret Manager entries; appends the second instance to `--add-cloudsql-instances`. Cloud SQL Auth Proxy supports both instances on a single Cloud Run revision.
- **Deploy preconditions** (must be done before redeploy):
  1. Secret Manager entries `postgres-db-user` and `postgres-db-password` created in `elemental-day-443510-e0` and granted to the Cloud Run service account.
  2. The four canonical tables and `raw_provider_payloads` exist on the postgres instance with the expected columns (verified via lead's live recon during planning).
  3. Initial deploy ships with `INTAKE_CANONICAL_TRANSACTIONS_READ=false`. Flip to `true` after data has accumulated for ~24h.

## Definition of Done
1. Submitting an application that connects Plaid or SaltEdge accounts results in non-zero rows on `raw_provider_payloads`, `canonical_financial_accounts`, and `canonical_transactions` in the postgres instance.
2. `GET /v1/applications/{id}/transactions?... ` returns `source: "canonical_transactions"` and the persisted transactions when the feature flag is on.
3. `GET /v1/applications` returns `transactions_count` and `transactions_synced_at` for every application (null when no canonical rows yet).
4. Backend test suite at 357+ passing.
5. Canonical persistence failures NEVER crash the bg worker (verified by `try/except` wrap and a unit test for the unavailable-engine path).
