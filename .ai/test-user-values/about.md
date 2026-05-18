# Test User Dashboard Values

Fixes dashboard panels showing "Limited Data", "Insufficient data", and "Connect accounts to analyse" for test applicants seeded via `scripts/applicants-prod.sh`.

## Root Cause

Test applicants are submitted with `connected_accounts.income_history` (monthly breakdown, average annual income, account balances) but have no real Plaid / SaltEdge bank data snapshots. The credit score pipeline required at least one succeeded snapshot to compute `transactions_avg_monthly_income`, `income_stability_mom_median`, and related dashboard variables, so the `/credit-score` endpoint returned `{status: "pending"}` and the frontend showed empty panels.

## Fix

Two new functions in `backend/src/usecase/credit_scoring_service.py`:

1. **`_enrich_from_income_history(dashboard_vars, scorecard_vars, application)`** — called after every bundle run to fill in any remaining null transaction/stability fields from `connected_accounts.income_history`. Handles the hybrid case where a real bank pull happened but transactions were empty.

2. **`_compute_income_history_score(...)`** — called when there are zero succeeded snapshots but `connected_accounts.income_history` is present. Uses `score_housing_application` (Vertex AI runtime scorer) for band/score, synthesises `dashboard_vars` and `scorecard_vars` from the income_history data, and persists a `CreditScore` row with a deterministic SHA-256 fingerprint of the income_history blob.

**`get_or_compute_score`** updated to try the income_history fallback before raising `ScoreNotReady`.

## Fields populated

| Field | Source |
|-------|--------|
| `transactions_avg_monthly_income` | `average_annual_income / 12` |
| `transactions_avg_net_cashflow` | same |
| `transactions_avg_monthly_net_cashflow` | same |
| `transactions_12m_income` | last 12 entries from `monthly_breakdown` |
| `income_stability_mom_median` | median abs MoM % change from `monthly_breakdown` |
| `accounts_liquid_balance` | sum of `connected_accounts.personal[].current_balance` |
| `accounts_investment_balance` | sum of `connected_accounts.investments[].current_balance` |
