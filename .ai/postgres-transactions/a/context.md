# Postgres Transactions — Implementer Context Map

Working directory: `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/zen-solomon-13f3f4`
Branch: `feat/postgres-transactions` off `origin/main` @ `13a660c`.

## 1. Existing transaction sync flow

### Submit handler kicks off background pulls

* `POST /v1/applications` is `create_application` at `backend/src/interface/http_endpoints.py:2001-2202`.
* After persistence (`submit_housing_application` at line 2079) and consent reload (lines 2143-2159), it dispatches:
  * `_kick_off_plaid_submit_pull(application, consents)` (line 2165) when `country_code == "US"`.
  * `_kick_off_saltedge_submit_pull(application)` (line 2167) for any non-US country.
* Both helpers (`backend/src/interface/http_endpoints.py:135-216`) `threading.Thread(... daemon=True).start()` a worker that opens `_BankPullSessionLocal()` (= `SessionLocal` re-imported, line 112) and runs `run_submit_plaid_pull` / `run_submit_saltedge_pull`.

### Background workers fetch + persist raw payloads

* `run_submit_plaid_pull` at `backend/src/usecase/bank_data_pull.py:194-258`. For each consent, calls Plaid for products `balances`, `transactions`, `liabilities`, `asset_report`, `asset_report_full` via `_run_with_retry` (line 122) which writes one row per attempt to MySQL `bank_data_snapshots`. Successful payload is stored verbatim in `BankDataSnapshotModel.payload` (`backend/src/infra/mysql/models.py:189`, JSONB on postgres / JSON elsewhere).
* `run_submit_saltedge_pull` at `backend/src/usecase/bank_data_pull.py:493-…`. Iterates `OpenBankingConsentModel` rows via `SQLSaltEdgeConsentRepository.list_live_by_application` (lines 576-583), pulls SaltEdge `connection`, `accounts`, `transactions`, `holder_info`, `customer_reports` per connection, writes each raw response to `bank_data_snapshots` with `consent_id` set.

### Normalisation + canonical persistence — DEFINED BUT NOT WIRED

* `PlaidPayloadAdapter.map_transactions` at `backend/src/services/payload_adapters.py:89-112`. Input: `transactions_payload["transactions"][]` from Plaid `/transactions/get`. Output: `List[CanonicalTransaction]` (domain model in `backend/src/domain/canonical_bank_data.py`). Convention: amount is `float(raw["amount"])` (Plaid sign: positive=debit). Maps `transaction_id, account_id, amount, iso_currency_code, name, merchant_name, category[0], date / authorized_date, pending`.
* `SaltEdgePayloadAdapter.map_transactions` at `backend/src/services/payload_adapters.py:182-209`. Input: `transactions_payload["data"][]`. **Negates amount** (line 194) so canonical convention matches Plaid (positive=debit).
* `NormalizationService.normalize_plaid` / `.normalize_saltedge` at `backend/src/services/normalization_service.py:391,419` — wraps the adapters and applies FX + validation, returning `NormalizedSnapshot(applicant_id, application_id, provider, accounts, transactions, snapshot_ts)`.
* `CanonicalRepository.persist_snapshot` at `backend/src/infra/mysql/canonical_repository.py:46-87`. Writes one optional `RawProviderPayloadModel` row, then upserts `CanonicalFinancialAccountModel` keyed by `(applicant_id, provider_name, provider_account_id)` (lines 130-137), then upserts `CanonicalTransactionModel` keyed by `(applicant_id, provider_name, provider_transaction_id)` (lines 198-206). Commits at line 74. **This entire pipeline is dead code in production today** — `grep -rn "persist_snapshot\|CanonicalRepository(" backend/` returns ONLY the definition; no caller exists.

**Implication:** `canonical_transactions` is empty today even on the existing MySQL instance. The postgres move must also wire the pipeline up for the first time.

## 2. Existing transaction read flow

### `GET /v1/applications/{application_id}/transactions`

* Defined at `backend/src/interface/http_endpoints.py:2817-2869`. Alias `/v1/applicants/{application_id}/transactions` at line 2816 (added in PR #125 = commit `e876c65`; commit `3015feb` on `origin/fix/prod-dashboard-transactions-route` is the unmerged duplicate of that fix and brings nothing new — `git show 3015feb -- backend/src/interface/http_endpoints.py` shows ONLY a one-line decorator addition that already exists in main).
* Auth dep: `_APPLICATION_DETAIL_USER_DEPENDENCY = get_current_user_optional_lenient` (line 258, def at `backend/src/interface/auth_endpoints.py:277-290`). The dep is **lenient** — invalid/missing tokens return `current_user=None`; the handler does NOT enforce role. So 401 is not the issue.
* Body: loads `HousingApplicationModel` to verify the application exists (404 only on miss). Then iterates `SQLBankDataSnapshotRepository(db).list_latest_for_user(application_id)` (`backend/src/infra/mysql/bank_data_snapshot_repository.py:106`), filtering `status == "succeeded"`. For each snapshot it dispatches to one of `_normalise_plaid_transactions` (line 2569), `_normalise_plaid_asset_report_full_transactions` (line 2612), `_normalise_saltedge_transactions` (line 2653) and concatenates the results.
* Response: `{applicant_id, start_date, end_date, transactions[], total, dashboard_loan_adapter, dashboard_snapshot_adapter}` (lines 2858-2868). Date filtering at lines 2851-2854. Sorted desc by date.

### Other transaction-shaped endpoints

* `GET /transactions` at line 3403 (response_model=`TransactionDataResponse`) — **direct Plaid live fetch via access_token query param** (`access_token=...&lookback_days=730`). Not used by the dashboard for application history. Out of scope.
* `POST /payments/history` at line 3525 — aggregates Plaid + SaltEdge live, used by `/v1/applications/{id}/payment-history` at line 2872. Out of scope.

## 3. Database engine configuration (current single-engine design)

* `backend/src/config/database.py:18` — `Base = declarative_base()` (single base for ALL models in the app).
* `backend/src/config/database.py:94-178` — `_default_engine()`:
  * Production (`APP_ENV in {prod, production}`): requires `CLOUD_SQL_CONNECTION_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Driver chosen by `CLOUD_SQL_DRIVER` env var (`pymysql` default, `pg8000` if set to `pg8000|postgres|postgresql`). Returns `_cloud_sql_engine` (MySQL via `pymysql`) or `_cloud_sql_postgres_engine` (postgres via `pg8000`).
  * Local: `DATABASE_URL` (sqlite/postgres) → host/user/pw → CLOUD_SQL_CONNECTION_NAME → fallback `sqlite:///./app.db`.
  * `_cloud_sql_postgres_engine` already exists at lines 52-73 (driver `pg8000`, URL prefix `postgresql+pg8000://`, NullPool, pool_pre_ping).
* `engine` (line 181) and `SessionLocal` (line 182) are module-level singletons. `get_db()` (line 185) is the FastAPI Session dependency.
* `backend/src/infra/mysql/database.py` is a 4-line shim re-exporting `Base, SessionLocal, engine, get_db` for legacy imports.
* `backend/src/main.py:34-50` runs `Base.metadata.create_all(bind=engine)` on FastAPI startup. **Importing `from src.infra.mysql import models` (line 41) registers EVERY model on the single Base** — including the four canonical/raw tables.
* No prior pattern in the repo for routing different writers to different engines: `grep -rn "bind_to_engine\|secondary_engine\|multiple_engines" backend/` returns nothing.

## 4. Tables that MUST move to postgres (the FK closure)

`CanonicalTransactionModel` (`backend/src/infra/mysql/models.py:616-645`) declares two FKs:

| column | references |
| --- | --- |
| `account_id` | `canonical_financial_accounts.id` |
| `raw_payload_id` | `raw_provider_payloads.id` |

`CanonicalFinancialAccountModel` (lines 586-613) FKs `raw_provider_payloads.id`.
`CanonicalIdentityProfileModel` (lines 677-707) ALSO FKs `raw_provider_payloads.id`.
`CanonicalIncomeSummaryModel` (lines 648-674) has NO FKs.

Postgres cannot enforce a foreign key onto a table on a different engine. So the **closure that must move together** is:

1. `raw_provider_payloads`
2. `canonical_financial_accounts`
3. `canonical_transactions`
4. `canonical_identity_profiles`

`canonical_income_summaries` can technically stay, but is moved with the others for symmetry (its only consumer accepts an injected `Session`).

### Read-site inventory (every place that queries the canonical models)

* `backend/src/infra/mysql/canonical_repository.py:130, 199` — `CanonicalRepository._upsert_accounts/_upsert_transactions` (the would-be writers).
* `backend/src/infra/mysql/canonical_repository.py:101` — `_write_raw_payload` writer of `RawProviderPayloadModel`.
* `backend/src/infra/mysql/raw_provider_payload_repository.py:33,55-63` — list/insert helpers for `RawProviderPayloadModel`.
* `backend/src/services/feature_computation_service.py:10,37-41` — only production reader of `CanonicalTransactionModel`. Receives `Session` via `__init__(self, db: Session)` so re-pointing is a one-line change.
* No other `models.CanonicalTransactionModel` / `CanonicalFinancialAccountModel` / `RawProviderPayloadModel` references exist in production code (verified by `grep` listed in the prompt).

### Write-site inventory

Same as above — `CanonicalRepository.persist_snapshot` and `RawProviderPayloadRepository`. Both are unused in production today.

## 5. Encryption portability

`backend/src/infra/mysql/models.py:19-20`:

```python
EncryptedText = Text
def EncryptedString(length): return String(length)
```

These are **bare type aliases**. No application-level cipher, no key source, no MySQL plug-in dependency. The columns are stored as plain `TEXT` / `VARCHAR(n)` on whichever engine is chosen. **Verdict: portable as-is. Postgres needs no special handling.**

The only postgres-aware cell in the existing models is `BankDataSnapshotModel.payload` (line 189): `Column(_JSONB().with_variant(JSON, "mysql").with_variant(JSON, "sqlite"))`. The canonical models do not use this; they use plain `Text`, `Integer`, `Numeric`, etc., which are fully portable.

## 6. Migration strategy

### Existing pattern

* No alembic anywhere. `find . -name "alembic*"` is empty.
* `backend/migrations/*.sql` files (`000_platform_tables.sql` … `012_relax_application_legacy_columns.sql`) are MySQL-flavoured (`AUTO_INCREMENT`, `LONGTEXT`, backticks). `backend/migrations/run_migration.py` walks them in order and writes a `schema_migrations` row per file. Idempotent at the file level.
* `Base.metadata.create_all(bind=engine)` on startup (`backend/src/main.py:44`) is the de-facto bootstrap path, including for the canonical tables (registered when `from src.infra.mysql import models` runs at line 41).

### Recommended approach for postgres

1. **Split Base.** Add `TxBase = declarative_base()` in a new module `backend/src/infra/postgres/database.py`. Move the four FK-closure model classes into `backend/src/infra/postgres/models.py`, swapping `from .database import Base` → `from .database import TxBase` and `class X(Base)` → `class X(TxBase)`. Re-export from `backend/src/infra/mysql/models.py` as deprecation shims so existing imports keep working short-term.
2. **Add second engine.** In `backend/src/config/database.py` add `tx_engine` + `TxSessionLocal` + `get_tx_db` mirroring lines 181-191. Source env: `POSTGRES_CLOUD_SQL_CONNECTION_NAME`, `POSTGRES_DB_USER`, `POSTGRES_DB_PASSWORD`, `POSTGRES_DB_NAME`. Reuse `_cloud_sql_postgres_engine` (already at lines 52-73).
3. **Bootstrap.** Add `TxBase.metadata.create_all(bind=tx_engine)` next to the existing `create_all` in `backend/src/main.py:44`. Idempotent on every boot.
4. **Explicit DDL.** Add `backend/migrations/postgres/010_canonical_transactions.sql` (postgres dialect: `BIGSERIAL`, `BOOLEAN`, `JSONB`, `TIMESTAMPTZ`, no backticks, `CREATE TABLE IF NOT EXISTS`) so DBAs have a reviewable artefact and `run_migration.py` can route a postgres-tagged file to `tx_engine`. Optional for this task; `create_all` is sufficient.
5. **Schema-mismatch detection.** On startup, if any of the four tables exists with different columns, `create_all` is a no-op — the diff is silent. To detect a mismatch safely: at startup, iterate the four tables and `inspect(tx_engine).get_columns(name)`; raise on column-set mismatch. (Optional Phase-2.)

### Two paths the implementer must support

(a) Postgres is empty → `create_all` builds the four tables. Done.
(b) Postgres has prior tables (the user is sending `\dt` separately) → enumerate columns; if names match, proceed; otherwise abort startup with a clear error. Don't ALTER blindly.

## 7. Application submit flow — sync trigger point

* Sync is triggered **synchronously** in the request handler, but executes **asynchronously** on a daemon thread. The HTTP response returns at line 2200 of `http_endpoints.py` long before the bank pull completes.
* The thread opens its OWN `_BankPullSessionLocal()` because the request-scoped `db` session is closed when the response returns.
* **Where to insert canonical persistence:** inside `run_submit_plaid_pull` (`backend/src/usecase/bank_data_pull.py:194`) and `run_submit_saltedge_pull` (line 493), AFTER each successful raw payload write. The simplest seam: wrap the success branch of `_run_with_retry` (line 178-191) so when `product_type == 'transactions'` (Plaid) or after every (`accounts` + `transactions`) pair (SaltEdge) we run:
  ```python
  with TxSessionLocal() as tx_session:
      adapter = PlaidPayloadAdapter()
      snapshot_dom = adapter.map(balances_payload=..., transactions_payload=...)
      service = NormalizationService(fx_rates=...)
      normalized = service.normalize_plaid(applicant_id=..., application_id=..., balances_payload=..., transactions_payload=...)
      CanonicalRepository(tx_session).persist_snapshot(normalized, raw_payload=transactions_payload, object_type="open_banking_refresh")
  ```
* `applicant_id` (a `String(36)`/UUID-shaped column) currently has no canonical source for housing applicants. The `ApplicantModel.applicant_id` (`backend/src/infra/mysql/models.py:381`) is `String(36)` and is the right key — but it's only created on the customer-API path. For housing applicants, the implementer must derive a stable applicant_id from `application.id` (e.g. `f"app-{application.id:08d}"`) and store it on the `applications` row OR provision an `applicants` row at submit time. The simpler choice is the deterministic string mapping; consistent on read+write.

## 8. `/api/applications` list endpoint shape & ApplicationResponse consumers

### Endpoint

* `GET /v1/applications` at `backend/src/interface/http_endpoints.py:2270-2313`. Calls `_load_housing_applications(db, limit, phone, residence_permit_number)` at line 2295 → returns `list[ApplicationResponse]`. Helper at lines 1504-1547 issues a single `_resolve_application_metadata` call (line 1532) for the page and builds responses via `_application_to_response`.
* `_application_to_response` at lines 1239-1296 — builds `ApplicationResponse`. Currently sets `credit_score=None` (line 1295). It is the canonical adapter for ALL response sites.

### Schema today

`ApplicationResponse` at `backend/src/interface/schemas.py:136-160`:

```
id, email, phone, country, property_type, purchase_intent, budget_range, savings,
income, income_currency, employment_status, financing_consent, full_name,
agree_policy, receive_updates, skipped_connect_accounts, connected_accounts,
created_at, archived, metadata, identifier, review_status,
login_credentials, credit_score
```

### Adding `transactions_count` and `transactions_synced_at`

* Add as `Optional[int] = None` and `Optional[datetime] = None` on `ApplicationResponse`.
* Populate inside `_application_to_response` by:
  * issuing a one-shot `select count(*), max(rpp.received_at)` from postgres for the page's applicant_ids and threading the dict into `_resolve_application_metadata` (or a sibling helper). N+1 must be avoided.
* Frontend consumers:
  * `frontend/lib/application-types.ts:28-68` — `BackendApplication` interface. Add the two optional fields.
  * `frontend/app/api/applications/route.ts` (this proxy + the dummy-data branch at lines 83-107). Update the `dummyApps` shape so dev fallback also exposes the fields.
  * `frontend/lib/affluence-scoring.ts`, `credit-risk.ts`, `financial-insights.ts`, `wiki-profile-service.ts`, `application-types.ts` — `grep -l BackendApplication` showed these. Most read existing fields only; verify none break on the additional optional fields (they shouldn't, since TypeScript optional fields are additive).

### Backend response sites of `ApplicationResponse`

`grep -n "ApplicationResponse\b" backend/` shows only `schemas.py` (definition) and `http_endpoints.py` consumers at lines 2003, 2272 (response_model), 2401, 3033 (response_model), and 1244, 1269, 1483 (factory). All flow through `_application_to_response`, so a single change populates them all.

## 9. Existing tests + observability state

* Backend tests: `backend/tests/services/test_payload_adapters.py` covers the adapter shape; `backend/tests/interface/test_application_endpoint.py` covers the create endpoint; no test exists for `GET /v1/applications/{id}/transactions` (verified via `grep -rln "applications.*transactions" backend/tests/` returning only `test_plaid_asset_report_dashboard_normalisers.py` which tests the normaliser helper, not the route). No tests reference `CanonicalRepository` or `persist_snapshot`.
* Playwright covers the dashboard's transactions tab in `frontend/eHousing_Web/tests/testcases/applicants-dashboard-{dev,edge-dev,extra-dev}-tests.spec.ts` — these will be the integration check post-merge.
* Logging in the sync path: `logger.info("[saltedge.pull] …")` and `[saltedge.submit]` at multiple points in `bank_data_pull.py` (e.g. lines 514, 555, 579, 596, 602); `logger.info("CanonicalRepository persisted snapshot for applicant …")` already in place at `canonical_repository.py:75-79` (but unreached today). No Sentry / no metrics — out of scope per prompt §9.

## 10. Deployment safety analysis

### Current Cloud Build / Cloud Run config (`backend/cloudbuild.yaml`)

```
--set-env-vars=DB_NAME=lita_production,CLOUD_SQL_CONNECTION_NAME=elemental-day-443510-e0:us-central1:lita-mysql
--set-secrets=DB_USER=db-user:latest,DB_PASSWORD=db-password:latest
--add-cloudsql-instances=elemental-day-443510-e0:us-central1:lita-mysql
```

### Required changes

```
--set-env-vars=DB_NAME=lita_production,
              CLOUD_SQL_CONNECTION_NAME=elemental-day-443510-e0:us-central1:lita-mysql,
              POSTGRES_CLOUD_SQL_CONNECTION_NAME=elemental-day-443510-e0:us-central1:lita-ehousing,
              POSTGRES_DB_NAME=lita-ehousing
--set-secrets=DB_USER=db-user:latest,DB_PASSWORD=db-password:latest,
              POSTGRES_DB_USER=postgres-db-user:latest,
              POSTGRES_DB_PASSWORD=postgres-db-password:latest
--add-cloudsql-instances=elemental-day-443510-e0:us-central1:lita-mysql,elemental-day-443510-e0:us-central1:lita-ehousing
```

* **Cloud SQL Auth Proxy supports multiple instances on a single Cloud Run revision** via comma-separated `--add-cloudsql-instances`. Verified by Google Cloud docs (no repo evidence to the contrary).
* New Secret Manager entries `postgres-db-user` and `postgres-db-password` must be created in the `elemental-day-443510-e0` project before deploy.
* The Cloud Run service must be redeployed (cannot be runtime-updated since secrets/instances change).
* No down-migration is needed; rolling forward is sufficient because postgres tables are net-new.

## 11. Hypotheses for what's broken today

User report: `https://ehousing.joinlita.com/api/v1/applications/{id}/transactions` doesn't show transaction history.

Most likely (in descending probability):

1. **`canonical_transactions` is never written.** `CanonicalRepository.persist_snapshot` is dead code; the read endpoint at `backend/src/interface/http_endpoints.py:2818-2869` reads from `bank_data_snapshots` (raw) and returns `[]` whenever no rows have `status='succeeded'` for that user_id. **This is the core defect — there is no canonical row for ANY applicant today.**
2. **`bank_data_snapshots` rows exist but `status != 'succeeded'`.** The handler filters at line 2842; if the Plaid pull failed/timed out for the applicant the response is `[]`. This compounds (1) on the existing path.
3. **`application_id` vs `user_id` mismatch in `list_latest_for_user`.** Comment on `CreditScoreModel` at `backend/src/infra/mysql/models.py:209-211` and the snapshot write in `bank_data_pull.py:148, 252` both use `application.id` as `user_id`. The READ side at `http_endpoints.py:2841` calls `snap_repo.list_latest_for_user(application_id)` — verified to be the same int, so this is NOT the issue. Listed for completeness.
4. **Auth-token propagation** is NOT the cause: `_APPLICATION_DETAIL_USER_DEPENDENCY` at line 2823 is `get_current_user_optional_lenient` (`backend/src/interface/auth_endpoints.py:277-290`) which returns `None` on missing/invalid tokens and the handler does NOT enforce the user. So the endpoint replies 200 + payload regardless of auth.
5. **`/v1/applicants/...` alias was missing in some prior production revision.** PR #125 (commit `e876c65`) added the alias to main; the unmerged `origin/fix/prod-dashboard-transactions-route` (commit `3015feb`) is the same one-line change and is now redundant. If the production Cloud Run revision was deployed BEFORE `e876c65`, dashboard calls to `/v1/applicants/{id}/transactions` would 404. Verify the prod revision SHA before chasing this; it is unrelated to the postgres move.

## 12. DeploymentSafety

**NEEDS-MIGRATION.**

Justification:
* New env vars (`POSTGRES_CLOUD_SQL_CONNECTION_NAME`, `POSTGRES_DB_USER`, `POSTGRES_DB_PASSWORD`, `POSTGRES_DB_NAME`) must be set on the Cloud Run revision before the new image starts, otherwise `_default_engine` for the postgres path will raise `RuntimeError` and the pod will crashloop (`backend/src/config/database.py:113-118`).
* Two new secrets must exist in Secret Manager before redeploy (`postgres-db-user`, `postgres-db-password`).
* `--add-cloudsql-instances` must include the new instance.
* Backwards compatibility on the read endpoint is preserved by keeping the `bank_data_snapshots` fallback for the first deploy window — non-breaking for the API consumers.
* No data migration of existing rows is required (postgres starts empty; canonical pipeline back-fills on the next Plaid/SaltEdge pull).
