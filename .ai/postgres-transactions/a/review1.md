# Code Review — Round 1

## Verdict: NEEDS_CHANGES

## Summary

The dual-engine split is well structured: `TxBase` lives in its own module, the canonical models move cleanly to `backend/src/infra/postgres/`, the `tx_engine` is fully optional, the bg-worker canonical writes are wrapped in `try/except`, and the read endpoint correctly hides the new path behind `INTAKE_CANONICAL_TRANSACTIONS_READ` with a transparent fallback. New tests pass and cover the happy paths.

However, there are two real problems that block ship and several MAJOR gaps:

1. The bulk-summary helper that runs on every `GET /v1/applications` call is wrapped in a `try/except` only around its **imports**. A runtime failure on the postgres side (network blip, auth refresh, schema drift) propagates out and breaks the MySQL-backed list endpoint for every caller. The about.md promises "graceful fallback" — the code does not deliver it.
2. The legacy re-exports in `backend/src/infra/mysql/` (`raw_provider_payload_repository.py`, `feature_computation_service.py`) still import the now-postgres-bound canonical models but pass them a MySQL session and feature-set (`json.dumps(payload)`, `fetched_at=…`). Any caller of those modules will fail at runtime: `TypeError: 'fetched_at' is an invalid keyword argument`, or write a JSON string into a JSONB column on a wrong engine. Both modules are dormant in production today, so this is a latent landmine rather than an immediate outage — but it must be either fixed or deleted before merge so it doesn't surprise the next reader.

The single-application detail endpoints (`POST /v1/applications`, `GET /v1/applications/{id}`) never receive a `transactions_summary` and so always render `transactions_count=null` / `transactions_synced_at=null`. The plan acceptance criterion called this out explicitly and it was missed.

Apply fixes for the items below and re-review.

## Findings

### CRITICAL

None — there is no data-loss / security / production-crash blocker. The two issues that come closest are upgraded under MAJOR because the affected paths are gated.

### MAJOR

**M1 — `_bulk_canonical_transaction_summary` does not isolate postgres failures from the MySQL list endpoint.**
`backend/src/interface/http_endpoints.py:1246-1298`. The `try/except Exception: return {}` wraps only the two `import` statements. Once `TxSessionLocal` is non-None, the `with TxSessionLocal() as tx_session: tx_session.query(...).all()` runs unguarded. Any operational error from postgres (auth-token refresh failure, transient network, schema drift after a manual DBA change, the cloud-sql connector deadline) bubbles out of `_load_housing_applications` and 500s the entire `GET /v1/applications` list, which historically depends only on MySQL. The about.md promises "Postgres failure NEVER kills the bg worker" — the same guarantee should hold for the read path. Fix: wrap the query block (and any caller that reads from postgres on a request-serving path) in `try/except Exception: logger.exception(...); return {}`. The same applies to `_read_canonical_transactions_from_postgres` (`backend/src/interface/http_endpoints.py:2654-2710`) — under `_CANONICAL_TRANSACTIONS_READ=true`, a transient postgres SQL error currently 500s the request instead of falling back to legacy.

**M2 — Legacy MySQL helpers still bind to the now-postgres canonical models.**
`backend/src/infra/mysql/raw_provider_payload_repository.py` (full file) still does `from src.infra.mysql import models` (which now re-exports the postgres-bound `RawProviderPayloadModel`) and constructs the model with `payload=json.dumps(payload, default=str)` and `fetched_at=fetched_at or datetime.now(timezone.utc)`. The first will write a quoted JSON string into a JSONB column; the second will raise `TypeError: 'fetched_at' is an invalid keyword argument` because the column was deliberately dropped in this PR. Similarly, `backend/src/services/feature_computation_service.py:10` imports `CanonicalTransactionModel` from the MySQL re-export and queries it via a `Session` argument that callers will populate from `SessionLocal()` (the MySQL session). Both modules have no current callers in `backend/src` or `backend/tests`, so this is dormant — but they are reachable from the public class re-exports and the next person to wire them up will hit the bug at runtime, not at import. Either: (a) update both modules to use `TxSessionLocal` + dict-payload + drop `fetched_at`, or (b) delete them and remove the dead code. Leaving the trap in place is what makes this MAJOR.

**M3 — Single-application detail responses always emit null counts.**
`backend/src/interface/http_endpoints.py:2266-2270` (`POST /v1/applications` response build) and `:2512-2514` (`GET /v1/applications/{id}` and `PATCH /v1/applications/{id}` near `:3238`) call `_application_to_response(application, enrichment=enrichment, ...)` without a `transactions_summary`, so the new fields are unconditionally `null` on detail/single responses even when canonical rows exist. The plan acceptance criteria called this out: "Single-application detail (`GET /v1/applications/{id}`) also surfaces these fields". Fix: thread `_bulk_canonical_transaction_summary([application.id])` through these three call sites (or better, add a `_single_canonical_transaction_summary(application_id)` helper and pass through). Until fixed, the dashboard will see `transactions_count: null` after a fresh PATCH/POST round-trip even though the list view shows the correct number.

**M4 — `Connector()` instantiation at module load can crash production startup.**
`backend/src/config/database.py:194-218`. `_postgres_tx_engine()` runs at module import time. In production, when env vars are present, it constructs `Connector()` and registers `atexit.close`. `create_engine(..., poolclass=NullPool, pool_pre_ping=True)` is lazy on the connection itself, so a postgres-side firewall block won't crash the import. But `Connector()` performs eager Google ADC discovery and IAM-token refresh — if the Cloud Run service account lacks `roles/cloudsql.client` for the new `lita-ehousing` instance, the constructor raises immediately and crashloops the entire revision (the MySQL `engine` already exists at that point, but the import of `database.py` fails and FastAPI never starts). The plan / about.md framed this as "graceful fallback" but the fallback only catches the `missing env vars` case. Wrap the production branch in `try/except Exception: logger.exception(...); return None` so a connector init error degrades to "canonical writes skipped" instead of a full crashloop. Especially important for the first deploy when secrets / IAM may lag the code.

**M5 — Observability: failure logs do not include applicant_id / application_id.**
`backend/src/usecase/bank_data_pull.py:303` and `:763`. Both `[canonical.plaid] persist failed (non-fatal)` / `[canonical.saltedge] persist failed (non-fatal)` are emitted via bare `logger.exception(...)` with no template arguments. The exception trace is included via `exc_info` but the `applicant_id` and `application_id` are NOT in the message body, which is what most log-search UIs use for filtering. On-call at 3am cannot grep `[canonical.plaid] persist failed applicant=app-00001234` to find the failing applicant — they have to walk the trace and correlate by timestamp. Fix: change to `logger.exception("[canonical.plaid] persist failed (non-fatal) applicant=%s application_id=%s", applicant_id, application.id)` (and define `applicant_id` outside the `try:` block so it's in scope when the exception fires before the assignment runs). The same fix for SaltEdge — also add the `connection_id`.

**M6 — `NormalizationService(fx_rates={})` silently keeps non-USD amounts in their original currency.**
`backend/src/usecase/bank_data_pull.py:286, 736`. Both wire-ups pass an empty FX dict. Per `normalization_service.py:382-389`, that means non-USD balances and amounts are NOT converted — they're stored verbatim in the `*_usd` columns. For a UK applicant with GBP transactions on SaltEdge, `amount_usd` will be the raw GBP amount with no flag. The schema column name (`amount_usd`) becomes a lie. Either: (a) populate a real `DEFAULT_FX_RATES` constant (the plan said `fx_rates=DEFAULT_FX_RATES` — the implementer dropped to `{}`), (b) drop foreign-currency rows during normalisation, or (c) store the original currency code on the canonical row so downstream queries can compensate. Pick one and document. The currently shipped behavior is "silently mis-label currency" which will break aggregate queries (`SUM(amount_usd)` mixed-currency).

### MINOR

**N1 — `_truncate_name` truncation is permanent (no audit row).**
`backend/src/infra/postgres/canonical_repository.py:25-37`. A 1024-char merchant name from Plaid is truncated to 500 chars at the writer; the suffix is gone and only a DEBUG log is emitted. For low-volume merchants this is fine. For "merchant search" downstream features (out of scope for this PR, but mentioned in the plan), the lossy write is a one-way door — the raw payload still has the full name in `raw_provider_payloads.payload`, so it's recoverable, but only by re-parsing JSONB. Document this trade-off in the model docstring; consider promoting the log line from DEBUG to INFO so on-call can see truncation rate.

**N2 — `try/except Exception` in canonical wire-up swallows everything including `IntegrityError`.**
`backend/src/usecase/bank_data_pull.py:280-303` and `:711-763`. The wrap is intentional — the bg worker must never fail on canonical errors — but it masks real bugs. An `IntegrityError` from a missing FK or a duplicate-key violation could indicate genuine data corruption that we want to escalate. Recommend narrowing or at least raising the log level to `error` (currently `exception`, which is fine but blends with normal noise). Splitting into `except (NetworkError, OperationalError) as e: logger.warning(...)` and `except Exception: logger.exception(...)` would help.

**N3 — Read endpoint hard-caps at 2000 rows with no `next_cursor`.**
`backend/src/interface/http_endpoints.py:2658, 2687`. A user with 5+ years of transactions (>2000 rows) silently sees only the most recent 2000 with no signal that more exist. Document as a known cap in the response shape and/or expose a `truncated: true` field for downstream consumers.

**N4 — `category` field shape regression vs legacy.**
`backend/src/interface/http_endpoints.py:2697`. The legacy normalisers emit `category` as a list with both primary AND detailed strings. The canonical reader emits only `[r.category_primary]`. If frontend code reads `category[1]` for the detailed sub-category, it will now be `undefined`. Verify with the dashboard; if it does, change to `category=[r.category_primary, r.category_detailed]` (skipping None entries).

**N5 — `metadata_map` from `_resolve_application_metadata` and `transactions_summary_map` are independent — no fail-isolation between them.**
`backend/src/interface/http_endpoints.py:1601-1626`. Same MAJOR root cause as M1 but specifically called out: the new bulk summary call is unconditional and runs even when `_resolve_application_metadata` already opens a MySQL session. Two independent SQL round-trips per page-load. Acceptable today; if list-page latency budget tightens, batch into one async fan-out.

**N6 — `Connector()` is constructed with no event-loop awareness for the bg-worker thread pattern.**
The worker calls `with TxSessionLocal() as tx_session:` from inside a `threading.Thread(daemon=True)`. The `Connector()` instance is module-global. Per cloud-sql-connector docs, `Connector` is thread-safe for the synchronous driver path (`pg8000`). But the connector caches refresh-token state per-loop — if you ever switch to the asyncpg driver in the future, this becomes an event-loop hazard. Document the assumption.

**N7 — `requirements.txt` does not pin `pg8000`.**
`backend/requirements.txt`. `cloud-sql-python-connector==1.7.0` pulls `pg8000` transitively, but a future minor bump could pull a newer pg8000 that subtly changes JSONB serialisation. Pin `pg8000>=1.30` (or whatever the connector's current minor is) explicitly.

**N8 — Tests use a single in-memory SQLite engine — no test exercises the postgres-specific code path.**
`backend/tests/infra/test_canonical_repository_persist.py`, `backend/tests/interface/test_application_transactions_canonical.py`. Acceptable for unit; a follow-up integration test against a real postgres (e.g. testcontainers) would catch JSONB / numeric / datetime tz subtleties. Out of scope per the PR; flag for follow-up.

**N9 — `_postgres_tx_engine` returns from local-only branch with `pool_pre_ping=True` but no `poolclass=NullPool` — diverges from the production branch.**
`backend/src/config/database.py:223, 235`. Production uses `NullPool`, local does not. Probably fine (local uses real TCP pooling for performance) but worth a comment.

**N10 — `_CANONICAL_TRANSACTIONS_READ` is checked at module load.**
`backend/src/interface/http_endpoints.py:266-269`. Flipping `INTAKE_CANONICAL_TRANSACTIONS_READ` requires a Cloud Run revision redeploy — runtime env-var update is not honored. Documented in the plan/about; just call out explicitly in the CHANGELOG so the on-call doesn't try to flip via console.

**N11 — `_postgres_tx_engine` constructs a new `Connector()` separate from the MySQL `_default_engine`'s `Connector()`.**
`backend/src/config/database.py:120, 167, 211`. Two separate `Connector()` instances are created, both registered with `atexit`. This is correct (the API does not require a single shared connector) but doubles the IAM token refresh cost. Could be optimised by sharing one connector and passing the `db_name` per call. Out of scope; flag.

**N12 — `_load_housing_applications` test seeding pattern uses `monkeypatch.setattr(database_module, "TxSessionLocal", Session)` BUT also relies on the lazy import inside `_bulk_canonical_transaction_summary`.**
`backend/tests/interface/test_application_endpoint.py:835`. The `_bulk_canonical_transaction_summary` function does `from src.config.database import TxSessionLocal` at call time, so the monkeypatch on `database_module.TxSessionLocal` works because the lazy import re-resolves the attribute on each call. This is correct but fragile — if the function is ever refactored to a module-level import the test silently uses the un-patched version. Comment in the test suggesting this dependency.

**N13 — `_apply_account_update` overwrites `raw_payload_id` to the latest snapshot's id.**
`backend/src/infra/postgres/canonical_repository.py:147-160`. On every refresh, the row's `raw_payload_id` is rewritten to the most recent raw row, even though the older raw row that originally created this canonical entry still exists. If an auditor wants "which raw payload first introduced this account?", that information is lost. Acceptable trade-off given the upsert semantics, but worth noting in the model docstring.

**N14 — `description_original[:120]` magic number.**
`backend/src/interface/http_endpoints.py:2696`. The fallback display name slice of 120 chars has no symbolic constant and no comment. Either name it (`_DESCRIPTION_FALLBACK_LEN`) or note that it matches the legacy normaliser's truncation.

### NOTE

**X1 — No metric counter for canonical write success/failure.**
Out of scope per CHANGELOG; queue as a follow-up. The first 24h post-deploy will be observability-blind unless the on-call greps `grep -c '\[canonical.plaid\] persist failed'` against the Cloud Run log stream.

**X2 — No integration test against real postgres / cloud-sql connector.**
Add a `pytest.mark.integration` testcase using `testcontainers-python` postgres to validate JSONB round-trip, server-default timestamps, and the unique-constraint behavior in a follow-up PR.

**X3 — No test for combined Plaid + SaltEdge in the same application flow.**
Acceptable scope per prompt §20; queue as a follow-up if multi-provider applicants become common.

**X4 — Postgres unique-constraint contract is documentation-only.**
The model definition in `backend/src/infra/postgres/models.py:69-95` (`CanonicalTransactionModel`) declares NO `UniqueConstraint` — the about.md asserts the postgres table has `(provider_name, provider_transaction_id)` (or per Phase 1 recon, possibly `(applicant_id, provider_name, provider_transaction_id)`). The repository's read-then-write upsert filter uses `(applicant_id, provider_name, provider_transaction_id)`. If the live postgres unique constraint is the narrower 2-column form, then a second applicant ingesting the same `provider_transaction_id` (e.g. shared joint Plaid account) would violate the constraint and the entire `try/except Exception` swallow in the bg worker silently drops the canonical write. Verify the live constraint matches the filter, or add `UniqueConstraint("applicant_id", "provider_name", "provider_transaction_id", name="uq_canonical_txn_applicant_provider_txn")` to the model declaration so `TxBase.metadata.create_all` tests catch the mismatch.

**X5 — Migrations directory has no postgres SQL file; `run_migration.py` would crash on the postgres engine.**
Per Phase 1 recon, `backend/migrations/*.sql` are MySQL-flavoured and `run_migration.py` is bound to the MySQL engine. As long as postgres tables are pre-existing (deploy precondition) and `run_migration.py` is not pointed at postgres, this is dev-time risk only. Document that `run_migration.py` MUST NOT run against postgres.

**X6 — `transactions_synced_at` semantic is the raw-payload `received_at`, not the canonical-write time.**
`backend/src/interface/http_endpoints.py:1276`. `func.max(received_at)` is the time the raw provider response landed in the database — slightly before the canonical-table write. For a synced-recently UI badge this is fine; for "when did this canonical row last change?" it is wrong. Document the chosen semantic in the response field's docstring.

**X7 — Frontend `BackendApplication.transactions_synced_at?: string | null` consumes a Pydantic `datetime` ISO string.**
`frontend/lib/application-types.ts:60`. Pydantic v1 default serialises `datetime` as ISO8601 with `+00:00` suffix, which `new Date(...)` parses correctly across all browsers. Consistency check passes; no action needed.

**X8 — UI rendering of `transactions_count: 0` vs `null`.**
The dummy fallback emits `transactions_count: 0`. The backend emits `null` when no canonical rows exist. The dashboard must distinguish "no data yet" (sync hasn't run / postgres unavailable) from "verified zero". Out of scope; queue UX clarification when the badge is wired up.

## On-call diagnosis check

The most realistic 3am scenario after this lands: postgres briefly unavailable (Cloud SQL maintenance window) at the moment the user hits `GET /api/applications`. Today the list endpoint is served entirely off MySQL. After this PR:

- The bulk-summary helper raises an unhandled `OperationalError`, which propagates out of `_load_housing_applications` and 500s the entire list response. Users see "failed to load applications" on the dashboard for every applicant, not just the postgres-affected ones. (M1)
- The Plaid bg worker for any in-flight pull catches the exception and logs `[canonical.plaid] persist failed (non-fatal)` with NO applicant_id in the line — on-call has to correlate timestamps to figure out which user is affected. (M5)
- If the failure root-cause is the cloud-sql connector failing to refresh its IAM token, the error happens at module-load time and the entire FastAPI revision crashloops on the next deploy. (M4)

These three failure-mode gaps justify NEEDS_CHANGES.

## Test coverage gaps

- No test exercises `_bulk_canonical_transaction_summary` with an exception inside the `with` block — only the "TxSessionLocal is None" path is covered. Add a test that monkeypatches `TxSessionLocal` to a sessionmaker whose engine raises `OperationalError` on first query and asserts the list endpoint still returns 200 with `transactions_count=null`.
- No test for `_read_canonical_transactions_from_postgres` SQL exception fall-through — same shape as above.
- No test for `_application_to_response` single-app paths (POST and GET-by-id) with canonical rows present — the missing M3 fix would have been caught here.
- No test for the FX-empty / non-USD path (M6) — feed a GBP SaltEdge fixture through `normalize_saltedge` with `fx_rates={}` and assert the chosen behavior (currently: stored as USD numerically without conversion).
- No test for the `Connector()` initialization-failure path (M4) — patch `Connector` to raise and assert `_postgres_tx_engine` returns `None` and the app boots.
- The list-endpoint test `test_list_applications_includes_transactions_count_and_synced_at` does NOT verify the N+1 claim. Add a `caplog` / SQL-event-listener assertion that exactly ONE postgres query is issued per page (the plan called this out in §4d).

## Verdict justification

NEEDS_CHANGES because M1 + M2 + M4 are reachable production bugs (M1 via routine postgres maintenance, M2 the moment anyone wires the dormant helpers up, M4 on first deploy if IAM lags). M3 misses a documented acceptance criterion. M5 + M6 are operability bugs the team will regret on the first incident.

Recommendation: apply M1 (wrap postgres queries in `try/except` with empty-result fallback), M2 (delete or fix the legacy modules), M3 (thread summary through single-app responses), M4 (wrap `Connector()` init), M5 (add applicant context to error logs), and M6 (decide and document FX behavior). Re-review when fixes land. The MINOR / NOTE items can ride along or be queued.
