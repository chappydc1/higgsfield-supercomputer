# Implementation Plan: Fix Three Dashboard Bugs

## Task

Fix three bugs in the dashboard page: wrong customerId source (Bug 1), missing
adapter payloads in transactions endpoint (Bug 2), and wrong field names in
v7Data useMemo (Bug 3).

## Approach

Apply targeted fixes to two files. No new files, no new endpoints, no merge
needed — all required code already exists on the branch.

## Files to Modify

- `backend/src/interface/http_endpoints.py`
- `frontend/app/dashboard/page.tsx`

---

## Implementation Steps

### Phase 1: Backend fix (Bug 2)

**Step 1**: In `backend/src/interface/http_endpoints.py`, inside
`get_application_transactions` (function starts at line 2610), add two adapter
keys to the return dict.

**Confirmed current return dict location: lines 2648–2654.**

File read confirms the exact block:

```python
  return {
    "applicant_id": application_id,
    "start_date": start_date,
    "end_date": end_date,
    "transactions": combined,
    "total": len(combined),
  }
```

Both adapter functions are already imported in `http_endpoints.py` (lines
116–119):
- `adapt_open_banking_dashboard_loan_variables` from `src.ml.dashboard_adapters`
- `build_dashboard_snapshot_adapter` from `src.ml.dashboard_snapshot_adapter`

**Replace lines 2648–2654** with:

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

Net change: 2 lines added inside the existing dict. No other modifications to
`http_endpoints.py`.

---

### Phase 2: Frontend fixes (Bugs 1 and 3)

**Step 2**: In `frontend/app/dashboard/page.tsx`, replace the `customerId`
useMemo.

**Confirmed current block: lines 1588–1595.**

File read confirms:

```ts
const customerId = useMemo(() => {
  const rawId = application?.id
  if (rawId === undefined || rawId === null) {
    return null
  }

  return typeof rawId === "string" ? rawId : String(rawId)
}, [application?.id])
```

**Replace lines 1588–1595** with:

```ts
const customerId = useMemo(() => {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem("dw_application_saltedge_customer_id")
  return stored ?? null
}, [])
```

Key change: dependency array goes from `[application?.id]` to `[]`. The value
is read from `localStorage` where it was written during the SaltEdge connect
flow by `frontend/app/application/connect-accounts/pageSalt.tsx` (line 828).
If the user has not completed a SaltEdge link, `localStorage.getItem` returns
`null`, and the existing early-return at line 1743 (`if (!backendApiUrl ||
!customerId)`) gracefully skips the connections fetch.

---

**Step 3**: In `frontend/app/dashboard/page.tsx`, replace the entire `v7Data`
useMemo.

**Confirmed current block: lines 2414–2483.**

File read confirms the block opens at line 2414 (`const v7Data = useMemo(() => {`)
and closes at line 2483 (`}, [apiScore, v7Dashboard, v7Scorecard])`).

**Replace lines 2414–2483** with the following block:

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

Key field renames from the current code:

| Property | Old field read | New field read |
|---|---|---|
| `fullName` | `dash.full_name` | `dash.holder_info_full_name ?? dash.identity_full_name` |
| `phone` | `dash.phone_Number` | `dash.holder_info_phone ?? dash.identity_primary_phone` |
| `address` | `dash.current_Address` | `buildAddress("holder_info_address") ?? buildAddress("identity")` |
| `employer` | `dash.place_work` | `null` (neither pipeline emits this) |
| `bankBalance` | `dash.bank_Balance_checking_saving_accounts` | `dash.accounts_liquid_balance` |
| `securitiesValue` | `dash.assets_Securities` | `dash.accounts_investment_balance` |
| `cashFlowMonthly` | `dash.cash_flow` | `dash.transactions_avg_net_cashflow ?? dash.transactions_avg_monthly_net_cashflow` |
| `cashFlow3Years` | `dash.cash_flow` | `dash.transactions_avg_net_cashflow ?? dash.transactions_avg_monthly_net_cashflow` |
| `monthlySalary` | `dash.average_monthly_salary` | `dash.transactions_avg_monthly_income` |
| `annualIncome` | `dash.average_monthly_salary` | `dash.transactions_avg_monthly_income` |
| `totalLoanBalance` | `dash.total_loan_balance` | `dash.dashboard_total_loan_balance ?? dash.accounts_loan_balance` |
| `monthlyLoanPayment` | `dash.total_avg_monthly_loan_payment` | `dash.dashboard_total_avg_loan_payment ?? dash.total_avg_monthly_loan_payment` |
| `repaymentBurden` args | `total_avg_monthly_loan_payment`, `average_monthly_salary` | `dashboard_total_avg_loan_payment ?? total_avg_monthly_loan_payment`, `transactions_avg_monthly_income` |
| `avgMonthlyMortgage` | `dash.avg_monthly_mortgage_payment` | `dash.dashboard_avg_monthly_mortgage_pmt` |
| `avgMonthlyRent` | `dash.average_spend_rent` | last element of `dash.transactions_12m_rent` |
| `mortgageBalance` | `dash.loan_Balance_mortgage` | `dash.dashboard_total_loan_balance` |
| `mortgageRepaymentPeriod` | `dash.repayment_period_mortgage_pending` | `dash.dashboard_mortgage_loan_terms` |
| `mortgageDelinquencies` | `dash.dpd_mortgage_missed_months` | `dash.dashboard_dpd_mortgage_missed` |
| `delinquencies` arg | `dash.delays_calculate_number_of_missing_loan_payments` | `dash.dashboard_dpd_missed_months` |
| `totalContracts` arg | `dash.total_loan_accounts` | `dash.dashboard_total_loan_accounts ?? dash.total_loan_accounts` |
| `recent12Income` | `dash.list_of_recent_12_income` | `dash.transactions_12m_income` |
| `recent12Rent` | `dash.list_of_recent_12_rent` | `dash.transactions_12m_rent` |
| `recent12Mortgage` | `dash.list_of_recent_12_mortgage_payment` | `dash.transactions_12m_mortgage_pmts` |
| `housingCapacity` args | `avg_monthly_mortgage_payment`, `average_spend_rent`, `average_monthly_salary` | `dashboard_avg_monthly_mortgage_pmt`, last of `transactions_12m_rent`, `transactions_avg_monthly_income` |
| `totalAssets` args | `bank_Balance_checking_saving_accounts`, `assets_Securities` | `accounts_liquid_balance`, `accounts_investment_balance` |

---

## Validation

After making both file edits, run the following in order:

```bash
# 1. Backend unit tests — must all pass with no new failures
cd backend
python -m pytest tests/ml/test_dashboard_adapters.py tests/ml/test_dashboard_snapshot_adapter.py -v

# 2. Frontend type-check — grep for errors in dashboard/page.tsx only
cd frontend
npx tsc --noEmit 2>&1 | grep "dashboard/page.tsx" | head -20
```

If `tsc` reports type errors on `Record<string, unknown>` property access, wrap
each new field access in a `typeof x === "string"` guard (already used for
`score.band` and `dash.holder_info_full_name` in the replacement block) or cast
as `(dash.holder_info_full_name as string | undefined)`.

---

## Status

Phases: 2

- [x] Phase 1: Backend fix (Bug 2)
- [x] Phase 2: Frontend fixes (Bugs 1 and 3)
- [ ] Validation
- [ ] Code review

Assessed: yes
