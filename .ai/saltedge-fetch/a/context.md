# saltedge-fetch — Forensic Context

Branch: `fix/saltedge-fetch` (worktree
`/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/mystifying-greider-ba1f49`).
Symptom: dashboard `https://ehousing.joinlita.com/dashboard?id=28` (Sweden,
SaltEdge) shows "Total Outstanding Debt: Data pending", "Bank Balance:
Balance data unavailable", "Average Cash Flow (3 Years): SEK 0",
"0 contracts", "Housing Expense History: zero across June 2024 - May 2026".

---

## A. Current state — what is actually shipped

### Dual-engine setup (postgres-transactions epic landed)

* `backend/src/config/database.py:18` — `Base = declarative_base()` (MySQL-bound).
* `backend/src/config/database.py:181-182` — `engine` + `SessionLocal` (the
  legacy single engine; resolves via `_default_engine()` at lines 94-178).
  In production with no `CLOUD_SQL_DRIVER` env var the default driver is
  `pymysql`, so `engine` connects to `elemental-day-443510-e0:us-central1:lita-mysql`
  database `lita_production` (per `backend/cloudbuild.yaml:22`).
* `backend/src/config/database.py:194-265` — `_postgres_tx_engine()` /
  `tx_engine` / `TxSessionLocal`. Built only when all four `POSTGRES_*`
  env vars are present; on the prod cloudbuild config they ARE set
  (`POSTGRES_CLOUD_SQL_CONNECTION_NAME=…lita-ehousing`,
  `POSTGRES_DB_NAME=lita-ehousing`, `POSTGRES_DB_USER`/`PASSWORD` from
  Secret Manager). Failures during `Connector` init log + return None
  rather than crashing the process (lines 220-226).
* `backend/src/infra/postgres/database.py:6` — `TxBase = declarative_base()`
  (postgres-bound). All canonical models AND `HousingApplicationModel` /
  `ApplicationDraftModel` bind to `TxBase` —
  `backend/src/infra/postgres/models.py:30, 61, 91, 123, 152, 185, 217`.
* The MySQL re-export shim at `backend/src/infra/mysql/models.py:23-31`
  imports the seven `TxBase` models so legacy import paths
  (`from src.infra.mysql import models; models.HousingApplicationModel`)
  still resolve.

### Where each table lives in production

| Table                            | Engine    | Bound model location                                | Notes |
|----------------------------------|-----------|-----------------------------------------------------|-------|
| `applications`                   | postgres  | `src/infra/postgres/models.py:185`                  | Cutover already shipped. Routes via `get_application_db` (`src/config/database.py:279-294`). |
| `application_drafts`             | postgres  | `src/infra/postgres/models.py:217`                  | Same as applications. |
| `raw_provider_payloads`          | postgres  | `src/infra/postgres/models.py:30`                   | Canonical write target. |
| `canonical_financial_accounts`   | postgres  | `src/infra/postgres/models.py:61`                   | |
| `canonical_transactions`         | postgres  | `src/infra/postgres/models.py:91`                   | Read by `_read_canonical_transactions_from_postgres` (`http_endpoints.py:2688`). |
| `canonical_identity_profiles`    | postgres  | `src/infra/postgres/models.py:152`                  | |
| `canonical_income_summaries`     | postgres  | `src/infra/postgres/models.py:123`                  | |
| `users` / `bank_data_snapshots` / `open_banking_consents` / `credit_scores` / `provider_connection_status` etc. | mysql `engine` | `src/infra/mysql/models.py:33,90,152,179,…` | All bind to `Base`. Even though some migrations under `backend/migrations/0NN_*.sql` use TIMESTAMPTZ / JSONB (postgres syntax) they are applied through `run_migration.py` which uses the default `engine` — confirming production runs them on the postgres-or-mysql engine the `engine` resolves to. The `Column` definitions use `_JSONB().with_variant(JSON, "mysql")…` (`models.py:162, 190-195`) so the same model works on either dialect. |

The cloudbuild `--add-cloudsql-instances` mounts BOTH instances on the
Cloud Run revision (`cloudbuild.yaml:24`), so the runtime can hit either.

### SaltEdge pull path (file by file)

* `backend/src/usecase/saltedge_usecase.py:4-71` — only used by the older
  `/api/saltedge/connect-url` and `/api/saltedge/initiate-enduser-connection`
  endpoints. NOT on the active widget path; the connect-accounts page uses
  v6 endpoints below.
* `backend/src/infra/external_apis/saltedge_signing.py` — RSA-SHA256 request
  signer. `sign_with_openssl(data, private_key_pem|private_key_path)` at
  the top of `saltedge_client.py:106`. Configuration error at
  `saltedge_client.py:78-85` requires `SALTEDGE_APP_ID`, `SALTEDGE_SECRET`,
  and either `SALTEDGE_PRIVATE_KEY_PEM` or `SALTEDGE_PRIVATE_KEY_PATH`.
* `backend/src/infra/external_apis/saltedge_client.py:70-302` — `SaltEdgeClient`.
  Methods used by the pull path: `get_connection(id)` (line 479),
  `list_connections(customer_id)` (line 507), `list_accounts(customer_id, connection_id)`
  (line 523), `list_transactions(account_id, from_date, to_date)` (line 304),
  `get_holder_info(connection_id)`. Base URL `https://www.saltedge.com/api/v6`.
* `backend/src/infra/external_apis/saltedge_partners_client.py` — separate
  client used only for `customer_reports` (line 868 of bank_data_pull). The
  partners client failure is silently demoted (lines 670-674: it is set to
  `None` and customer_reports is skipped — does NOT abort the rest).
* `backend/src/usecase/bank_data_pull.py:550-805` — `run_submit_saltedge_pull`.
  Flow:
  1. Country gate (line 576 — skip if US).
  2. Configure `SaltEdgeClient()`; on `SaltEdgeConfigurationError` log + return (596-602).
  3. Back-fill `application_id` onto consent rows whose `customer_reference`
     matches `application.email` and have `application_id IS NULL`
     (606-624). On error roll back the postgres session (this consent
     repository session is the MySQL `_BankPullSessionLocal`, but the
     comment at line 627 is misleading — it really is the same session
     that backs `OpenBankingConsentModel` which lives on `engine`/MySQL).
  4. `list_live_by_application(application.id)` (line 633), if empty fall
     back to `list_live_by_customer_reference(email)` (642).
  5. If still no consents, return early with a log line (651-657).
  6. Per consent: spawn four `_run_with_retry` calls
     (`connection`, `accounts`, `transactions`, `holder_info`) each
     writing one `bank_data_snapshots` row keyed by `(user_id=application.id, source='saltedge', consent_id, product_type)`.
  7. After the 4 retries, build `merged_raw = {accounts, transactions, …}`
     (lines 755-762), open `TxSessionLocal()` against postgres, run
     `NormalizationService(fx_rates={"USD": 1.0}).normalize_saltedge(...)`
     and `CanonicalRepository.persist_snapshot(...)` (763-781).
* `backend/src/services/normalization_service.py:257-342` — `_SaltEdgeNormalizer`.
  Reads `raw_payload["accounts"]` and `raw_payload["transactions"]`. Account
  shape requires a non-empty `id`; transaction shape requires non-empty
  `id` and a parseable `made_on` or `created_at`. Amounts: `abs(_fx_convert(amt, currency))`,
  direction `'credit' if amt >= 0 else 'debit'`. fx_rates is `{"USD": 1.0}`
  in the bg worker, so a SEK transaction will fall into the
  `_fx_convert` "no rate" branch (`normalization_service.py:133-135`) which
  logs a warning and returns the SEK amount UNCONVERTED. The
  `amount_usd` column then stores the SEK number — wrong USD value but
  not a write blocker. **This means the dashboard will eventually see
  SEK numbers labeled as USD; not the cause of the zero values today
  but a pre-existing latent bug worth flagging.**
* `backend/src/services/payload_adapters.py:182-209` —
  `SaltEdgePayloadAdapter.map_transactions`. Currently NOT in the live
  path — the bg worker uses `NormalizationService.normalize_saltedge`
  directly. Kept for legacy callers and tests.
* `backend/src/interface/saltedge_endpoints.py:488-644` — `persist_saltedge_connection`.
  Body: `{connection_id, customer_reference, categorization, application_id?}`.
  Calls upstream `get_connection` + `list_accounts` to compute the
  account fingerprint, then `repo.upsert_from_widget_return(...)` writes
  the row with `application_id` if the body provided one.
* `backend/src/interface/saltedge_endpoints.py:647-777` — `sync_saltedge_customer`.
  Same as persist but iterates `list_connections(customer_id)` upstream
  and persists every new one. Body: `{customer_reference, categorization,
  application_id?}`. **Neither endpoint kicks off the SaltEdge pull
  thread today; this is the gap.**
* `backend/src/interface/http_endpoints.py:130-211` — `_kick_off_plaid_submit_pull`
  / `_kick_off_saltedge_submit_pull`. Daemon threads with their own
  `_BankPullSessionLocal()` (alias of MySQL `SessionLocal` at line 107).
* `backend/src/interface/http_endpoints.py:2007-2225` — `create_application`
  (the application submit handler). Line 2218: `_kick_off_saltedge_submit_pull(application)`
  fires only on successful submit and only on `country_code != "US"`.
  The handler returns at line 2266+ before the daemon thread completes.
* `backend/src/interface/http_endpoints.py:3007-3093` — `get_application_transactions`.
  Returns `{applicant_id, start_date, end_date, transactions, total,
  dashboard_loan_adapter, dashboard_snapshot_adapter, source}`. When
  `INTAKE_CANONICAL_TRANSACTIONS_READ=true` and canonical rows exist for
  `app-{id:08d}`, returns the canonical fast-path; otherwise iterates
  `bank_data_snapshots` for `is_latest=true, status=succeeded`.
* `backend/src/interface/http_endpoints.py:2622-2685` — `get_application_credit_score`.
  Calls `get_or_compute_score` which reads `bank_data_snapshots` rows
  (succeeded only, `_list_succeeded_snapshots` at
  `backend/src/usecase/credit_scoring_service.py:91-107`) and dispatches
  to `saltedge_to_dataframes.build_dataframes` (`credit_scoring_service.py:347-352`).
  The dashboard's `apiScore.dashboard` and `apiScore.scorecard` come
  exclusively from this call — and it returns HTTP 202
  ("Bank data is still being processed") whenever `_list_succeeded_snapshots`
  returns empty (line 313-323).
* `backend/src/interface/open_banking_endpoints.py` — Plaid-side; not on
  the SaltEdge fetch path. Confirmed by grep — no SaltEdge handlers there.

### How `bank_data_snapshots` rows are created and read

* Created by `BankDataSnapshotRepository.start_attempt` (called in
  `_run_with_retry` at `bank_data_pull.py:142-152`) which writes one row
  with `status='in_progress'`. On success/failure the same row's status is
  updated by `repository.finalize_attempt` (lines 161-167 for failure, 183-188
  for success). `is_latest=True` is set on terminal status; the
  partial unique index `(user_id, source, product_type, consent_id)`
  ensures one current row per (applicant, provider, product, connection).
* Read by `SQLBankDataSnapshotRepository.list_latest_for_user(user_id=application_id)`
  (`backend/src/infra/mysql/bank_data_snapshot_repository.py:106`). Used by
  the v7 scorer (`credit_scoring_service.py:96`),
  `get_application_transactions` (`http_endpoints.py:3064`),
  `get_application_payment_history`, `extract_saltedge_holder_identity`
  (`bank_data_pull.py:1064`).

### How `canonical_transactions` rows are created

* Only via `CanonicalRepository.persist_snapshot(snapshot, raw_payload, object_type)`
  in `backend/src/infra/postgres/canonical_repository.py:64-…`.
* Two callers in production code, both inside `bank_data_pull.py`:
  1. `run_submit_plaid_pull` (line 302) on the US path.
  2. `run_submit_saltedge_pull` (line 773) on the non-US path.
* Both are wrapped in `try/except Exception` (lines 311-315 and
  782-786) that logs `[canonical.{plaid|saltedge}] persist failed (non-fatal)`
  and never re-raises — so a canonical write failure never breaks the
  raw `bank_data_snapshots` write. Conversely, a missing
  `tx_engine` (`TxSessionLocal is None`) just logs and skips
  (lines 284-289 / 748-753).

### Dashboard data path (frontend — verifying dashboard-verify fixes)

* `frontend/app/dashboard/page.tsx:1598-1602` — `customerId` reads
  `localStorage.getItem("dw_application_saltedge_customer_id")`. **Bug 1
  fix from dashboard-verify is shipped.**
* `frontend/app/dashboard/page.tsx:2099-2106` — `cashflow` fetch hits
  `/api/v1/applicants/${applicationId}/transactions?start_date=…&end_date=…`,
  passes the result through `dashboard_loan_adapter` and
  `dashboard_snapshot_adapter` keys. **Bug 2 fix from dashboard-verify is
  shipped** — the response includes both adapter keys (verified at
  `http_endpoints.py:3087-3091`).
* `frontend/app/dashboard/page.tsx:2402-2429` — `fetchCreditScore` calls
  `/api/v1/applications/${id}/credit-score`. On 202 (pending) the
  scorePending modal is shown; on 200 the `apiScore` state is set; on
  any other status `apiScore` becomes null.
* `frontend/app/dashboard/page.tsx:2442-2541` — `v7Data` useMemo. Reads
  `dash.accounts_liquid_balance`, `dash.transactions_avg_net_cashflow`,
  etc. **Bug 3 + 3b fixes from dashboard-verify are shipped** — the
  identity fields read from `application.full_name` first, financial
  fields read pipeline-emitted keys.
* `frontend/app/application/connect-accounts/pageSalt.tsx:331,767-770,797-877`
  — writes `dw_application_saltedge_customer_id`, calls
  `/api/saltedge/connection/{id}/persist` (line 700) and
  `/api/saltedge/customer/{id}/sync` (line 837). **The persist body
  currently does NOT include `application_id`** (lines 706-712); only
  `connection_id`, `customer_reference`, `categorization`. Same for the
  sync body (lines 843-847). The backend pydantic models at
  `saltedge_endpoints.py:101-110` and `124-134` accept an optional
  `application_id` but the frontend never sends it.

---

## B. Application 28 specifically

* "Application 28" = `applications.id = 28` on the postgres `lita-ehousing`
  database. The dashboard URL `?id=28` is read at
  `frontend/app/dashboard/page.tsx` (similar pattern as `customerId` memo
  but for `application?.id`) and used as the path parameter for
  `/api/v1/applications/28/...`.
* SaltEdge customer linkage: the `open_banking_consents` table holds a
  row per (provider='saltedge', connection_id) with
  `application_id` populated post-submit by either:
  (a) the connect-accounts page if the persist request body included
  `application_id` — but the frontend currently never sends it, OR
  (b) `bind_application_by_customer_reference(email, application_id)` at
  `bank_data_pull.py:608-611`, which is called inside
  `run_submit_saltedge_pull` AFTER the application is submitted.
* The dashboard derives the customer ID from `localStorage.getItem("dw_application_saltedge_customer_id")`
  at `dashboard/page.tsx:1600`, NOT from the application — so the
  /connections endpoint can succeed even when the consent row's
  `application_id` is null. **However the credit-score and transactions
  endpoints both key on `application_id` (`http_endpoints.py:2647-2651,
  3064`) and need the snapshot rows to have `user_id=28`.**

### Failure modes that would leave the four KPIs blank (28-specific)

1. **No SaltEdge consent row references `application_id=28`** — either
   never persisted (frontend never called persist/sync), or persisted
   with `customer_reference != email` so the back-fill bind missed it.
   Result: `run_submit_saltedge_pull` reaches line 651 ("no live SaltEdge
   consents") and exits without writing any snapshot.
2. **Consent exists but the SaltEdge daemon thread for application 28
   never ran** — because the user connected the bank AFTER submitting,
   so `_kick_off_saltedge_submit_pull` was called once at submit time
   when no live consent existed yet, then was never re-fired.
   `bank_data_snapshots` therefore has zero rows for `user_id=28`.
   `_list_succeeded_snapshots` returns empty → credit-score endpoint
   returns 202 ("pending"). Dashboard sees `apiScore=null` →
   `v7Data` returns all zeros. **High likelihood given the symptoms.**
3. **Pull thread ran but every `transactions` SaltEdge call returned 0
   transactions** — `_raw_saltedge_transactions` (`bank_data_pull.py:821-865`)
   succeeds with an empty list. `bank_data_snapshots` row is written with
   `status='succeeded'` and an empty `payload['transactions']`. The v7
   scorer would see `len(transactions) == 0` and the dashboard
   `accounts_liquid_balance` etc. would still populate from the
   `accounts` snapshot but `transactions_avg_*` would be 0. Less likely
   given the user reports zero balance too.
4. **Salt Edge raw pull threw `SaltEdgeConfigurationError`** because
   `SALTEDGE_PRIVATE_KEY_PEM` / `_PATH` is missing — `bank_data_pull.py:594-602`
   catches this and returns silently. Only one log line; otherwise
   no-op. Cloud Run env in `cloudbuild.yaml` does not set any
   `SALTEDGE_*` vars; they must come from Secret Manager separately.
   **Possible** if Sweden was added recently and the SaltEdge secret
   was never bound to the prod service account.

---

## C. Root cause analysis

For each candidate, evidence is cited as `path:line`. Likelihood is high /
medium / low. The TOP candidate has been verified by reading the relevant
code paths.

### Candidate 1 (HIGH — verified): Post-submit connection has no retrigger.

`_kick_off_saltedge_submit_pull` is called from exactly one place:
`backend/src/interface/http_endpoints.py:2218` inside `create_application`.
This fires once at the moment the user clicks "submit", with whatever
SaltEdge consents already exist at that instant.

The connect-accounts flow, however, runs at
`/application/connect-accounts/pageSalt.tsx`. After the SaltEdge widget
returns the user can:
- (a) Submit immediately — the persist call wrote the consent before
  submit so `_kick_off_saltedge_submit_pull` finds it via
  `list_live_by_application(28)` or the `customer_reference` fallback.
- (b) Submit FIRST and connect a bank LATER (e.g. in a follow-up session,
  or because they hit Submit before the redirect race resolved). In that
  flow the persist endpoint records the consent at
  `saltedge_endpoints.py:604-615` but NOTHING triggers a SaltEdge pull
  for that consent. There is no scheduled job, no
  webhook handler, no post-persist hook.

For Sweden user "tobias" on application 28 the symptoms (customer info
populated from application form, dashboard data zero/empty) are
consistent with case (b): the application form data (name, phone,
country=SE, address) is present because `submit_housing_application`
wrote it, but no SaltEdge snapshots exist because the pull was never
re-scheduled when the bank connection landed afterward.

Cross-evidence:
- `saltedge_endpoints.py:488-644` (persist) and `:647-777` (sync) — neither
  imports `_kick_off_saltedge_submit_pull` nor the underlying
  `run_submit_saltedge_pull`. Verified by grep:
  `grep -n "kick_off_saltedge\|run_submit_saltedge_pull" backend/src/interface/saltedge_endpoints.py`
  returns zero hits.
- `pageSalt.tsx:706-712, 843-847` — frontend persist/sync bodies omit
  `application_id`, so even if the backend wired up a hook keyed on
  `application_id` it would frequently see `null`.
- `bank_data_pull.py:608-611` — the back-fill from
  `bind_application_by_customer_reference(email, application_id)` only runs
  inside `run_submit_saltedge_pull` itself, which means
  it is gated by the same daemon thread that needs to fire — chicken and
  egg.

This is the verified root cause. The SaltEdge consent row for application 28
exists (otherwise `dw_application_saltedge_customer_id` localStorage
wouldn't be populated), but no `bank_data_snapshots` rows ever got
written because the pull thread never started after the consent was
recorded.

### Candidate 2 (LOW): Daemon thread crashed silently before writing.

`_kick_off_saltedge_submit_pull` wraps the worker in a `try/except`
(`http_endpoints.py:181-205`) that logs but doesn't re-raise. If the
thread genuinely ran for application 28, we'd see at least one log line
`[saltedge.submit] thread started application_id=28`. Without log
access we can't confirm this directly, but the absence of any
`bank_data_snapshots` row with `user_id=28, source='saltedge'`
(implied by the credit-score endpoint returning empty) is consistent
with the thread NEVER starting (Candidate 1) rather than starting and
crashing.

### Candidate 3 (LOW): Canonical write skipped because `tx_engine is None`.

Even if the canonical write was skipped, the `bank_data_snapshots` rows
would still exist and the dashboard's primary data path
(credit-score → bank_data_snapshots) would still populate KPIs.
`INTAKE_CANONICAL_TRANSACTIONS_READ=false` per `cloudbuild.yaml:22`
means the read endpoint already falls back to `bank_data_snapshots`
(`http_endpoints.py:3060` — "fall through to legacy
bank_data_snapshots path"). So a canonical-side outage cannot explain
the user-visible symptoms; the legacy path would still populate the
dashboard. This is NOT the root cause.

### Candidate 4 (LOW): `/transactions` endpoint returns empty / never falls through.

Reading `http_endpoints.py:3007-3093` confirms the endpoint always
falls through to the legacy `bank_data_snapshots` path when canonical
rows are absent (line 3060) and always returns the
`dashboard_loan_adapter`/`dashboard_snapshot_adapter` keys (lines
3087-3091, post dashboard-verify task c). If `bank_data_snapshots` has
zero rows for `user_id=28`, this endpoint just returns
`{transactions: [], total: 0, dashboard_loan_adapter: {…zeros…},
dashboard_snapshot_adapter: {…zeros…}}` — which matches what the
dashboard displays. So the endpoint is fine; the root cause is the
absent snapshot rows, which is Candidate 1.

### Candidate 5 (LOW): SaltEdge consent missing entirely.

If the consent row didn't exist at all, the frontend's
localStorage `dw_application_saltedge_customer_id` would still be
populated (it's written from the widget redirect URL, not from the DB).
But `_kick_off_saltedge_submit_pull` would log
`[saltedge.pull] no live SaltEdge consents application_id=28 — nothing
to pull`. Cannot rule out without log access. However Candidate 1
remains valid even if the consent IS there (the trigger is missing).

### Candidate 6 (LOW): Frontend reads wrong field — `dashboard_loan_adapter` undefined.

Already fixed in dashboard-verify (`http_endpoints.py:3087-3091`).
Verified.

### Candidate 7 (LOW): Customer ID localStorage cross-contamination.

Possible but doesn't explain Bank Balance / Cash Flow zero, only the
SaltEdge connections list. The KPI tiles read from
`apiScore.dashboard.accounts_liquid_balance` etc., which come from
the credit-score endpoint, not the connections endpoint.

### Verdict

**Candidate 1 is the root cause.** A user who submits an application and
THEN connects a SaltEdge bank account never triggers the SaltEdge
transaction pull, because the only call site for
`_kick_off_saltedge_submit_pull` is in the application-submit handler.
The persist (`/api/saltedge/connection/{id}/persist`) and sync
(`/api/saltedge/customer/{id}/sync`) endpoints record the consent but
do not schedule the pull. Result: `bank_data_snapshots` is empty for
that application → `get_application_credit_score` returns 202 →
dashboard `apiScore=null` → all four KPIs render their fallback zero/
"unavailable" copy.

---

## D. Files to change

| File | Change |
|---|---|
| `backend/src/interface/saltedge_endpoints.py` | At the end of `persist_saltedge_connection` (after the upsert returns), if `request_data.application_id is not None`, load the `HousingApplication` from postgres via `SQLAlchemyHousingApplicationRepository` and call a new helper `schedule_saltedge_pull_for_application(application)`. Same change at the end of `sync_saltedge_customer` once at least one new connection was persisted. |
| `backend/src/interface/http_endpoints.py` | Extract the body of `_kick_off_saltedge_submit_pull` into a publicly-importable helper (e.g. `schedule_saltedge_pull_for_application(application, *, trigger="submit")`) so the SaltEdge endpoints module can call it without importing the legacy underscore-prefixed name. Add an in-memory dedup map keyed by application.id with a 30-second TTL so a rapid persist+sync sequence doesn't spawn two threads for the same applicant. |
| `frontend/app/application/connect-accounts/pageSalt.tsx` | Update the `/api/saltedge/connection/{id}/persist` and `/api/saltedge/customer/{id}/sync` request bodies to include `application_id` whenever the URL state has it (already wired into the page via the search params; lookup pattern matches the `customerId` memo). Falls back to omitting the field when no application id is known yet. |
| `backend/tests/usecase/test_bank_data_pull_saltedge.py` | NEW — exercise `run_submit_saltedge_pull` with a fake SaltEdge client + repository, asserting that consents with no `application_id` get bound by `customer_reference`, and that canonical persistence writes one txn per upstream transaction. |
| `backend/tests/interface/test_saltedge_post_connect_kick_off.py` | NEW — patch `schedule_saltedge_pull_for_application` and verify it is called exactly once on persist+sync with `application_id` set, not called when `application_id is None`, and rate-limited within a single 30s window. |
| `backend/tests/interface/test_saltedge_endpoints_persist_kicks_off.py` (or merge into above) | NEW — end-to-end style test that POST `/api/saltedge/connection/{id}/persist` with `application_id=28` writes the consent row AND signals the schedule helper. |
| `frontend/app/application/connect-accounts/pageSalt.tsx` (test coverage) | Existing Playwright tests under `frontend/eHousing_Web/tests/testcases/applicants-dashboard-*-tests.spec.ts` should be extended with a SaltEdge-after-submit scenario, but is optional in this fix scope. |

No DB schema change required.

---

## E. External services / env vars

### SaltEdge

| Var | Required? | Source | Notes |
|---|---|---|---|
| `SALTEDGE_APP_ID` | yes | Secret Manager (assumed `saltedge-app-id` or env var on Cloud Run) | Read at `saltedge_client.py:72`. |
| `SALTEDGE_SECRET` | yes | Secret Manager | `saltedge_client.py:73`. |
| `SALTEDGE_PRIVATE_KEY_PEM` | one-of | Secret Manager (multi-line PEM) | `saltedge_client.py:74`. |
| `SALTEDGE_PRIVATE_KEY_PATH` | one-of | filesystem path | `saltedge_client.py:75`. Either PEM or PATH must be set or `SaltEdgeConfigurationError` raises. |
| `SALTEDGE_PARTNERS_*` | optional | Secret Manager | Only used by `SaltEdgePartnersClient` for `customer_reports`. Failures are silently demoted (`bank_data_pull.py:670-674`). |

`backend/cloudbuild.yaml` does NOT bind any `SALTEDGE_*` env var or
secret. They must be configured directly on the Cloud Run service
(out-of-band from cloudbuild.yaml) — verify before redeploy.

### Postgres / MySQL

| Var | Required? | Notes |
|---|---|---|
| `CLOUD_SQL_CONNECTION_NAME` | yes (prod) | Resolved to `elemental-day-443510-e0:us-central1:lita-mysql` per `cloudbuild.yaml:22`. |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes (prod) | `db-user:latest`, `db-password:latest`, `lita_production`. |
| `CLOUD_SQL_DRIVER` | optional | Default `pymysql`. Set to `pg8000` to swap default `engine` to postgres. NOT set in cloudbuild today. |
| `POSTGRES_CLOUD_SQL_CONNECTION_NAME` | required for tx_engine | `…lita-ehousing`. |
| `POSTGRES_DB_USER`, `POSTGRES_DB_PASSWORD`, `POSTGRES_DB_NAME` | required for tx_engine | `postgres-db-user`, `postgres-db-password`, `lita-ehousing`. Missing → `_postgres_tx_engine` returns `None` and canonical writes / applications endpoints disable themselves (`config/database.py:204-209`). |
| `INTAKE_CANONICAL_TRANSACTIONS_READ` | optional | `false` in prod per `cloudbuild.yaml:22`. Flip to `true` after canonical_transactions has rows for ~24h. |
| `APP_ENV` | required | `prod`/`production` triggers Cloud SQL Connector path; everything else uses `DATABASE_URL` / TCP / sqlite fallback. |

### Cloud SQL Auth Proxy

`cloudbuild.yaml:24` mounts both instances:
`--add-cloudsql-instances=elemental-day-443510-e0:us-central1:lita-mysql,elemental-day-443510-e0:us-central1:lita-ehousing`
— the Cloud Run revision can hit either.

---

## F. Deployment safety

* **Schema migrations: NONE.** Every involved table already exists. The
  fix is pure backend behaviour (one new helper, two endpoint hook
  insertions, three test files) plus one frontend body-shape change.
* **Zero-downtime: yes.** The persist/sync endpoints retain their
  current 200 responses and just additionally schedule a daemon
  thread on the way out. Existing callers see no change.
* **Rollback plan:** revert the PR. The new `application_id` field on
  the persist/sync request bodies is already an optional pydantic field
  in production today, so frontend rollback can land independently.
* **Observability:** new log line `[saltedge.post-connect] kick
  application_id=… connection_id=… trigger={persist|sync}` is the
  signal that the pull was scheduled. Existing `[saltedge.submit]
  thread started/completed` lines + `[canonical.saltedge] applicant=…
  txns=N persisted` confirm the pipeline ran end-to-end.
* **Production verification:** for application 28, after redeploy:
  1. Have user re-trigger persist (re-link their Swedish bank, OR call
     `POST /api/saltedge/customer/{customer_id}/sync` with body
     `{customer_reference: "<email>", application_id: 28}`).
  2. Wait ~30s.
  3. `curl /api/v1/applications/28/credit-score` should return 200
     (not 202) with `dashboard.accounts_liquid_balance` populated.
  4. Dashboard at `?id=28` re-renders with non-zero KPIs.
* **Risky if mishandled:** the dedup map. If implemented as a
  module-level dict without a TTL, repeated frontend retries could
  silently no-op forever after a single transient failure. Keep the
  TTL short (≤30s) and key on `application_id`; on dedup hit log a
  WARNING so an operator can see it.

---

## G. Data scale

* **SaltEdge accounts per application:** 1-3 in typical onboarding
  (single primary bank), occasionally 5-8 across personal/business/investment.
  `_compute_account_fingerprint` (`saltedge_endpoints.py:459-485`) hashes
  IBAN/masked-PAN sets so duplicates collapse server-side. The persist
  flow upserts one consent row per (customer_reference, provider_code,
  fingerprint).
* **Transactions per pull:** SaltEdge `/transactions?account_id=…&from_date=…&to_date=…`
  returns up to ~1000-2000 rows for a 730-day lookback per personal
  account (similar to Plaid). The current pull does NOT paginate
  (`saltedge_client.py:304-341` — single GET). For accounts with more
  than the SaltEdge default per-page limit (typically 1000) this would
  silently truncate, but is not the cause of the zero-rows symptom.
  Tracked as a separate enhancement.
* **`bank_data_snapshots` row count:** four rows per (application,
  connection): `connection`, `accounts`, `transactions`, `holder_info`.
  Plus one customer-level `customer_reports` row. Typical applicant has
  4-12 rows total per pull session.
* **`canonical_transactions` row count:** equal to the number of rows
  returned by SaltEdge `/transactions` per pull, deduplicated on the
  postgres unique constraint `(applicant_id, provider_name,
  provider_transaction_id)` (`postgres/models.py:91-120` plus the table's
  unique index on those three columns).
* **Index coverage:** `canonical_transactions.applicant_id` is indexed
  (`postgres/models.py:101`); `posted_date` ordering relies on a
  pre-existing index on `(applicant_id, posted_date)` if one was
  created by `010_canonical_normalized_tables.sql` migration. The
  dashboard read pattern is "all rows for an applicant ordered by
  posted_date desc, limit 2000" (`http_endpoints.py:2716-2722`) — well
  within scope of the existing indexes.
