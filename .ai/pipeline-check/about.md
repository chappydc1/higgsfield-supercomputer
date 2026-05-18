# Pipeline Check — Project Overview

Verification that the Source_Json_Plaid, Source_Json_Salt_Edge, and v7 expert-scorecard
pipeline is correctly implemented in the backend and renders correctly in the dashboard.

## What Was Verified

### Backend Pipeline (all tests pass)

| Test suite | Tests | Result |
|---|---|---|
| `tests/ml/` — adapters, dashboard, scorecard, variable derivation | 101 | ✅ all pass |
| `tests/services/` + `tests/usecase/` — scoring service, provider adapters, normalization | 137 | ✅ all pass |
| `tests/interface/test_plaid_asset_report_dashboard_normalisers.py` | 5 | ✅ all pass |
| `tests/interface/test_open_banking_endpoints.py` | 3 | ✅ all pass |
| `tests/interface/test_application_endpoint.py` (plaid/credit/dashboard keys) | 2 | ✅ all pass |

### SaltEdge Pipeline (Source_Json_Salt_Edge)

Synthetic run against realistic inputs (2 accounts, 4 transactions):
- Pipeline completes with **24 objects** returned
- **103 dashboard variables** derived
- **63 canonical credit-assessment variables** populated
- `bank_Balance_checking_saving_accounts`: $17,200 ✅
- `average_monthly_salary`: $3,500 ✅
- PD Score: **741 (Good)** ✅

### v7 Expert Scorecard

Synthetic scorecard run (22 variables):
- `score`: **805**
- `band`: **Excellent**
- `raw_points`: 918 / 1000
- Top reason: mortgage_to_total_debt_ratio | rent_to_income_ratio | average_monthly_salary
- All 22 factors resolved ✅

### Excel Export (user_good_pipeline_output pattern)

`export_canonical_excel()` produces a workbook with 21 sheets:
- Raw DataFrames: connection, accounts, transactions, monthly_summary, daily_summary, dpd,
  holder_info, credit_utilization, monthly_acct_summary, loan_category_detail
- Per-API dashboard dicts: dash_connection, dash_accounts, dash_transactions, dash_holder_info,
  dash_credit_util, dash_monthly_acct, df_dashboard
- Canonical tabs: **Summary** (63 rows), **Source Hierarchy**, **Dashboard Variables**, **API Availability**

### Dashboard UI

The `/dashboard` page loads and renders all panels correctly:
- **Risk Analysis**: Credit risk (Good), Income stability (Reviewing),
  Housing payment capacity (Excellent), AI Risk Analysis (799)
- **Customer Information**: Full Name, Date of Birth, Contact, Employer panels
- **Credit Information**: Outstanding Debt & Repayment, Breakdown of Total Debt,
  Delinquencies, Defaults sections
- **Ability to Repay**: Total Assets, income trend panels
- JA/EN language toggle, USD currency selector, Archive/Connect bank accounts actions,
  Deny Client / Approve Client decision buttons — all present and rendering

## Backend Endpoint

`GET /v1/applications/{id}/credit-score` ([http_endpoints.py:2490](backend/src/interface/http_endpoints.py)):
- Lazy-computes v7 score on first call
- Caches on fingerprint match of succeeded bank-data snapshots
- Returns: `score`, `band`, `raw_points`, `top_3_reasons`, `factors`, `dashboard`, `scorecard`, `fx_audit`, `api_errors`
- SaltEdge and Plaid both feed into `get_or_compute_score()` via `credit_score_runtime.py`

## Source Routes

| Source | Processing path |
|---|---|
| Source_Json_Plaid | `plaid_bundle/plaid_processing/plaid_pipeline.py` → `credit_score_runtime.py` |
| Source_Json_Salt_Edge | `saltedge_bundle/saltedge_processing/saltedge_pipeline.py` → `credit_score_runtime.py` |
| v7 | `ml/scoring/expert_scorecard.py` → score + band + factors |

All three are wired correctly through `credit_scoring_service.py:get_or_compute_score()`.
