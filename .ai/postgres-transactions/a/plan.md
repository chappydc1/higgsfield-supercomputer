# postgres-transactions — Implementation Plan

> All file paths verified against branch `feat/postgres-transactions` off `origin/main` @ `13a660c`.
> Live postgres recon results are folded into this plan (see `logs/phase-23.prompt.md`).

## Status

Phases: 7
- [ ] Phase 4a — DB layer: postgres engine, `TxBase`, model split, schema-mismatch reconciliation
- [ ] Phase 4b — Wire `CanonicalRepository.persist_snapshot` into Plaid/SaltEdge bg workers
- [ ] Phase 4c — Read endpoint reads `canonical_transactions` (with feature-flag fallback)
- [ ] Phase 4d — `ApplicationResponse` + list endpoint: `transactions_count` / `transactions_synced_at`
- [ ] Phase 4e — Frontend type + proxy updates
- [ ] Phase 4f — Tests
- [ ] Phase 4g — `cloudbuild.yaml` + `CHANGELOG` + `about.md`

## Rollback Plan

Each phase commits independently. The dual-engine setup is gated behind `INTAKE_CANONICAL_TRANSACTIONS_READ` (read-side) and the existence of postgres env vars (write-side). If the postgres engine fails to initialize at startup, fall back logs an error and the app continues with MySQL-only behaviour (no transactions surfaced); the read endpoint serves the legacy `bank_data_snapshots` path. Roll forward by reverting the Cloud Run revision (<60s) — the postgres tables are net-new writes; no data lost on rollback.

## Deploy preconditions checklist

- [ ] Secret Manager entries `postgres-db-user` and `postgres-db-password` created in project `elemental-day-443510-e0` and granted to the Cloud Run service account.
- [ ] postgres tables verified to exist with expected columns: `canonical_transactions`, `canonical_financial_accounts`, `raw_provider_payloads`, `canonical_identity_profiles` (verified by lead during planning — see prompt).
- [ ] env var `INTAKE_CANONICAL_TRANSACTIONS_READ` defaults to `false` on first deploy. After data has been written for ~24h, flip to `true`.

---

## Phase 4a — DB layer: postgres engine, TxBase, model split

### Files to touch
- `backend/src/config/database.py` (lines 18-191) — add `tx_engine`, `TxSessionLocal`, `get_tx_db`. Keep existing `engine`/`SessionLocal` untouched.
- `backend/src/infra/postgres/__init__.py` (new file)
- `backend/src/infra/postgres/database.py` (new file) — declares `TxBase = declarative_base()`.
- `backend/src/infra/postgres/models.py` (new file) — moves the four FK-closure models plus `CanonicalIncomeSummaryModel` from `backend/src/infra/mysql/models.py:554-707`.
- `backend/src/infra/mysql/models.py:554-707` — replace each moved class with `from src.infra.postgres.models import RawProviderPayloadModel, …` (re-export, do NOT delete from this file's imported namespace yet — too many call sites).

### Steps

1. Create `backend/src/infra/postgres/database.py` with:
   ```python
   from sqlalchemy.orm import declarative_base
   TxBase = declarative_base()
   ```

2. Create `backend/src/infra/postgres/models.py` containing five classes copied verbatim from `backend/src/infra/mysql/models.py` lines 554-707 (`RawProviderPayloadModel`, `CanonicalFinancialAccountModel`, `CanonicalTransactionModel`, `CanonicalIdentityProfileModel`, `CanonicalIncomeSummaryModel`), with these adjustments:
   - Replace `from src.infra.mysql.database import Base` (or the existing alias) with `from src.infra.postgres.database import TxBase`.
   - Change every `class X(Base):` → `class X(TxBase):`.
   - Move `EncryptedString`, `EncryptedText` aliases (mysql/models.py:19-20) into this module too — they are bare type aliases (`Text`, `String(n)`), no MySQL-specific code. Confirmed safe.
   - `RawProviderPayloadModel.payload`: change from `Column(EncryptedText, nullable=False)` to `Column(JSONB, nullable=False)` (import `from sqlalchemy.dialects.postgresql import JSONB`). The postgres column is native `jsonb`. Writers must pass a dict, not a JSON string.
   - `RawProviderPayloadModel.fetched_at`: **drop this column** — the postgres table has no `fetched_at` column. (Confirmed via `\d raw_provider_payloads` — only `received_at` and `processed_at` exist.) Code that sets `fetched_at` (`canonical_repository.py:108`) is updated in Phase 4b.
   - `CanonicalTransactionModel.counterparty_name`, `merchant_name`: change `EncryptedString(2048)` to `EncryptedString(500)` to match postgres column width.

3. In `backend/src/infra/mysql/models.py`, after the imports block (~line 19) add:
   ```python
   from src.infra.postgres.models import (  # noqa: F401  (legacy import path)
       RawProviderPayloadModel,
       CanonicalFinancialAccountModel,
       CanonicalTransactionModel,
       CanonicalIdentityProfileModel,
       CanonicalIncomeSummaryModel,
   )
   ```
   Then **delete** the original class definitions at lines 554-707 (they now live in `postgres/models.py`). Existing imports `from src.infra.mysql.models import CanonicalTransactionModel` continue to work via the re-export.

4. In `backend/src/config/database.py`, after `SessionLocal = sessionmaker(...)` (~line 182), add a parallel block:
   ```python
   def _postgres_tx_engine() -> Engine | None:
       app_env = os.getenv("APP_ENV", "local").strip().lower()
       is_production = app_env in {"prod", "production"}

       conn_name = os.getenv("POSTGRES_CLOUD_SQL_CONNECTION_NAME")
       db_user   = os.getenv("POSTGRES_DB_USER")
       db_pass   = os.getenv("POSTGRES_DB_PASSWORD")
       db_name   = os.getenv("POSTGRES_DB_NAME")

       if is_production:
           if not all([conn_name, db_user, db_pass, db_name]):
               logger.warning(
                   "Postgres engine not configured: missing POSTGRES_* env vars; "
                   "canonical_transactions writes will be skipped."
               )
               return None
           connector = Connector()
           atexit.register(connector.close)
           return _cloud_sql_postgres_engine(connector, conn_name, db_user, db_pass, db_name)

       # Local: prefer POSTGRES_DATABASE_URL, then host/port/user/pw, then None.
       database_url = os.getenv("POSTGRES_DATABASE_URL")
       if database_url:
           return create_engine(database_url, pool_pre_ping=True)
       host = os.getenv("POSTGRES_DB_HOST")
       if host and all([db_user, db_pass, db_name]):
           port = int(os.getenv("POSTGRES_DB_PORT", "5432"))
           url = URL.create(
               drivername="postgresql+pg8000",
               username=db_user, password=db_pass,
               host=host, port=port, database=db_name,
           )
           return create_engine(url, pool_pre_ping=True)
       return None  # tests / local without postgres


   tx_engine = _postgres_tx_engine()
   TxSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=tx_engine) if tx_engine else None


   def get_tx_db():
       if TxSessionLocal is None:
           raise RuntimeError("Postgres transaction engine is not configured.")
       db = TxSessionLocal()
       try:
           yield db
       finally:
           db.close()
   ```

5. Do NOT add `TxBase.metadata.create_all(...)` to `backend/src/main.py`. Tables already exist on production postgres. (See deploy precondition checklist.)

### Acceptance criteria

- `backend/src/infra/postgres/database.py` and `backend/src/infra/postgres/models.py` exist and import cleanly.
- `from src.infra.mysql.models import CanonicalTransactionModel` still works (legacy re-export).
- `tx_engine` is `None` if `POSTGRES_*` env vars are absent — no startup crash.
- `tx_engine` connects successfully when env vars point to local proxy (lead can verify via `127.0.0.1:5432`).
- Running `python -m py_compile` on every changed file passes.
- `pytest backend/tests/services/test_payload_adapters.py` still passes (sanity).

### Risks
- **Dual `Base` collision risk**: a model accidentally extending the wrong base. Mitigated by deleting the originals; only re-export remains.
- **`payload jsonb` write contract change**: callers must now pass a dict not a JSON string. Phase 4b drops the `json.dumps` in `_write_raw_payload`.
- **Two ENV var families** add deploy complexity. Documented in the precondition checklist.

---

## Phase 4b — Wire CanonicalRepository.persist_snapshot into Plaid/SaltEdge bg workers

### Files to touch
- `backend/src/infra/mysql/canonical_repository.py:46-114` — adjust to match postgres schema (drop `fetched_at`, pass dict not JSON string).
- `backend/src/usecase/bank_data_pull.py:178-258` (Plaid) and `:493-688` (SaltEdge) — invoke canonical persistence after each successful raw transaction-pull.
- `backend/src/services/normalization_service.py` — read-only; verify `normalize_plaid` / `normalize_saltedge` signatures used.

### Steps

1. **Move `CanonicalRepository`** to `backend/src/infra/postgres/canonical_repository.py`. Update its imports:
   - `from src.infra.postgres import models` (the moved tables)
   - Remove `payload=json.dumps(payload, default=str)`; pass `payload=payload` (the dict). Postgres `JSONB` column accepts a dict via `pg8000`/SQLAlchemy.
   - Drop `fetched_at=snapshot.snapshot_ts` from the `RawProviderPayloadModel(...)` constructor (column no longer on the model).
   - Add a defensive truncation step inside `_upsert_transactions` BEFORE the `setattr`/`update` calls:
     ```python
     def _truncate(value: Optional[str], limit: int) -> Optional[str]:
         if value is None: return None
         s = str(value)
         if len(s) <= limit: return s
         logger.debug("[canonical] truncated field len=%d to %d", len(s), limit)
         return s[:limit]
     # …
     row.counterparty_name = _truncate(txn.counterparty_name, 500)
     row.merchant_name     = _truncate(txn.merchant_name, 500)
     # description_original is TEXT — no truncation
     ```
   - Re-export from `backend/src/infra/mysql/canonical_repository.py` for legacy import paths.

2. **Define applicant_id derivation** as a single helper in `backend/src/usecase/bank_data_pull.py` (top of file):
   ```python
   def _derive_applicant_id_from_application(application_id: int) -> str:
       """Stable applicant_id for housing applications used by canonical_*."""
       return f"app-{application_id:08d}"
   ```
   This is the value written to `canonical_*.applicant_id` and the value the read endpoint must lookup. Document the convention in `about.md`.

3. **Plaid wire-up** at `bank_data_pull.py:194-258` (`run_submit_plaid_pull`):
   - After `_run_with_retry(plaid_kyc_gateway.fetch_transactions, ...)` returns successfully (around lines 178-191 / the line that writes the `transactions` snapshot), and after `bank_data_snapshots` row is committed, invoke:
     ```python
     try:
         from src.config.database import TxSessionLocal
         from src.infra.postgres.canonical_repository import CanonicalRepository
         from src.services.normalization_service import NormalizationService
         from src.services.payload_adapters import PlaidPayloadAdapter

         if TxSessionLocal is None:
             logger.info("[canonical] postgres engine not configured; skipping canonical write")
         else:
             applicant_id = _derive_applicant_id_from_application(application.id)
             with TxSessionLocal() as tx_session:
                 service = NormalizationService(fx_rates=DEFAULT_FX_RATES)  # reuse module constant
                 normalised = service.normalize_plaid(
                     applicant_id=applicant_id,
                     application_id=application.id,
                     balances_payload=balances_payload or {"accounts": []},
                     transactions_payload=transactions_payload,
                 )
                 CanonicalRepository(tx_session).persist_snapshot(
                     normalised,
                     raw_payload=transactions_payload,
                     object_type="transactions",
                 )
                 logger.info("[canonical.plaid] applicant=%s txns=%d persisted",
                             applicant_id, len(normalised.transactions))
     except Exception:  # never fail the bg worker on canonical errors
         logger.exception("[canonical.plaid] persist failed")
     ```
   - The `try/except Exception` wrap is critical: canonical persistence must NEVER fail the Plaid pull thread. Sync continues to write `bank_data_snapshots` regardless.

4. **SaltEdge wire-up** at `bank_data_pull.py:493+` (`run_submit_saltedge_pull`):
   - After each connection's `transactions` pull succeeds, invoke the same pattern but with `service.normalize_saltedge(applicant_id=..., application_id=..., accounts_payload=..., transactions_payload=...)` and `provider="saltedge"`.

5. **Confirm `NormalizationService` signature**:
   - `backend/src/services/normalization_service.py:391` defines `normalize_plaid(self, *, applicant_id, application_id, balances_payload, transactions_payload)`. Match this exactly.
   - `:419` defines `normalize_saltedge(self, *, applicant_id, application_id, accounts_payload, transactions_payload)`. Match this exactly.

6. **`object_type` value**: postgres `raw_provider_payloads.object_type` accepts up to `varchar(100)`. Use `"transactions"` for both providers (canonical persistence-time category). The plain `bank_data_snapshots.product_type` already records the granular Plaid product separately.

### Acceptance criteria

- A successful Plaid pull writes one row to each of: `raw_provider_payloads`, `canonical_financial_accounts` (one per account), `canonical_transactions` (one per txn).
- A successful SaltEdge pull writes the same.
- Canonical persistence failure is caught + logged but does NOT crash the worker thread.
- Duplicate ingestion (re-run with same `provider_transaction_id`) is a no-op; only the first row persists. (Confirmed by the unique constraint `(provider_name, provider_transaction_id)` on postgres.)
- `applicant_id` is `f"app-{application.id:08d}"` for every row.
- Logs include `[canonical.plaid]` / `[canonical.saltedge]` lines with `applicant=` and `txns=` count.

### Risks

- **Sync-time perf**: canonical persistence adds ~1 SQL roundtrip per account + ~1 per transaction. For applicants with 1000+ transactions, this could add 1-2s to the bg pull. Acceptable since the HTTP response has long since returned.
- **Postgres engine is `None` in dev/CI**: the wire-up code handles `TxSessionLocal is None` gracefully — feature is silently disabled.
- **Schema drift**: if model column types diverge from postgres column types, INSERTs fail. Mitigated by Phase 4a step 2's column-by-column reconciliation.

---

## Phase 4c — Read endpoint reads canonical_transactions on postgres

### Files to touch
- `backend/src/interface/http_endpoints.py:2818-2869` — the `GET /v1/applications/{application_id}/transactions` handler (and its `/v1/applicants/...` alias at line 2816).

### Steps

1. **Add a feature flag** at the top of the module (or import from a config module if one exists):
   ```python
   _CANONICAL_TRANSACTIONS_READ = os.getenv("INTAKE_CANONICAL_TRANSACTIONS_READ", "false").strip().lower() in {"1", "true", "yes"}
   ```

2. **Add a canonical reader function** near the existing `_normalise_*_transactions` helpers (~line 2569+):
   ```python
   def _read_canonical_transactions(
       *, application_id: int,
       start_date: Optional[date],
       end_date: Optional[date],
   ) -> List[Dict[str, Any]]:
       """Return canonical transactions for application as flat dicts in dashboard shape."""
       if TxSessionLocal is None:
           return []
       applicant_id = f"app-{application_id:08d}"
       with TxSessionLocal() as tx_session:
           q = (
               tx_session.query(models.CanonicalTransactionModel)
               .filter(models.CanonicalTransactionModel.applicant_id == applicant_id)
               .order_by(models.CanonicalTransactionModel.posted_date.desc())
           )
           if start_date is not None:
               q = q.filter(models.CanonicalTransactionModel.posted_date >= start_date)
           if end_date is not None:
               q = q.filter(models.CanonicalTransactionModel.posted_date <= end_date)
           rows = q.limit(2000).all()
       return [
           {
               "id": str(r.provider_transaction_id),
               "date": r.posted_date.isoformat(),
               "amount": float(r.amount_usd) if r.direction == "debit" else -float(r.amount_usd),
               "currency": "USD",
               "name": r.merchant_name or r.counterparty_name or r.description_original,
               "merchant_name": r.merchant_name,
               "category": [r.category_primary] if r.category_primary else [],
               "category_id": r.category_detailed,
               "pending": False,
               "account_id": str(r.account_id) if r.account_id else None,
               "provider": r.provider_name,
           }
           for r in rows
       ]
   ```

3. **Patch the handler** at `http_endpoints.py:2818-2869`. After loading the application (line 2826ish) and BEFORE the existing snapshots loop, insert:
   ```python
   if _CANONICAL_TRANSACTIONS_READ:
       canonical_rows = _read_canonical_transactions(
           application_id=application_id,
           start_date=start_date,
           end_date=end_date,
       )
       if canonical_rows:
           total = len(canonical_rows)
           return {
               "applicant_id": application_id,
               "start_date": start_date.isoformat() if start_date else None,
               "end_date": end_date.isoformat() if end_date else None,
               "transactions": canonical_rows,
               "total": total,
               "dashboard_loan_adapter": None,
               "dashboard_snapshot_adapter": None,
               "source": "canonical_transactions",
           }
       # else fall through to legacy snapshot reads
   # legacy path (unchanged)
   ```

4. **Add a `source` field** to the existing legacy-path response too (`source: "bank_data_snapshots"`) so consumers can tell which path served the data. Discoverable via the API only; no breaking change.

5. **Verify imports**: `from src.infra.postgres import models` must be added near the other `models` import. The legacy `_normalise_*_transactions` helpers stay untouched — they're used by the fallback path.

### Acceptance criteria

- With `INTAKE_CANONICAL_TRANSACTIONS_READ=true` AND canonical data exists, the response includes `source: "canonical_transactions"` and rows from postgres.
- With the flag false (default), the legacy `bank_data_snapshots` path is used unchanged — backwards compatible.
- With the flag true but canonical empty for that application, falls back to legacy path (no regression).
- `start_date` / `end_date` query params filter the canonical query.

### Risks
- **Filter compat**: postgres `posted_date` is `date` type; existing query string params are ISO strings. The handler already parses them with `_parse_iso_date_or_400` (`http_endpoints.py:2837` adjacent) — reuse.
- **Limit of 2000**: hard cap on canonical rows returned. Document for callers; chat with frontend before adding pagination if needed.

---

## Phase 4d — ApplicationResponse + list endpoint: transactions_count / transactions_synced_at

### Files to touch
- `backend/src/interface/schemas.py:136-160` (`ApplicationResponse`).
- `backend/src/interface/http_endpoints.py:1239-1296` (`_application_to_response`).
- `backend/src/interface/http_endpoints.py:1504-1547` (`_load_housing_applications`) — add a metadata fetch step before building responses.

### Steps

1. In `schemas.py:136-160`, add to `ApplicationResponse`:
   ```python
   transactions_count: Optional[int] = None
   transactions_synced_at: Optional[datetime] = None
   ```

2. Add a helper in `http_endpoints.py` near `_resolve_application_metadata`:
   ```python
   def _bulk_canonical_transaction_summary(application_ids: Iterable[int]) -> Dict[int, Tuple[int, Optional[datetime]]]:
       """One grouped query: per applicant_id → (count, last_received_at). N+1 safe."""
       if TxSessionLocal is None:
           return {}
       app_ids = list(application_ids)
       if not app_ids:
           return {}
       expected_applicant_ids = [f"app-{aid:08d}" for aid in app_ids]
       with TxSessionLocal() as tx_session:
           rows = (
               tx_session.query(
                   models.CanonicalTransactionModel.applicant_id,
                   func.count(models.CanonicalTransactionModel.id).label("n"),
                   func.max(models.RawProviderPayloadModel.received_at).label("last_at"),
               )
               .outerjoin(
                   models.RawProviderPayloadModel,
                   models.CanonicalTransactionModel.raw_payload_id == models.RawProviderPayloadModel.id,
               )
               .filter(models.CanonicalTransactionModel.applicant_id.in_(expected_applicant_ids))
               .group_by(models.CanonicalTransactionModel.applicant_id)
               .all()
           )
       result: Dict[int, Tuple[int, Optional[datetime]]] = {}
       for applicant_id_str, n, last_at in rows:
           # parse `app-XXXXXXXX` -> XXXXXXXX
           if isinstance(applicant_id_str, str) and applicant_id_str.startswith("app-"):
               try:
                   aid = int(applicant_id_str[4:])
               except ValueError:
                   continue
               result[aid] = (int(n), last_at)
       return result
   ```

3. In `_load_housing_applications` (`http_endpoints.py:1504-1547`), after computing the page's `application_ids`, call `_bulk_canonical_transaction_summary(application_ids)` and thread the dict through to `_application_to_response`.

4. In `_application_to_response`, accept an optional `transactions_summary: Tuple[int, Optional[datetime]] | None = None` kwarg and set:
   ```python
   if transactions_summary:
       count, synced_at = transactions_summary
       response.transactions_count = count
       response.transactions_synced_at = synced_at
   ```

### Acceptance criteria

- `GET /v1/applications` returns `transactions_count` and `transactions_synced_at` for every application (`null` if none).
- One grouped query per page; verified by `caplog` test capturing query count.
- Single-application detail (`GET /v1/applications/{id}`) also surfaces these fields if there's a corresponding endpoint — verify by reading `http_endpoints.py` near line 2415.

### Risks
- **Cross-engine query**: this query runs against `tx_engine` while the calling session is on `engine`. They are independent connections — no foreign-key visibility, no transaction guarantees across engines. Acceptable since this is a read-only count.
- **Performance**: index `idx_canonical_txn_applicant_date` on postgres covers the WHERE clause. Single grouped scan; sub-100ms even at 100k rows.

---

## Phase 4e — Frontend type + proxy updates

### Files to touch
- `frontend/lib/application-types.ts:28-68` — `BackendApplication` interface.
- `frontend/app/api/applications/route.ts` — Next.js proxy and the dummy-data fallback (~lines 30-110).

### Steps

1. In `application-types.ts:28-68`, after `credit_score?: number | null`, add:
   ```ts
   transactions_count?: number | null
   transactions_synced_at?: string | null
   ```

2. In `frontend/app/api/applications/route.ts`, in the dummy-data fallback (around lines 83-107 per Phase 1 context), add to each dummy app object:
   ```ts
   transactions_count: 0,
   transactions_synced_at: null,
   ```
   (So devs see the field in the local dev fallback.)

3. No UI changes in this phase. Surfacing the count in the dashboard UI is a separate feature for a follow-up PR.

### Acceptance criteria

- `npx tsc --noEmit -p frontend/tsconfig.json` is no worse than baseline (zero new errors in the changed files).
- `BackendApplication` consumers (~5 files per `grep -l BackendApplication frontend/lib`) compile cleanly with the additive optional field.

### Risks
- None — purely additive optional fields.

---

## Phase 4f — Tests

### Files to touch
- `backend/tests/infra/test_canonical_repository_persist.py` (new file).
- `backend/tests/interface/test_application_transactions_endpoint.py` (new file).
- `backend/tests/interface/test_application_endpoint.py` — extend with tests for `transactions_count`/`transactions_synced_at` in list response.

### Steps

1. **Canonical writer test** — use a SQLite in-memory engine bound to `TxBase.metadata.create_all`. Assertions:
   - Plaid path: feed a sample transactions payload + balances payload through `NormalizationService.normalize_plaid` and `CanonicalRepository.persist_snapshot`. Assert row counts, applicant_id format, sign convention (debit positive in postgres).
   - SaltEdge path: same, with the SaltEdge sample fixtures.
   - Idempotency: re-run the same payload; assert no new rows are added (unique key honored).
   - Truncation: provide a 1000-char `merchant_name`; assert persisted value is exactly 500 chars and `caplog` records a debug truncation line.

2. **Read endpoint test** — patch `TxSessionLocal` to point at a SQLite test engine. Insert two canonical rows for `applicant_id="app-00000001"`. With `INTAKE_CANONICAL_TRANSACTIONS_READ=true`, hit the endpoint, assert `source == "canonical_transactions"`, assert returned rows match. With the flag off, assert `source == "bank_data_snapshots"` (legacy path).

3. **List endpoint test** — extend `test_application_endpoint.py`. Patch `TxSessionLocal`, insert canonical rows under `app-00000001`, hit `GET /v1/applications`, assert the matching `ApplicationResponse` has `transactions_count == 2` and a non-null `transactions_synced_at`.

4. Use the in-memory SQLite engine (`sqlite:///:memory:`) for ALL postgres-side fixtures — schema is portable for our model definitions. The unique constraint behaves identically. (One caveat: `JSONB` becomes plain JSON-as-Text on SQLite — handled by SQLAlchemy automatically when `JSONB` is used without `with_variant`. We may need a small `with_variant(JSON, "sqlite")` shim on the `payload` column for tests to work — add it in Phase 4a if not.)

### Acceptance criteria

- All new tests pass.
- Existing 348 backend tests still pass.
- `caplog` proves truncation log is emitted.
- One grouped-query assertion (count SQL execution events) confirms no N+1.

### Risks
- **SQLite vs postgres unique-key edge cases**: extremely rare; the unique constraint is on plain string columns.

---

## Phase 4g — cloudbuild.yaml + CHANGELOG + about.md

### Files to touch
- `backend/cloudbuild.yaml:14-26` — Cloud Run deploy args.
- `workspace/CHANGELOG.md` — add new entry.
- `.ai/postgres-transactions/a/about.md` — update to reflect implemented state.

### Steps

1. In `cloudbuild.yaml:14-26`, append to the existing `--set-env-vars`, `--set-secrets`, and `--add-cloudsql-instances`:
   ```
   --set-env-vars=...,POSTGRES_CLOUD_SQL_CONNECTION_NAME=elemental-day-443510-e0:us-central1:lita-ehousing,POSTGRES_DB_NAME=lita-ehousing,INTAKE_CANONICAL_TRANSACTIONS_READ=false
   --set-secrets=...,POSTGRES_DB_USER=postgres-db-user:latest,POSTGRES_DB_PASSWORD=postgres-db-password:latest
   --add-cloudsql-instances=elemental-day-443510-e0:us-central1:lita-mysql,elemental-day-443510-e0:us-central1:lita-ehousing
   ```

2. Add `[2026-05-05] – Postgres transaction history` entry to `workspace/CHANGELOG.md`. Type: feature. Areas: backend, frontend, db.

3. Update `.ai/postgres-transactions/a/about.md` to describe the actual end state.

### Acceptance criteria

- `cloudbuild.yaml` parses (`yamllint` if available).
- `python3 scripts/generate_changelog_html.py` succeeds.
- `about.md` accurately reflects the implementation.

### Risks
- **Forgotten Secret Manager entries**: deploy will fail if secrets don't exist. Documented as deploy precondition.
- **Cloud SQL Auth Proxy multi-instance**: confirmed supported; no risk.

---

## Cross-Phase Notes

### Sequencing (parallelization)

```
Round 1: 4a (alone — every other phase imports from postgres/models)
Round 2: 4b + 4c + 4d + 4e   (4 in parallel — disjoint files)
Round 3: 4f                  (tests need 4a-4d done)
Round 4: 4g                  (docs/deploy)
```

### Risks summary

1. Schema drift between SQLAlchemy model and postgres table — addressed by Phase 4a column-by-column reconciliation.
2. `tx_engine` `None` in dev/test — the code handles it gracefully; canonical writes silently skipped.
3. Feature flag default OFF — backwards-compatible first deploy.
4. Try/except wrap on canonical writes — bg worker never crashes.

## Parallelization

- **Round 1**: Phase 4a alone.
- **Round 2** (parallel): 4b, 4c, 4d, 4e.
- **Round 3**: 4f.
- **Round 4**: 4g.

## Assessed: yes
