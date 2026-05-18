# saltedge-fetch — Project Blueprint

## Mission

Make the SaltEdge transaction-pull pipeline reliable for the
`https://ehousing.joinlita.com/dashboard?id=28` use case (and every other
non-US applicant) by guaranteeing that every successful SaltEdge widget
return results in postgres `bank_data_snapshots` rows with `status='succeeded'`,
`canonical_transactions` rows linked by `applicant_id='app-{id:08d}'`, and a
`credit_scores` row whose `dashboard_vars` populates the dashboard's
"Bank Balance", "Average Cash Flow", "Total Outstanding Debt", and
"Total Number of Contracts" tiles. The pull is triggered both at submit time
(existing `_kick_off_saltedge_submit_pull`) and at any subsequent moment a new
SaltEdge connection is persisted for an already-submitted application — so a
user who connects a Swedish bank after submission still gets surfaced data
without re-submitting.

## Final Architecture

### Backend: connect-then-pull retrigger

- `_kick_off_saltedge_submit_pull(application)` in
  `backend/src/interface/http_endpoints.py` is parameterised so it can be
  called from two sites: (a) the existing `create_application` path
  (line 2218 today), and (b) a new "post-connect" hook that fires after
  `POST /api/saltedge/connection/{id}/persist` and `POST /api/saltedge/customer/{id}/sync`
  in `backend/src/interface/saltedge_endpoints.py` whenever the persisted
  consent has a non-null `application_id`. The hook reloads the application,
  spawns the same daemon thread, and short-circuits if a pull is already
  running for the same application (in-memory dedup map keyed by
  application_id with a 30-second TTL).
- The submit path no longer relies solely on `bind_application_by_customer_reference`
  to associate consents with applications: the persist/sync endpoints accept
  an optional `application_id` from the frontend (already present in the
  pydantic model, but the frontend now always passes it on the connect-accounts
  page when the URL/state has the application id), and the back-fill remains
  as a defensive fall-back.
- `run_submit_saltedge_pull` continues to write four raw rows per connection
  (`connection`, `accounts`, `transactions`, `holder_info`) and one
  customer-level `customer_reports` row. After each successful
  (`accounts`, `transactions`) pair it opens `TxSessionLocal()` and writes
  canonical rows via `CanonicalRepository.persist_snapshot`. Failure of the
  canonical write never kills the bg worker (existing try/except at
  `bank_data_pull.py:782`).

### Sync flow

```
Connect-accounts widget → frontend persist call
    ↓
POST /api/saltedge/connection/{id}/persist (sets application_id when known)
    ↓
SQLSaltEdgeConsentRepository.upsert_from_widget_return → open_banking_consents row
    ↓
[NEW] _kick_off_saltedge_submit_pull(application_loaded_from_id)
    ↓
run_submit_saltedge_pull → SaltEdge GET /accounts, /transactions per connection
    ↓
bank_data_snapshots rows (status=succeeded, source=saltedge, product_type=transactions)
    ↓
CanonicalRepository.persist_snapshot(normalize_saltedge(merged_payload))
    ↓
postgres canonical_financial_accounts + canonical_transactions rows
```

### Read flow

- `GET /v1/applications/{id}/transactions` (and the `/v1/applicants/...` alias)
  in `http_endpoints.py:3007-3093` reads from postgres `canonical_transactions`
  first when `INTAKE_CANONICAL_TRANSACTIONS_READ=true`, falling back to the
  legacy `bank_data_snapshots` path otherwise. Every response includes
  `dashboard_loan_adapter`, `dashboard_snapshot_adapter`, and a `source`
  discriminator (`canonical_transactions` | `bank_data_snapshots`).
- `GET /v1/applications/{id}/credit-score` in `http_endpoints.py:2622-2685`
  drives the dashboard's `apiScore.dashboard` and `apiScore.scorecard`
  fields. Its underlying `get_or_compute_score` reads the latest
  `bank_data_snapshots` rows for the application and runs the saltedge_bundle
  / plaid_bundle scoring. When at least one `accounts` and one `transactions`
  snapshot exist with `status='succeeded'`, the v7Dashboard returns
  populated fields (`accounts_liquid_balance`, `transactions_avg_net_cashflow`,
  etc.).

### Frontend

- `frontend/app/dashboard/page.tsx` consumes:
  - `application.id` for `/api/v1/applications/{id}/credit-score` →
    `apiScore.dashboard` and `apiScore.scorecard`.
  - `application.id` for `/api/v1/applicants/{id}/transactions` (cash-flow
    chart, loan analysis donut).
  - `localStorage.getItem("dw_application_saltedge_customer_id")` for the
    `/api/saltedge/customer/{customerId}/connections` lookup (Bug 1 fixed in
    dashboard-verify d).
- `frontend/app/application/connect-accounts/pageSalt.tsx` writes
  `dw_application_saltedge_customer_id` after a successful link
  (line 767-770) and calls `/api/saltedge/connection/{id}/persist` and
  `/api/saltedge/customer/{id}/sync`. Both calls now always include
  `application_id` when one is in URL/local state, so the post-connect
  hook can pick it up even when the `customer_reference` back-fill
  mechanism has not yet bound the consent row to the application.
- No new UI changes are introduced by this fix — the dashboard
  components consume the corrected data once the pipeline writes it.

### Tests

- `backend/tests/usecase/test_bank_data_pull_saltedge.py` covers
  `run_submit_saltedge_pull`'s SaltEdge-only path: country normalisation,
  consent enumeration, raw-payload persistence, canonical persistence with
  the merged accounts+transactions payload, and the no-consents short-circuit.
- `backend/tests/interface/test_saltedge_post_connect_kick_off.py` (new)
  covers the post-connect hook: persist/sync handlers schedule a pull
  thread when `application_id` is set; do NOT schedule when
  `application_id` is null; dedup keeps a second persist within 30s from
  spawning a duplicate thread.
- `backend/tests/interface/test_application_transactions_canonical.py`
  continues to verify the read-side flag behaviour.

### Observability

- `[saltedge.submit]` and `[saltedge.pull]` logs already emit at every
  major step in `bank_data_pull.py` (lines 570-806) and at
  `_kick_off_saltedge_submit_pull` (lines 174-211). The new post-connect
  hook adds `[saltedge.post-connect] kick application_id=… connection_id=…
  trigger=persist|sync` so operators can correlate widget-return events
  to subsequent canonical writes.
- `[canonical.saltedge] applicant=… application_id=… connection=… txns=N persisted`
  fires per-connection on success and `[canonical.saltedge] persist failed
  (non-fatal)` on exception (existing).
- The `/v1/applications/{id}/transactions` response includes `source`,
  letting the frontend devtools and downstream consumers tell which side
  served the rows.

### Deployment

- No schema changes — every table involved already exists on the postgres
  `lita-ehousing` instance and on the MySQL `lita_production` instance
  (whichever the deployed `engine` resolves to). The fix is a behaviour
  change in two backend modules and one frontend module.
- `INTAKE_CANONICAL_TRANSACTIONS_READ` stays at the existing default
  (`false` per `cloudbuild.yaml:22`). Once the pipeline is verified healthy
  in production for ~24h the flag can be flipped on, at which point
  `_read_canonical_transactions_from_postgres` (`http_endpoints.py:2688`)
  becomes the primary read path.
- Zero-downtime: the post-connect hook is additive; no existing path
  changes signature.

## Definition of Done

1. A new SaltEdge connection persisted via
   `POST /api/saltedge/connection/{id}/persist` (or discovered via
   `POST /api/saltedge/customer/{id}/sync`) for an already-submitted
   application schedules a SaltEdge pull within 100ms of the persist call.
2. After the pull completes, `bank_data_snapshots` has at minimum one
   `(source='saltedge', product_type='transactions', user_id=application.id,
   status='succeeded')` row for that application.
3. `canonical_transactions` has rows with
   `applicant_id = f"app-{application.id:08d}"`,
   `provider_name='saltedge'`, count > 0 — visible via the postgres engine
   when `tx_engine` is configured.
4. `GET /v1/applications/28/credit-score` returns 200 with non-empty
   `dashboard.accounts_liquid_balance`, `dashboard.transactions_avg_net_cashflow`,
   and `scorecard.band` populated.
5. The dashboard at `/dashboard?id=28` renders non-zero values for
   "Bank Balance", "Average Cash Flow (3 Years)", and a non-zero
   "Total Number of Contracts" — verified visually after redeploy.
6. Existing unit suite passes (357+ tests); new tests in
   `test_bank_data_pull_saltedge.py` and `test_saltedge_post_connect_kick_off.py`
   pass.
7. The submit-time pull continues to work for new SaltEdge applicants who
   connect BEFORE submitting (regression-safe).
