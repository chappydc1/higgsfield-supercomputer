# Implementation Context: Merge kapil-potgres, Fix 3 Bugs, Verify, PR

This document is self-contained. Read it top to bottom before writing a single
line of code.

---

## Repository

- **Root**: `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/epic-einstein-553ad4/`
- **Backend**: `backend/` — FastAPI, Python, SQLAlchemy, pytest
- **Frontend**: `frontend/` — Next.js 14, TypeScript, npm
- **Working branch**: `claude/epic-einstein-553ad4`
- **Target PR base**: `main`

---

## Task Description

1. Determine whether a `git merge origin/kapil-potgres` is safe or whether the
   working branch already has everything (it largely does — see Merge Strategy).
2. Fix the three confirmed critical bugs in the working branch (details below).
3. Verify the fixes visually using the Claude Preview server (screenshots of the
   `/dashboard` page showing populated data).
4. Create a PR from `claude/epic-einstein-553ad4` into `main`.

---

## Merge Strategy

### Branch topology

```
git merge-base HEAD origin/kapil-potgres
→ 62072f24c7f4cf970cdcecab51789ece905297f6
```

The working branch and `kapil-potgres` diverged from commit `62072f2` (a merge
commit that brought main into kapil-potgres). Since then:

- `kapil-potgres` has ~97 commits ahead of the working branch (many of them
  infra/cleanup commits with messages like "wwwwww").
- The working branch has ~20 commits that `kapil-potgres` does not (PRs #86
  through #112, the `.ai/` audit work, and various fixes merged from main).

### What kapil-potgres has that the working branch does NOT

Run this to check:
```bash
git diff HEAD...origin/kapil-potgres --stat | grep "^[^-]" | grep -v "\.claude\|\.agents\|\.codex\|REVIEW"
```

After cross-referencing, ALL of the important new files from `kapil-potgres` are
already present on the working branch:

| File | Status on working branch |
|------|--------------------------|
| `backend/src/ml/dashboard_adapters.py` | EXISTS |
| `backend/src/ml/dashboard_snapshot_adapter.py` | EXISTS |
| `backend/src/ml/scoring/saltedge_bundle/` | EXISTS |
| `backend/src/ml/scoring/plaid_bundle/` | EXISTS |
| `backend/src/interface/saltedge_endpoints.py` | EXISTS |
| `backend/src/infra/mysql/saltedge_consent_repository.py` | EXISTS |
| `backend/migrations/006_open_banking_saltedge.sql` | EXISTS |
| `backend/src/domain/bank_data_snapshot.py` | EXISTS |
| `backend/src/usecase/bank_data_pull.py` | EXISTS |
| `backend/src/usecase/credit_scoring_service.py` | EXISTS |
| `backend/src/infra/mysql/bank_data_snapshot_repository.py` | EXISTS |
| `backend/src/infra/mysql/credit_score_repository.py` | EXISTS |

### Recommendation: DO NOT merge origin/kapil-potgres

A `git merge origin/kapil-potgres` would import 97 commits of messy history
(including "wwwwwww" commit messages, deleted files the working branch has
re-added, and tooling files the working branch intentionally removed). The working
branch already contains every meaningful new file. **Apply only the three bug
fixes as new commits on the working branch.**

If a specific file is missing or differs from `kapil-potgres`, cherry-pick the
file using:
```bash
git show origin/kapil-potgres:path/to/file > path/to/file
```

---

## The Three Bugs — Exact Fix Instructions

### Bug 2 (Fix first — simplest, backend-only)

**File**: `backend/src/interface/http_endpoints.py`
**Function**: `get_application_transactions` — starts at line 2610
**Current return statement** (lines 2648–2654):

```python
  return {
    "applicant_id": application_id,
    "start_date": start_date,
    "end_date": end_date,
    "transactions": combined,
    "total": len(combined),
  }
```

**Fix**: Add two adapter keys. Both functions are already imported at lines
116–119:

```python
from src.ml.dashboard_adapters import (
  adapt_open_banking_dashboard_loan_variables,
)
from src.ml.dashboard_snapshot_adapter import build_dashboard_snapshot_adapter
```

Replace the return dict with:

```python
  return {
    "applicant_id": application_id,
    "start_date": start_date,
    "end_date": end_date,
    "transactions": combined,
    "total": len(combined),
    "dashboard_loan_adapter": adapt_open_banking_dashboard_loan_variables(combined),
    "dashboard_snapshot_adapter": build_dashboard_snapshot_adapter(
      application=None, transactions=combined
    ),
  }
```

That is a 2-line addition inside the existing return dict. No other changes to
`http_endpoints.py`.

---

### Bug 1 (Frontend — customerId wrong source)

**File**: `frontend/app/dashboard/page.tsx`
**Current code** (lines 1588–1595):

```ts
const customerId = useMemo(() => {
  const rawId = application?.id
  if (rawId === undefined || rawId === null) {
    return null
  }

  return typeof rawId === "string" ? rawId : String(rawId)
}, [application?.id])
```

**Root cause**: `application.id` is the Postgres integer primary key (e.g. `42`).
SaltEdge customer IDs are provider-assigned strings (e.g. `"SE-1234abc"`) stored in
`open_banking_consents.saltedge_customer_id`. The real customer ID is written to
`localStorage` under the key `"dw_application_saltedge_customer_id"` by
`frontend/app/application/connect-accounts/pageSalt.tsx` (line 828) after a
successful SaltEdge link.

**Fix**: Replace the memo so it reads from localStorage first, falling back to
`null` (which causes the connections fetch to be skipped gracefully):

```ts
const customerId = useMemo(() => {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem("dw_application_saltedge_customer_id")
  return stored ?? null
}, [])
```

Note: the dependency array changes from `[application?.id]` to `[]`. This is safe
because the value is written to localStorage once during the SaltEdge connect flow,
before the user navigates to the dashboard. If the user has not completed a SaltEdge
link, `localStorage.getItem(...)` returns `null` and the connections fetch is skipped
(the existing early-return at line 1743 handles this: `if (!backendApiUrl || !customerId)`).

No new backend endpoint is required for this fix. The existing
`GET /api/saltedge/customer/{customer_id}/connections` endpoint at line 815 of
`saltedge_endpoints.py` already queries by the SaltEdge string customer ID via
`repo.list_live_by_customer(customer_id)`.

No new Next.js proxy route is required. The existing proxy at
`frontend/app/api/saltedge/_proxy.ts` already forwards all `/api/saltedge/...`
requests to the backend.

---

### Bug 3 (Frontend — v7Data field name mismatches)

**File**: `frontend/app/dashboard/page.tsx`
**Current block** (lines 2414–2483, the `v7Data` useMemo):

The `v7Data` useMemo reads field names from `apiScore.dashboard` (the flat dict
returned by the credit-score endpoint's `dashboard_vars` key). The actual keys
emitted by the two pipelines are:

#### Identity fields

| Frontend reads | SaltEdge emits | Plaid emits |
|---|---|---|
| `dash.full_name` | `holder_info_full_name` | `identity_full_name` |
| `dash.phone_Number` | `holder_info_phone` | `identity_primary_phone` |
| `dash.current_Address` | `holder_info_address_street` (+ `_city`, `_region`, `_postal_code`) | `identity_street` (+ `identity_city`, `identity_region`) |
| `dash.place_work` | not emitted by either pipeline | not emitted |

#### Financial / KPI fields

| Frontend reads | SaltEdge emits | Plaid emits |
|---|---|---|
| `dash.bank_Balance_checking_saving_accounts` | `accounts_liquid_balance` | `accounts_liquid_balance` |
| `dash.assets_Securities` | `accounts_investment_balance` | `accounts_investment_balance` |
| `dash.cash_flow` | `transactions_avg_net_cashflow` | `transactions_avg_monthly_net_cashflow` |
| `dash.average_monthly_salary` | `transactions_avg_monthly_income` | `transactions_avg_monthly_income` |
| `dash.average_spend_rent` | `transactions_12m_rent` (list, not scalar) | not directly emitted as scalar |
| `dash.avg_monthly_mortgage_payment` | not emitted directly | `dashboard_avg_monthly_mortgage_pmt` |
| `dash.loan_Balance_mortgage` | not emitted | not emitted (use `dashboard_total_loan_balance`) |
| `dash.repayment_period_mortgage_pending` | not emitted | `dashboard_mortgage_loan_terms` |
| `dash.dpd_mortgage_missed_months` | not emitted | `dashboard_dpd_mortgage_missed` |
| `dash.delays_calculate_number_of_missing_loan_payments` | not emitted | `dashboard_dpd_missed_months` |
| `dash.total_loan_balance` | not emitted (SaltEdge has no canonical total) | `dashboard_total_loan_balance` |
| `dash.total_avg_monthly_loan_payment` | not emitted | `dashboard_total_avg_loan_payment` |

#### Fields that DO match both pipelines (keep these unchanged)

| Frontend reads | SaltEdge emits | Plaid emits |
|---|---|---|
| `dash.balance_of_credit_card_overdraft` | `balance_of_credit_card_overdraft` | `balance_of_credit_card_overdraft` |
| `dash.no_of_credit_card_overdraft` | `no_of_credit_card_overdraft` | `no_of_credit_card_overdraft` |
| `dash.value_of_secured_loan` | `value_of_secured_loan` | `value_of_secured_loan` |
| `dash.no_of_secured_loan` | `no_of_secured_loan` | `no_of_secured_loan` |
| `dash.value_of_unsecured_loan` | `value_of_unsecured_loan` | `value_of_unsecured_loan` |
| `dash.no_of_unsecured_loan` | `no_of_unsecured_loan` | `no_of_unsecured_loan` |
| `dash.value_of_other_loans` | `value_of_other_loans` | `value_of_other_loans` |
| `dash.no_of_other_loans` | `no_of_other_loans` | `no_of_other_loans` |
| `dash.total_loan_accounts` | not emitted | `dashboard_total_loan_accounts` |

Note: `total_loan_accounts` only exists in Plaid as `dashboard_total_loan_accounts`.
The frontend should use `dash.dashboard_total_loan_accounts ?? dash.total_loan_accounts`.

#### 12-month series fields

| Frontend reads | SaltEdge emits | Plaid emits |
|---|---|---|
| `dash.list_of_recent_12_income` | `transactions_12m_income` | not emitted |
| `dash.list_of_recent_12_rent` | `transactions_12m_rent` | not emitted |
| `dash.list_of_recent_12_mortgage_payment` | `transactions_12m_mortgage_pmts` | not emitted |

#### Replacement v7Data useMemo block

Replace the entire `v7Data` useMemo (lines 2414–2483) with the following:

```ts
const v7Data = useMemo(() => {
  const dash = v7Dashboard
  const score = v7Scorecard

  // Helper: construct a human-readable address string from prefixed fields
  const buildAddress = (prefix: "holder_info_address" | "identity"): string | null => {
    if (prefix === "holder_info_address") {
      const parts = [
        dash.holder_info_address_street,
        dash.holder_info_address_city,
        dash.holder_info_address_region,
        dash.holder_info_address_postal_code,
      ].filter((p): p is string => typeof p === "string" && p.length > 0)
      return parts.length > 0 ? parts.join(", ") : null
    }
    const parts = [
      dash.identity_street,
      dash.identity_city,
      dash.identity_region,
    ].filter((p): p is string => typeof p === "string" && p.length > 0)
    return parts.length > 0 ? parts.join(", ") : null
  }

  return {
    // Identity — SaltEdge uses holder_info_* prefix; Plaid uses identity_* prefix
    fullName:
      typeof dash.holder_info_full_name === "string" ? dash.holder_info_full_name
      : typeof dash.identity_full_name === "string" ? dash.identity_full_name
      : null,
    phone:
      typeof dash.holder_info_phone === "string" ? dash.holder_info_phone
      : typeof dash.identity_primary_phone === "string" ? dash.identity_primary_phone
      : null,
    address:
      buildAddress("holder_info_address") ?? buildAddress("identity"),
    employer: null, // neither pipeline emits employer/place_work
    // Risk labels
    riskLabel: mapBandToRiskLabel(typeof score.band === "string" ? score.band : null),
    stabilityLabel: mapStabilityToLabel(score.income_stability_mom_median),
    housingCapacity: mapHousingCapacityLabel(
      // SaltEdge: dashboard_avg_monthly_mortgage_pmt not emitted; use transactions_avg_monthly_income proxy
      // Plaid: dashboard_avg_monthly_mortgage_pmt is canonical
      dash.dashboard_avg_monthly_mortgage_pmt,
      // average_spend_rent: SaltEdge has transactions_12m_rent (list); use avg of last element
      Array.isArray(dash.transactions_12m_rent)
        ? (dash.transactions_12m_rent as number[]).slice(-1)[0] ?? null
        : null,
      // average_monthly_salary: both pipelines emit transactions_avg_monthly_income
      dash.transactions_avg_monthly_income,
    ),
    // Outstanding debt — Plaid uses dashboard_* canonical keys; SaltEdge uses liabilities keys (if any)
    totalLoanBalance: toNumber(
      dash.dashboard_total_loan_balance ?? dash.accounts_loan_balance
    ),
    monthlyLoanPayment: toNumber(
      dash.dashboard_total_avg_loan_payment ?? dash.total_avg_monthly_loan_payment
    ),
    repaymentBurden: computeRepaymentBurden(
      dash.dashboard_total_avg_loan_payment ?? dash.total_avg_monthly_loan_payment,
      dash.transactions_avg_monthly_income,
    ),
    // Donut breakdown — these keys match in both pipelines
    ccBalance: toNumber(dash.balance_of_credit_card_overdraft),
    ccCount: toNumber(dash.no_of_credit_card_overdraft),
    securedBalance: toNumber(dash.value_of_secured_loan),
    securedCount: toNumber(dash.no_of_secured_loan),
    unsecuredBalance: toNumber(dash.value_of_unsecured_loan),
    unsecuredCount: toNumber(dash.no_of_unsecured_loan),
    othersBalance: toNumber(dash.value_of_other_loans),
    othersCount: toNumber(dash.no_of_other_loans),
    // KPI tiles
    totalContracts: computeTotalContracts(
      dash.dashboard_total_loan_accounts ?? dash.total_loan_accounts,
      dash.no_of_credit_card_overdraft,
    ),
    delinquencies: formatDelinquenciesCount(
      // Plaid: dashboard_dpd_missed_months; SaltEdge: not emitted (returns 0)
      dash.dashboard_dpd_missed_months,
      24,
    ),
    defaults: formatDefaultsCount(score["missed-payment_flag"]),
    // Ability to repay
    bankBalance: toNumber(dash.accounts_liquid_balance),
    securitiesValue: toNumber(dash.accounts_investment_balance),
    totalAssets: computeTotalAssets(
      dash.accounts_liquid_balance,
      dash.accounts_investment_balance,
    ),
    cashFlowMonthly: toNumber(
      dash.transactions_avg_net_cashflow ?? dash.transactions_avg_monthly_net_cashflow
    ),
    cashFlow3Years: computeAverageCashFlow3Years(
      dash.transactions_avg_net_cashflow ?? dash.transactions_avg_monthly_net_cashflow
    ),
    monthlySalary: toNumber(dash.transactions_avg_monthly_income),
    annualIncome: computeAnnualIncome(dash.transactions_avg_monthly_income),
    // Mortgage — Plaid emits dashboard_* keys; SaltEdge does not emit mortgage-specific keys
    mortgageBalance: toNumber(dash.dashboard_total_loan_balance),
    mortgageRepaymentPeriod: dash.dashboard_mortgage_loan_terms ?? null,
    mortgageDelinquencies: toNumber(dash.dashboard_dpd_mortgage_missed),
    otherLoansCount: toNumber(dash.no_of_other_loans),
    // Housing
    avgMonthlyMortgage: toNumber(dash.dashboard_avg_monthly_mortgage_pmt),
    avgMonthlyRent: Array.isArray(dash.transactions_12m_rent)
      ? toNumber((dash.transactions_12m_rent as number[]).slice(-1)[0])
      : null,
    // Recent 12-month series (SaltEdge emits these; Plaid does not)
    recent12Income: Array.isArray(dash.transactions_12m_income) ? (dash.transactions_12m_income as number[]) : [],
    recent12Rent: Array.isArray(dash.transactions_12m_rent) ? (dash.transactions_12m_rent as number[]) : [],
    recent12Mortgage: Array.isArray(dash.transactions_12m_mortgage_pmts) ? (dash.transactions_12m_mortgage_pmts as number[]) : [],
    // Audit
    isAvailable: apiScore !== null,
  }
}, [apiScore, v7Dashboard, v7Scorecard])
```

Key changes from the current code:
- `fullName`: `dash.full_name` → `dash.holder_info_full_name ?? dash.identity_full_name`
- `phone`: `dash.phone_Number` → `dash.holder_info_phone ?? dash.identity_primary_phone`
- `address`: `dash.current_Address` → constructed from `holder_info_address_*` or `identity_*` parts
- `employer`: always `null` (no pipeline emits this; keep null rather than undefined)
- `bankBalance`: `dash.bank_Balance_checking_saving_accounts` → `dash.accounts_liquid_balance`
- `securitiesValue`: `dash.assets_Securities` → `dash.accounts_investment_balance`
- `cashFlowMonthly`: `dash.cash_flow` → `dash.transactions_avg_net_cashflow ?? dash.transactions_avg_monthly_net_cashflow`
- `monthlySalary`: `dash.average_monthly_salary` → `dash.transactions_avg_monthly_income`
- `totalLoanBalance`: `dash.total_loan_balance` → `dash.dashboard_total_loan_balance ?? dash.accounts_loan_balance`
- `monthlyLoanPayment`: `dash.total_avg_monthly_loan_payment` → `dash.dashboard_total_avg_loan_payment ?? dash.total_avg_monthly_loan_payment`
- `avgMonthlyMortgage`: `dash.avg_monthly_mortgage_payment` → `dash.dashboard_avg_monthly_mortgage_pmt`
- `avgMonthlyRent`: `dash.average_spend_rent` → last element of `dash.transactions_12m_rent`
- `mortgageBalance`: `dash.loan_Balance_mortgage` → `dash.dashboard_total_loan_balance`
- `mortgageRepaymentPeriod`: `dash.repayment_period_mortgage_pending` → `dash.dashboard_mortgage_loan_terms`
- `mortgageDelinquencies`: `dash.dpd_mortgage_missed_months` → `dash.dashboard_dpd_mortgage_missed`
- `delinquencies`: `dash.delays_calculate_number_of_missing_loan_payments` → `dash.dashboard_dpd_missed_months`
- `totalContracts`: `dash.total_loan_accounts` → `dash.dashboard_total_loan_accounts ?? dash.total_loan_accounts`
- `recent12Income`: `dash.list_of_recent_12_income` → `dash.transactions_12m_income`
- `recent12Rent`: `dash.list_of_recent_12_rent` → `dash.transactions_12m_rent`
- `recent12Mortgage`: `dash.list_of_recent_12_mortgage_payment` → `dash.transactions_12m_mortgage_pmts`
- `housingCapacity` arguments: update all three parameter keys to match pipeline outputs

---

## Files to Modify (summary)

| File | Change |
|------|--------|
| `backend/src/interface/http_endpoints.py` | Add 2 lines to `get_application_transactions` return dict (Bug 2) |
| `frontend/app/dashboard/page.tsx` | Replace `customerId` memo (Bug 1); replace entire `v7Data` useMemo (Bug 3) |

No new files need to be created. No new proxy routes are needed. No new backend
endpoints are needed.

---

## No New Files from kapil-potgres Are Needed

The working branch already has all the files that `kapil-potgres` introduced. Do
not run `git merge origin/kapil-potgres`. All three bug fixes are applied as new
commits on `claude/epic-einstein-553ad4`.

---

## Backend Startup (local testing)

The backend defaults to SQLite when `DATABASE_URL` is not set or when `APP_ENV`
is not `prod`/`staging`. To run locally:

```bash
cd backend
# Option A: use sqlite (no credentials needed)
DATABASE_URL=sqlite:///./app.db APP_ENV=local uvicorn src.main:app --reload --port 8000

# Option B: use the dev env example
cp .env.development.example .env
# Edit .env: uncomment DATABASE_URL=sqlite:///./app.db, set APP_ENV=local
uvicorn src.main:app --reload --port 8000
```

The backend will auto-create all tables on first startup (SQLAlchemy metadata
creates them via `Base.metadata.create_all`). Run migrations manually if needed:

```bash
python migrations/run_migration.py --db-url sqlite:///./app.db
```

To enable dev auth bypass (skip JWT in the browser):
```bash
DEV_AUTH_BYPASS=true APP_ENV=local uvicorn src.main:app --reload --port 8000
```

With `DEV_AUTH_BYPASS=true`, any request carrying the header `X-Bypass-Auth: true`
is treated as the `dev@localhost` admin user.

---

## Auth: Getting a JWT Token

### Register and obtain a token (localhost)

```bash
# 1. Register a user (one-time)
curl -s -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"AdminPass!234"}'

# 2. Get a token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/token \
  -F "username=admin@example.com" \
  -F "password=AdminPass!234" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo $TOKEN
```

### Use the token

Set `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000` in `frontend/.env.local`
so the dashboard points at the local backend. The Next.js frontend manages Auth0
sessions; for local testing with `DEV_AUTH_BYPASS=true` on the backend, the
frontend still needs to be logged in via Auth0 (or you can use the `/api/auth/token`
endpoint directly from a test script and pass the token via the Authorization header
in browser DevTools network overrides).

Alternatively, run the seed script to push test applicants:

```bash
cd scripts
python push_dashboard_test_account.py \
  --url http://localhost:8000/api/v1/applications \
  --countries Japan US --count 5
```

This creates applicants without Auth (the applications creation endpoint uses
`get_current_user_optional_lenient`).

---

## Preview Server

The Claude Preview server with ID `aa37b549-fad6-4b77-84d0-1d5eec01e78f` is
available for screenshots. It runs the frontend dev server on port 3000. Use the
`mcp__Claude_Preview__preview_screenshot` tool with that server ID to capture
screenshots after making changes.

To verify the fix is live:

1. Rebuild or hot-reload the frontend (Next.js dev server auto-reloads on file
   save; if running a preview build, restart it).
2. Navigate to `/dashboard?id={applicantId}` where `{applicantId}` is the numeric
   DB id of a test applicant that has a credit score computed.
3. If the backend is not running locally, the score tiles will show placeholder
   values — that is expected. The important thing is that the `v7Data` fields are
   mapped to the correct keys so that when a score IS available, the data populates.

---

## What the Dashboard Should Show After the Fix

For a test applicant (e.g. Haruto Sato, Japan locale) with a successfully computed
credit score:

| Section | Before fix | After fix |
|---------|-----------|-----------|
| Full name tile | null (dash.full_name not emitted) | populated from `holder_info_full_name` (SaltEdge) or `identity_full_name` (Plaid) |
| Phone number | null (dash.phone_Number wrong case) | populated from `holder_info_phone` / `identity_primary_phone` |
| Address | null (dash.current_Address not emitted) | populated from `holder_info_address_*` parts joined |
| Employer | null | null (neither pipeline emits employer — this is expected) |
| Bank balance tile | 0 (dash.bank_Balance_checking_saving_accounts not emitted) | `accounts_liquid_balance` value |
| Securities / assets | 0 | `accounts_investment_balance` value |
| Cash flow monthly | 0 | `transactions_avg_net_cashflow` value |
| Monthly salary | 0 | `transactions_avg_monthly_income` value |
| Loan analysis donut | empty (Bug 2: no adapter data) | populated with CC, secured, unsecured, other breakdown |
| Loan balance total | 0 | `dashboard_total_loan_balance` (Plaid) or `accounts_loan_balance` (SaltEdge) |
| Monthly loan payment | 0 | `dashboard_total_avg_loan_payment` (Plaid) |
| Mortgage balance | 0 | `dashboard_total_loan_balance` |
| Delinquencies | "0 payments" | `dashboard_dpd_missed_months` (Plaid) |
| SaltEdge connections | 404 error, empty (Bug 1) | populated from `localStorage` customer ID → real connections |
| Income/rent 12m chart | empty arrays | `transactions_12m_income` / `transactions_12m_rent` series (SaltEdge) |

Note: the seeded test applicants created by `push_dashboard_test_account.py` do
NOT have SaltEdge or Plaid bank data snapshots — they use only the `connected_accounts`
metadata blob. The adapter and scoring pipeline only runs if a real bank link has
been completed via the connect-accounts flow. For visual verification of Bug 2 and
Bug 3 fixes, you need a test applicant who has completed a bank link and has a
`bank_data_snapshots` row with `status=succeeded` and a credit score computed.

For screenshot verification of the fix, the primary goal is to confirm that:
1. No console errors reference `undefined` for the adapter keys.
2. The network call to `/api/saltedge/customer/{id}/connections` uses a real string
   customer ID (not an integer cast to string), or shows "no connections" gracefully
   when no SaltEdge link has been completed.
3. The `v7Data` object in React DevTools shows the correct key names mapping to
   their pipeline output values (inspect via the `__REACT_DEVTOOLS_GLOBAL_HOOK__`
   or browser DevTools component tree).

---

## PR Requirements

- Base: `main`
- Title: `fix: populate dashboard pipeline fields and SaltEdge customer ID`
- Include in PR description:
  - Summary of the 3 bugs fixed
  - Reference to `.ai/dashboard-verify/a/summary.md` as the audit source
  - Screenshot(s) showing the dashboard with data populated after the fix
  - Note that ML unit tests (101 tests) pass unchanged

---

## Validation Steps After Making Changes

```bash
# Backend: run adapter unit tests
cd backend
python -m pytest tests/ml/test_dashboard_adapters.py tests/ml/test_dashboard_snapshot_adapter.py -v

# Frontend: type-check
cd frontend
npx tsc --noEmit 2>&1 | grep "dashboard/page.tsx"

# Broad frontend build check
npm run build 2>&1 | tail -20
```

If `tsc` reports errors in `dashboard/page.tsx` after the v7Data fix, most likely
cause is accessing a property that TypeScript doesn't know about on
`Record<string, unknown>`. The pattern `dash.holder_info_full_name` will resolve to
`unknown`; the `typeof dash.holder_info_full_name === "string"` guard is already
used in the original code for `dash.full_name`. Apply the same `typeof x === "string"`
pattern for the new field names or cast: `(dash.holder_info_full_name as string | undefined)`.
