## Dashboard Adapter Verification — Final Report

## Verdict: BLOCK

## Test Results
- Backend ML unit tests: PASS — 101 tests (all `tests/ml/` including `test_dashboard_adapters.py` and `test_dashboard_snapshot_adapter.py`)
- Frontend TypeScript: PASS — zero errors in `dashboard/page.tsx`; 4 pre-existing errors in unrelated files (test infra, auth route, applicants page, playwright config)
- Integration tests: could not run — interface/infra/usecase tests require a full venv (sqlalchemy, fastapi, plaid, etc.) not available in the local environment

---

## Critical Bugs (merge blockers)

### Bug 1: SaltEdge `customerId` reads Postgres integer PK instead of SaltEdge provider string ID
- File: `frontend/app/dashboard/page.tsx`
- Lines: 1354–1364 (memo), 1559 (usage)
- Problem: `customerId` is derived from `application?.id` — the Postgres integer primary key (e.g. `42`), cast to string `"42"`. It is then passed to `GET /api/saltedge/customer/${customerId}/connections`. SaltEdge customer IDs are provider-assigned strings (e.g. `"SE-1234abc"`) stored in `open_banking_consents.saltedge_customer_id`. `ApplicationResponse` does not include `saltedge_customer_id`, so the field is not available from the application detail API. The `connect-accounts/pageSalt.tsx` page writes the real customer ID to `localStorage` under `dw_application_saltedge_customer_id` (lines 330, 716–717), but `dashboard/page.tsx` contains zero references to that key. Every call to the connections endpoint returns 404/SaltEdge API error. The connections panel silently shows no accounts.
- Fix: In `dashboard/page.tsx`, replace the `customerId` memo with a read from `localStorage.getItem("dw_application_saltedge_customer_id")`. For a more robust backend-driven fix, add a `GET /v1/applications/{id}/saltedge-customer` endpoint that queries `open_banking_consents` by `application_id` and returns the real `saltedge_customer_id`, then fetch it on dashboard load.

### Bug 2: New transactions endpoint omits `dashboard_loan_adapter` and `dashboard_snapshot_adapter`
- File: `backend/src/interface/http_endpoints.py`
- Lines: 2630–2677 (backend endpoint), `frontend/app/dashboard/page.tsx` lines 1831 (fetch), 1931–1936 (consumption)
- Problem: The dashboard calls `GET /v1/applications/{id}/transactions` (via the Next.js proxy at `/api/v1/applicants/[id]/transactions`). This endpoint returns only `{ applicant_id, start_date, end_date, transactions, total }`. It does not include `dashboard_loan_adapter` or `dashboard_snapshot_adapter`. The legacy `/payments/history` endpoint includes both adapter keys, but the dashboard does not call it. At lines 1931–1936 of `page.tsx`, `data.dashboard_snapshot_adapter?.loan_metrics` and `data.dashboard_loan_adapter` are both `undefined` for every response. `setLoanAnalysisOverride` is never called with real data, so all loan metric UI panels (loan balance, repayment period, delays, late payments, default flags, secured/unsecured split) render blank or zero for every applicant.
- Fix: Add the adapter calls to the `get_application_transactions` return value in `http_endpoints.py`. Both functions are already imported (lines 113 and 115). Add to the return dict:
  ```python
  "dashboard_loan_adapter": adapt_open_banking_dashboard_loan_variables(combined),
  "dashboard_snapshot_adapter": build_dashboard_snapshot_adapter(application=None, transactions=combined),
  ```

### Bug 3: v7Data field name mismatches — most credit-score dashboard fields will always be null/zero
- File: `frontend/app/dashboard/page.tsx`
- Lines: 2175–2240 (v7Data useMemo)
- Problem: The `v7Data` mapping reads field names from `apiScore.dashboard` (populated from `score.dashboard_vars`) that do not match the actual output keys of either pipeline:
  - `dash.full_name` — SaltEdge outputs `holder_info_full_name`; Plaid outputs `identity_full_name`. Neither pipeline outputs a bare `full_name` key.
  - `dash.phone_Number` — SaltEdge outputs `holder_info_phone`; Plaid outputs `identity_primary_phone`. `phone_Number` is never emitted by any pipeline.
  - `dash.current_Address` — SaltEdge outputs `holder_info_address_street`/`_city`/etc.; Plaid outputs `identity_street`/`identity_city`/etc. No pipeline outputs `current_Address`.
  - `dash.place_work` — neither pipeline emits this key.
  - `dash.bank_Balance_checking_saving_accounts`, `dash.assets_Securities`, `dash.cash_flow`, `dash.avg_monthly_mortgage_payment`, `dash.average_spend_rent`, `dash.average_monthly_salary`, `dash.loan_Balance_mortgage`, `dash.repayment_period_mortgage_pending`, `dash.dpd_mortgage_missed_months` — SaltEdge outputs `monthly_acct_*` and `holder_info_*` prefixed names; Plaid outputs `dashboard_`-prefixed names (`dashboard_avg_monthly_mortgage_pmt`, `dashboard_total_avg_loan_payment`, etc.). None of these bare legacy key names are produced by either pipeline.
  - Fields that DO match both pipelines: `total_loan_balance`, `total_avg_monthly_loan_payment`, `balance_of_credit_card_overdraft`, `no_of_credit_card_overdraft`, `value_of_secured_loan`, `no_of_secured_loan`, `value_of_unsecured_loan`, `no_of_unsecured_loan`, `value_of_other_loans`, `no_of_other_loans`, `total_loan_accounts` — these are output correctly by both pipelines.
- Impact: Identity fields (name, phone, address, employer), balance/cashflow KPI tiles, housing capacity, repayment burden, mortgage section, and salary fields will all render null/zero even when the pipeline has successfully computed values. This is the most pervasive bug in terms of visible UI impact.
- Fix: Audit every key in the `v7Data` useMemo against the actual output dicts of both `saltedge_dashboard_variables.py:derive_dashboard_variables` and `plaid_dashboard_variables.py:derive_dashboard_variables`. Replace each mismatched key with the correct pipeline output name, using a multi-key fallback where SaltEdge and Plaid use different names (e.g. `dash.holder_info_full_name ?? dash.identity_full_name` for `fullName`; `dash.holder_info_phone ?? dash.identity_primary_phone` for `phone`; `dash.dashboard_avg_monthly_mortgage_pmt` for `avgMonthlyMortgage`).

---

## Minor Issues (non-blocking)

### Issue 1: Migration 006 is safe for existing Plaid rows
- File: `backend/migrations/006_open_banking_saltedge.sql`
- `ADD COLUMN IF NOT EXISTS provider VARCHAR(32) NOT NULL DEFAULT 'plaid'` — safe; existing rows automatically receive `'plaid'`.
- `ALTER COLUMN consent_reference/expires_at/scopes DROP NOT NULL` — safe; relaxes constraints only, existing Plaid rows are unaffected.
- All new SaltEdge columns are added as `NULL`. Unique indexes use `WHERE` filters scoped to SaltEdge rows. No new `NOT NULL` additions that could reject existing rows.
- Verdict: migration is safe to apply to a production database with existing Plaid data.

### Issue 2: `fallbackSaltEdgeAccounts` logic is correct but data-limited
- File: `frontend/app/dashboard/page.tsx`
- Lines: 1462–1538
- Logic correctly filters, deduplicates, and formats accounts from `uniqueConnectedAccounts` where `provider === "saltedge"`. However, `connected_accounts` typically stores names but not balances, so displayed cards show names only. Data completeness limitation, not a code bug.

### Issue 3: `exchange_token` endpoint may be test-router only
- File: `backend/src/interface/http_endpoints.py`
- Lines: 3586–3596
- The `POST /exchange_token` Plaid token-exchange endpoint appears to be registered on `test_router`. Verify that a production-path equivalent exists before assuming the full Plaid connect flow is production-ready.

---

## What Works Correctly
- All 101 ML unit tests pass; `adapt_open_banking_dashboard_loan_variables` and `build_dashboard_snapshot_adapter` are correctly implemented and produce all six required section keys.
- Migration 006 is idempotent and safe to apply to a live Plaid-only database.
- `_kick_off_plaid_submit_pull` and `_kick_off_saltedge_submit_pull` correctly wire the submit endpoint to provider data pull pipelines via background threads.
- `persist_saltedge_connection` correctly upserts to `open_banking_consents` with the SaltEdge-specific fields.
- The connect-session endpoint returns a valid `connect_url` for the SaltEdge widget.
- The credit-score endpoint correctly returns `{ dashboard: score.dashboard_vars, scorecard: score.scorecard_vars, ... }`.
- `fallbackSaltEdgeAccounts` provides graceful degradation when live SaltEdge fetch fails.
- Loan composition fields (`total_loan_balance`, `balance_of_credit_card_overdraft`, `value_of_secured_loan`, `value_of_unsecured_loan`, `value_of_other_loans`, and their count pairs) match between both pipelines and the frontend — the loan donut and total contract count will populate correctly once Bug 2 is fixed.
- The new transactions endpoint correctly handles both SaltEdge and Plaid snapshots in a single normalisation loop.

---

## Recommendation

Do not merge `kapil-potgres` to `main` in its current state. Three confirmed critical bugs block the merge. Bug 2 is a one-line backend fix (add the two adapter keys to the transactions endpoint return dict). Bug 1 is a small frontend change (read `localStorage.getItem("dw_application_saltedge_customer_id")` instead of `application?.id`). Bug 3 is the most impactful and requires the most work: the `v7Data` useMemo in `dashboard/page.tsx` uses legacy bare field names that no pipeline ever emits — all identity, salary, balance, cashflow, and mortgage KPI tiles will always render null/zero regardless of what the scoring bundle computes. Kapil needs to do a systematic field-name reconciliation between the `v7Data` mapping and the two pipeline output specs (`saltedge_dashboard_variables.py:derive_dashboard_variables` and `plaid_dashboard_variables.py:derive_dashboard_variables`), adding multi-provider fallback lookups where the two pipelines use different key names for the same concept. All three bugs should be fixed and the full verification re-run before requesting a second review.
