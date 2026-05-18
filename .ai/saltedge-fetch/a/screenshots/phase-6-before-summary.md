# Phase 6 Browser Verification — `before` State

The fix's user-visible verification requires deployment (the changes live on `fix/saltedge-fetch`, not yet on `main` / Cloud Run). Below is the live "before" state captured from production.

The user's original prompt screenshots already document this; reproduced here from the live operator-side dashboard.

## Captured live from `https://ehousing.joinlita.com/dashboard?id=28` on 2026-05-08

### Summary tiles (current production state)
- **Risk Analysis:** Credit risk = "Poor", Income stability = "Limited Data", Housing payment capacity = "Insufficient data", AI Risk Analysis = 586/850.
- **Customer Information:** Full name "tobias", phone +46 73 689 18 22, address "SE", DOB N/A, gender "Not declared", residence card "Not on file", spouse "Not declared".
- **Outstanding Debt Status:** Total Outstanding Debt = "Data pending", Monthly Repayment Amount = "—", Repayment Burden Ratio = "—".
- **Breakdown of Total Debt:** Credit Cards & Installments SEK 0 (0 accounts), Secured / Guaranteed Loans SEK 0 (0 accounts), Unsecured Loans SEK 0 (0 accounts), Others SEK 0 (0 accounts).
- **Total Number of Contracts:** 0 contracts (0 ongoing). Most Recent Contract: —. Average Contract Duration: —.
- **Number of Delinquencies:** None (Past 24 months).
- **Number of Defaults / Negative Records:** None (Past 5 years).
- **Total Assets:** "No connected assets".
- **Average Cash Flow (3 Years):** SEK 0.
- **Bank Balance:** "Balance data unavailable".
- **Employment Information:** "Employee in SE".
- **Monthly Housing Expenses, Annual Housing Expenses, Housing Delinquencies:** "Not enough data".
- **Housing Expense History (Past 24 Months):** all zero across June 2024 – May 2026.

## API state (live production)

```bash
GET /api/v1/applications/28/credit-score   →   200 OK
{
  "application_id": 28,
  "score": 586,
  "band": "Poor",
  "dashboard": {
    "full_name": "Tobias Andersen",            ← from applications.full_name (postgres)
    "total_loan_balance": null,                ← no bank_data_snapshots rows
    "total_loan_accounts": 0,                  ← no bank_data_snapshots rows
    "average_monthly_salary": null,
    "monthly_average_payment_towards_loan": null,
    ...                                        (63 keys total, all loan/identity-related)
  },
  "dashboard": <NO transactions_*, accounts_*, holder_info_* KEYS>,
  "scorecard": { dti_ratio, cash_flow_to_income_ratio, missed_payment_rate, ... }
}
```

The credit-score endpoint returns a valid HTTP 200 response, but it omits the v7Dashboard pipeline keys (`accounts_liquid_balance`, `transactions_avg_net_cashflow`, `transactions_total_outstanding_debt`, `holder_info_full_name`, etc.) that `frontend/app/dashboard/page.tsx`'s `v7Data` useMemo reads. Without these keys, the four dashboard tiles render their fallback copy.

### localStorage on operator browser
- `dw_application_saltedge_customer_id` = `null` (operator never went through bank-connect; expected).

## Why the credit-score endpoint omits the v7 keys

`get_or_compute_score` (`backend/src/usecase/credit_scoring_service.py:91-107`) calls `_list_succeeded_snapshots(application_id=28)`. With zero snapshots, the v7 pipeline (`saltedge_to_dataframes.build_dataframes`) returns empty DataFrames; `expert_scorecard.score` substitutes nulls for every feature. The legacy adapter still emits a 63-key payload because it's keyed on the score-vector defaults, but the v7Dashboard adapter emits no keys at all.

This refines Phase 1's hypothesis: the dashboard renders fallback text not because credit-score returns 202, but because it returns 200 with the v7 pipeline keys absent.

The fix's mechanism remains the same: post-connect SaltEdge pull → populate `bank_data_snapshots` → v7 pipeline runs → `dashboard.accounts_liquid_balance` etc. are emitted → frontend renders KPIs.

## Post-deploy verification (after this PR merges and Cloud Build redeploys)

For application 28, an operator should:

```bash
# 1) Trigger a re-pull (the new post-connect hook fires from sync too).
#    Replace <customer_id> with the saltedge customer_id stored in
#    open_banking_consents for application 28.
curl -X POST "$API/api/saltedge/customer/<customer_id>/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_reference": "<applicant email>",
    "categorization": "personal",
    "application_id": 28
  }'

# 2) Wait ~60 seconds for the daemon thread to finish.

# 3) Confirm via the credit-score endpoint:
curl "$API/api/v1/applications/28/credit-score" | jq '
  {
    score,
    has_bank_balance: (.dashboard.accounts_liquid_balance != null),
    has_cashflow:     (.dashboard.transactions_avg_net_cashflow != null),
    has_holder_info:  (.dashboard.holder_info_full_name != null)
  }
'
# Expected: all three booleans true.

# 4) Open https://ehousing.joinlita.com/dashboard?id=28 and verify:
#    - "Bank Balance" tile shows a non-zero SEK number (or 0 if account legitimately empty).
#    - "Average Cash Flow (3 Years)" shows a non-zero SEK number.
#    - "Total Number of Contracts" shows the number of ongoing loans (>= 0).
#    - "Outstanding Debt & Repayment" shows real "Total Outstanding Debt" (not "Data pending").
```

## Cloud Logs to watch

After deploy, the new log lines confirm the pipeline is firing:
- `[saltedge.post-connect] kick application_id=28 trigger=sync`
- `[saltedge.pull] entry application_id=28 country=SE email=…`
- `[saltedge.pull] live-by-application application_id=28 count=N`  (N >= 1)
- `[canonical.saltedge] applicant=app-00000028 application_id=28 connection=… txns=N persisted`

If the SALTEDGE_* secrets are missing in Cloud Run, the pipeline silently skips at:
- `[saltedge.pull] skip: SaltEdge not configured application_id=28 err=…`

That's the BLOCKER from Phase 2's deploy gate — confirm Secret Manager binding before flipping over.

## Frontend lint / build status (this branch)

- `tsc --noEmit -p frontend/tsconfig.json` — 0 errors in modified files (`frontend/app/dashboard/page.tsx`, `frontend/app/application/connect-accounts/pageSalt.tsx`).
- ESLint + Prettier ran via pre-commit hook on every commit during Phase 4b — passed.
- The frontend dev server was NOT started locally; the changes are limited to (a) reading a URL search param and (b) spreading a property into a fetch body. These are mechanically simple and do not warrant an HMR loop check.

## Conclusion

- Live "before" state matches the user's original symptom screenshots exactly.
- The diagnosis from Phase 1 holds (with the refinement that credit-score returns 200 + empty v7 keys, not 202 pending).
- Post-deploy verification is documented above.
