# Dashboard Adapter Verification — Implementation Context

## Task Description

Verify that the `/dashboard` page in the Lita eHousing platform works correctly with all data adapters. Specifically:

1. **SaltEdge**: All dummy/test data from a SaltEdge sandbox connection is populated correctly in every dashboard section (bank balance, loan analysis, housing payments, income trends, credit score).
2. **Plaid**: Using Plaid's demo/sandbox accounts, the Plaid Link flow completes successfully, data populates the dashboard correctly, and all financial KPI tiles reflect the Plaid pipeline output.
3. **No regressions**: Main branch functionality is preserved after the changes in `kapil-potgres` are merged.

The coworker's branch is named **`kapil-potgres`** (remote: `origin/kapil-potgres`). The actual branch name in the repo is `kapil-potgres` — note the misspelling from the task description ("postgres" vs "potgres").

---

## Branch Under Review

### What is in `kapil-potgres` vs `main`

```
git diff main...origin/kapil-potgres --name-only
```

Total: 356 files changed, 39 290 insertions, 28 809 deletions.

**Key new/changed files for dashboard+adapter work:**

| File | Change type | Summary |
|---|---|---|
| `backend/src/ml/dashboard_adapters.py` | New | `adapt_open_banking_dashboard_loan_variables()` — converts transactions to loan-analysis dict |
| `backend/src/ml/dashboard_snapshot_adapter.py` | New | `build_dashboard_snapshot_adapter()` — six-section dashboard envelope |
| `backend/src/ml/scoring/saltedge_bundle/` | New (entire bundle) | SaltEdge full processing pipeline |
| `backend/src/ml/scoring/plaid_bundle/` | New (entire bundle) | Plaid full processing pipeline |
| `backend/src/infra/external_apis/saltedge_client.py` | New/updated | SaltEdge v6 REST client with retry + signing |
| `backend/src/infra/external_apis/plaid_client.py` | New/updated | Plaid SDK client factory |
| `backend/src/infra/external_apis/plaid_bank_gateway.py` | New | `PlaidBankGateway` implementing `BankGateway` domain interface |
| `backend/src/interface/saltedge_endpoints.py` | Modified | Added `persist_saltedge_connection`, `sync_saltedge_customer`, updated `get_connections_for_customer` to read from DB |
| `backend/src/infra/mysql/saltedge_consent_repository.py` | New | `SQLSaltEdgeConsentRepository` — read/write SaltEdge slice of `open_banking_consents` |
| `backend/src/domain/saltedge_consent.py` | New | `SaltEdgeConsent` dataclass; protocol interface |
| `backend/migrations/005_bank_data_snapshots.sql` | New | `bank_data_snapshots` table |
| `backend/migrations/006_open_banking_saltedge.sql` | New | SaltEdge columns + indexes on `open_banking_consents` |
| `backend/tests/ml/test_dashboard_adapters.py` | New | Unit tests for `adapt_open_banking_dashboard_loan_variables` |
| `backend/tests/ml/test_dashboard_snapshot_adapter.py` | New | Unit tests for `build_dashboard_snapshot_adapter` |
| `frontend/app/dashboard/page.tsx` | Modified | 7 289-line monolith; updated SaltEdge account fetch, loanAnalysisOverride from adapter payloads |
| `frontend/app/dashboard/lib/dashboard-page-helpers.ts` | Modified | Added `ViewState`, `HousingHistoryPoint`, `CashFlowBubbleDatum`, `RiskInsight`, `creditRiskToneStyles`, etc. |
| `frontend/app/dashboard/components/*.tsx` | Modified | Presentation components split out of page.tsx |
| `frontend/app/api/saltedge/_proxy.ts` | New | Server-side proxy resolving `BACKEND_API_URL` and forwarding SaltEdge API calls |
| `frontend/app/api/saltedge/connection/[connectionId]/persist/route.ts` | New | Proxies `POST /api/saltedge/connection/{id}/persist` |
| `frontend/app/api/saltedge/customer/[customerId]/sync/route.ts` | New | Proxies `POST /api/saltedge/customer/{id}/sync` |
| `frontend/app/api/v1/applicants/[id]/transactions/route.ts` | New | Proxies transaction+adapter fetch to backend |
| `frontend/app/api/v1/applications/[id]/account-balances/route.ts` | New | Proxies live-balance endpoint |
| `frontend/app/application/connect-accounts/pagePlaid.tsx` | Modified | Plaid Link connect flow |
| `frontend/app/application/connect-accounts/pageSalt.tsx` | Modified | SaltEdge widget connect flow with reconnect support |
| `frontend/app/application/PlaidLinkButton.tsx` | Modified | OAuth redirect handling |

**Key commits in `kapil-potgres` not in `main`:**
```
448aa1f salt-edge-bug-fixes
a2d95d1 updated-frontend-docker
2fa245a Fix Docker build for Postgres (kapil-potgres branch)
c30280f updated-dashboard-and-applicaiton-flow
5b7b6cf updated-dashboard-and-applicaiton-flow
bc7fdf3 updated-dashboard-and-applicaiton-flow
0d7fa43 remove-vertex-pipelien-add-plaid-saltedge-integration
```

---

## Relevant Files

### Backend

#### `backend/src/ml/dashboard_adapters.py`
**Lines 1–end (full file).**
Function `adapt_open_banking_dashboard_loan_variables(transactions, *, now=None)`:
- Accepts a list of transaction dicts. Filters to loan transactions by description/category keyword.
- Returns a flat dict: `{delays, default, unsecured_loan, secured_loan, loan_balance, repayment_period_months, late_payments, borrowing_from_other_lenders, currency_code}`.
- `loan_balance` = sum of `abs(amount)` in the trailing 12 months.
- `delays` / `late_payments` = months in the repayment period that had no loan payment.
- `default` = count of distinct loan descriptors containing default/delinquent/charge-off keywords.

#### `backend/src/ml/dashboard_snapshot_adapter.py`
**Lines 1–end (full file).**
Function `build_dashboard_snapshot_adapter(*, application, transactions)`:
- Returns a dict with six keys: `loan_metrics`, `risk_metrics`, `housing_metrics`, `cashflow_metrics`, `bureau_metrics`, `profile_metrics`.
- `bureau_metrics` reads `credit_score`, `delinquencies_24m`, `utilization`, `total_outstanding`, `monthly_repayment` from `application.metadata` (supports dotted paths like `credit.total_outstanding`).
- `risk_metrics` derives `combined_risk_score` (0–1) as `repayment_pressure*0.45 + housing_burden*0.25 + delinquency_penalty*0.2 + utilization_penalty*0.1`.

#### `backend/src/ml/scoring/saltedge_bundle/`
Full processing pipeline for SaltEdge data.

- `saltedge_to_dataframes.py` — top-level entry point for batch/file-based use; loads FX rates from `currency_rates.xlsx`.
- `saltedge_processing/__init__.py` — exports `run_pipeline`.
- `saltedge_processing/saltedge_pipeline.py` — `run_pipeline(se_connection_resp, se_accounts_resp, se_transactions_resp, se_holder_info_resp, connection_id, username)`. Returns 22-key dict: 9 DataFrames + 6 dashboard variable dicts + `dashboard` merged dict + `df_dashboard` + `summary` + `df_summary` + `user_level_credit_util` + `combined_summary` + `df_combined_summary`.
- `saltedge_processing/saltedge_pipeline_live.py` — `run_pipeline_live(user_id, session_id, se_*_resp, fx_rates)`. Thin wrapper.
- `saltedge_processing/saltedge_dashboard_variables.py` — Per-product derive functions (`derive_from_connection`, `derive_from_accounts`, `derive_from_transactions`, `derive_from_holder_info`, `derive_from_credit_utilization`, `derive_from_monthly_account_summary`). `derive_dashboard_variables(results)` merges all. `dashboard_to_dataframe(dashboard)`.
- `saltedge_processing/saltedge_summary.py` — `derive_summary(results)` → 62-variable flat dict using the exact analyst-spec variable names (e.g., `average_monthly_salary`, `total_loan_balance`, `delays_calculate_number_of_missing_loan_payments`).
- `saltedge_processing/saltedge_transaction_processing.py` — loads and classifies transactions.
- `saltedge_processing/saltedge_accounts_processing.py` — loads accounts; applies FX conversion.
- `saltedge_processing/saltedge_pd_features.py` — `build_combined_summary(results)` → 22-key combined summary + PD score.

**Input shapes for `run_pipeline`:**
```python
se_connection_resp   = {"data": { ...connection fields... }}
se_accounts_resp     = {"data": [...accounts...], "meta": {...}}
se_transactions_resp = {
    account_id: {
        "account_name": ...,
        "account_nature": ...,
        "count": ...,
        "response": {"data": [...], "meta": {...}}
    }
}
se_holder_info_resp  = {"status": "not_available"} | {"data": { ...holder fields... }}
```

#### `backend/src/ml/scoring/plaid_bundle/`
Full processing pipeline for Plaid data.

- `plaid_processing/__init__.py` — exports `run_pipeline`.
- `plaid_processing/plaid_pipeline.py` — `run_pipeline(user_id, session_id, pld_accounts_balance, pld_transactions, pld_identity, pld_investment, pld_liabilities, pld_asset_report, pld_asset_report_full)`. Returns 30 DataFrames.
- `plaid_processing/plaid_pipeline_live.py` — `run_pipeline_live(user_id, session_id, pld_*, fx_rates)`. Returns 30 DataFrames + 9 derived dashboard objects + 3 analyst summary objects.
- `plaid_processing/plaid_dashboard_variables.py` — per-product derive functions; `derive_dashboard_variables(results)` merges all.
- `plaid_processing/plaid_summary.py` — `derive_summary(results)` → 62-variable flat dict.
- Individual processors: `plaid_accounts_processing.py`, `plaid_identity_processing.py`, `plaid_liabilities_processing.py`, `plaid_investments_processing.py`, `plaid_transaction_processing.py`, `plaid_asset_report_processing.py`, `plaid_asset_report_full_processing.py`.
- `plaid_to_dataframes.py` — file-based entry point.

**Variables NOT available from Plaid (always None, must come from KYC):**
`date_Birth`, `sex_gender`, `no_reseidence_permit`, `expire_date_permit`

#### `backend/src/infra/external_apis/saltedge_client.py`
**Lines 1–200+ (full file).**
`SaltEdgeClient.__init__` reads env vars `SALTEDGE_APP_ID`, `SALTEDGE_SECRET`, `SALTEDGE_PRIVATE_KEY_PEM` or `SALTEDGE_PRIVATE_KEY_PATH`. Raises `SaltEdgeConfigurationError` if any are missing.
- `_sign_request(method, url, body)` — RSA-SHA256 PKCS8 signature; sets `Expires-at` + `Signature` headers.
- `_request(method, endpoint, params, data)` — retries up to `MAX_RETRIES=2` within `MAX_RETRY_DURATION=20s`; maps 404 GET to `{"data": []}`.
- Key methods: `list_customers()`, `list_connections(customer_id)`, `get_connection(connection_id)`, `list_accounts(customer_id, connection_id)`, `list_transactions(customer_id, connection_id, account_id, date_from, date_to)`, `create_customer(identifier)`, `create_connect_session(customer_id, ...)`.

#### `backend/src/infra/external_apis/plaid_client.py`
- `get_plaid_client()` (LRU cached) — builds `PlaidApi` from `PLAID_CLIENT_ID` + `PLAID_SECRET`. Uses `PLAID_ENV` to choose `Environment.Sandbox` / `Development` / `Production`.
- `get_plaid_country_codes(default)` — reads `PLAID_COUNTRY_CODES` env var (comma-separated); defaults to `["US"]`.
- `get_plaid_language(default)` — reads `PLAID_LANGUAGE` env var; defaults to `"en"`.
- `_to_serializable(value)` — recursively converts Plaid SDK objects to JSON-serializable dicts.

#### `backend/src/infra/external_apis/plaid_bank_gateway.py`
`PlaidBankGateway` (implements `BankGateway`):
- `create_link_token(user_id)` → `{link_token, expiration}`
- `exchange_public_token(public_token)` → `{access_token, item_id}`
- `get_accounts(access_token)` → `[BankAccount]`
- `get_balances(access_token, account_ids)` → `{account_id: {available, current, limit, currency_code, name, ...}}`
- `create_processor_token(access_token, account_id, processor)` → `str`

#### `backend/src/interface/saltedge_endpoints.py`
FastAPI router. Key endpoints:

| Route | Method | Purpose |
|---|---|---|
| `/api/saltedge/v6/customer` | POST | Create or find SaltEdge customer by email |
| `/api/saltedge/v6/connect-session` | POST | Return widget URL; auto-detects reconnect if prior DB row exists |
| `/api/saltedge/connection/{connection_id}/persist` | POST | Post-widget: fetch connection+accounts from SaltEdge, compute fingerprint, upsert consent row |
| `/api/saltedge/customer/{customer_id}/sync` | POST | Post-widget: diff upstream connections vs DB, persist any new ones |
| `/api/saltedge/customer/{customer_id}/connections` | GET | Return live connections from DB (filtered `removed_at IS NULL`) + accounts fetched from SaltEdge |
| `/api/saltedge/connection/{connection_id}` | GET | Single connection details |

**`_compute_account_fingerprint(accounts)`** (line 460): SHA-256 of sorted IBAN/masked-PAN/account-number values. Used for dedup.

**`persist_saltedge_connection`** (line 493+): Fetches connection + accounts from SaltEdge; computes fingerprint; calls `repo.upsert_from_widget_return(...)`. Returns `SaltEdgePersistConnectionResponse`.

**`get_connections_for_customer`** (line 817+): Reads `open_banking_consents` by `saltedge_customer_id`. Then fetches per-connection accounts from SaltEdge.

#### `backend/src/infra/mysql/saltedge_consent_repository.py`
`SQLSaltEdgeConsentRepository`:
- `list_live_by_customer(saltedge_customer_id)` — queries `open_banking_consents WHERE provider='saltedge' AND saltedge_customer_id=? AND removed_at IS NULL`.
- `upsert_from_widget_return(...)` — soft-retires prior active row for same (customer_reference, provider_code, fingerprint) via `superseded_by_id`; inserts new row.
- `soft_remove(consent_id)` — sets `removed_at`.
- `mark_success/mark_error(consent_id)` — updates `status`.

#### `backend/src/domain/saltedge_consent.py`
```python
@dataclass(slots=True)
class SaltEdgeConsent:
    saltedge_connection_id: str
    saltedge_customer_id: str
    saltedge_provider_code: str
    customer_reference: str
    id: Optional[int] = None
    application_id: Optional[int] = None
    saltedge_provider_name: Optional[str] = None
    categorization: Optional[str] = "personal"
    account_fingerprint: Optional[str] = None
    status: str = STATUS_ACTIVE  # "active" | "error" | "superseded" | "removed"
    ...
```

#### `backend/migrations/006_open_banking_saltedge.sql`
Adds to `open_banking_consents`:
- `provider VARCHAR(32) DEFAULT 'plaid'`
- `saltedge_customer_id`, `saltedge_connection_id`, `saltedge_provider_code`, `saltedge_provider_name`, `country_code`, `categorization`, `account_fingerprint`, `status`, `last_success_at`, `removed_at`, `superseded_by_id`
- Makes `consent_reference`, `expires_at`, `scopes` nullable (Plaid-only columns)
- Unique index: `uq_obc_saltedge_connection_id` on `saltedge_connection_id`
- Unique partial index: `uq_obc_saltedge_active_per_customer_ref` on `(customer_reference, saltedge_provider_code, account_fingerprint) WHERE provider='saltedge' AND removed_at IS NULL AND ...`

#### `backend/migrations/005_bank_data_snapshots.sql`
Creates `bank_data_snapshots` table with columns: `id`, `session_id`, `user_id`, `source`, `product_type`, `consent_id`, `status`, `payload JSONB`, `error_code`, `error_message`, `started_at`, `completed_at`, `duration_ms`, `attempt`, `retry_of_id`, `is_latest`, `retention_expires_at`, `payload_purged_at`, etc.
Unique partial index: `uq_bank_data_snapshots_latest ON (user_id, source, product_type, COALESCE(consent_id, 0)) WHERE is_latest = TRUE`.

#### Backend tests
- `backend/tests/ml/test_dashboard_adapters.py` — two tests: `test_adapter_returns_zeroed_metrics_without_loan_transactions`, `test_adapter_maps_all_dashboard_fields`.
- `backend/tests/ml/test_dashboard_snapshot_adapter.py` — one test: `test_build_dashboard_snapshot_adapter_sections`.

---

### Frontend

#### `frontend/app/dashboard/page.tsx` (7 289 lines)
The monolithic dashboard page. All data fetching is co-located as React hooks.

**State relevant to adapters:**
```typescript
const [fetchedSaltEdgeAccountSummaries, setFetchedSaltEdgeAccountSummaries] = useState<SaltEdgeAccountSummary[]>([])
const [cashFlowAnnualTotals, setCashFlowAnnualTotals] = useState<Array<{ year: number; net: number }>>([])
const [paymentTransactions, setPaymentTransactions] = useState<PaymentHistoryTransactionSummary[]>([])
const [loanAnalysisOverride, setLoanAnalysisOverride] = useState<OpenBankingDashboardLoanAdapter | null>(null)
const [cashFlowCurrencyCode, setCashFlowCurrencyCode] = useState<string | null>(null)
const [liveBalances, setLiveBalances] = useState<Record<string, LiveBalanceRecord>>({})
const [apiScore, setApiScore] = useState<ApiCreditScore | null>(null)
const [scorePending, setScorePending] = useState(false)
const [scoreRetrying, setScoreRetrying] = useState(true)
```

**Key `useEffect` hooks (all in page.tsx):**

1. **Line ~984: `fetchApplication`** — `GET /api/v1/applications/{id}`. Returns `BackendApplication`; calls `toApplicationDetail(data)` to get `ApplicationDetail` with `connected_accounts: Record<string, ConnectedAccount[]>`.

2. **Line ~508: live balances** — `GET /api/v1/applications/{id}/account-balances`. Returns `{accounts: LiveBalanceRecord[]}`. Merges into `uniqueConnectedAccounts` by `account_id`.

3. **Line ~1547: SaltEdge connections** — `GET ${backendApiUrl}/api/saltedge/customer/${customerId}/connections`. Note: **`customerId` here is derived from `application?.id`** (the Postgres integer row ID), not the SaltEdge-assigned customer ID.

4. **Line ~1790: `loadCashFlow`** — `GET /api/v1/applicants/{id}/transactions?start_date=...&end_date=...`. Returns `{transactions[], start_date, end_date, dashboard_loan_adapter?, dashboard_snapshot_adapter?}`. Processes: extracts primary currency, sets `paymentTransactions`, picks up `dashboard_snapshot_adapter.loan_metrics` first (then `dashboard_loan_adapter`) for `loanAnalysisOverride`.

5. **Line ~2131: `fetchCreditScore`** — `GET /api/v1/applications/{id}/credit-score`. Returns `ApiCreditScore` or 202 (pending). Sets `apiScore`.

**`ApiCreditScore` shape:**
```typescript
type ApiCreditScore = {
  score: number
  band: string
  raw_points: number
  top_3_reasons: unknown[]
  factors: Record<string, unknown>
  dashboard: Record<string, unknown>  // SaltEdge/Plaid pipeline `dashboard` dict
  scorecard: Record<string, unknown>  // SaltEdge/Plaid pipeline `summary` dict
  fx_audit?: Record<string, unknown> | null
  api_errors?: Record<string, unknown> | null
  cached: boolean
  computed_at: string | null
  source?: string
}
```

**`v7Data` derived from `apiScore`** (line ~2172):
```typescript
const v7Data = useMemo(() => {
  const dash = v7Dashboard   // apiScore.dashboard
  const score = v7Scorecard  // apiScore.scorecard
  return {
    fullName: dash.full_name,
    phone: dash.phone_Number,
    address: dash.current_Address,
    employer: dash.place_work,
    riskLabel: mapBandToRiskLabel(score.band),
    housingCapacity: mapHousingCapacityLabel(dash.avg_monthly_mortgage_payment, ...),
    totalLoanBalance: toNumber(dash.total_loan_balance),
    monthlyLoanPayment: toNumber(dash.total_avg_monthly_loan_payment),
    ccBalance: toNumber(dash.balance_of_credit_card_overdraft),
    bankBalance: toNumber(dash.bank_Balance_checking_saving_accounts),
    securitiesValue: toNumber(dash.assets_Securities),
    cashFlowMonthly: toNumber(dash.cash_flow),
    monthlySalary: toNumber(dash.average_monthly_salary),
    annualIncome: computeAnnualIncome(dash.average_monthly_salary),
    avgMonthlyMortgage: toNumber(dash.avg_monthly_mortgage_payment),
    avgMonthlyRent: toNumber(dash.average_spend_rent),
    recent12Income: dash.list_of_recent_12_income,
    recent12Rent: dash.list_of_recent_12_rent,
    recent12Mortgage: dash.list_of_recent_12_mortgage_payment,
    isAvailable: apiScore !== null,
  }
}, [apiScore, v7Dashboard, v7Scorecard])
```

**`customerId` bug** (line 1354):
```typescript
const customerId = useMemo(() => {
  const rawId = application?.id
  if (rawId === undefined || rawId === null) return null
  return typeof rawId === "string" ? rawId : String(rawId)
}, [application?.id])
```
This derives `customerId` from the Postgres integer application ID (e.g., `"42"`). The `GET /api/saltedge/customer/{customerId}/connections` endpoint, however, queries `open_banking_consents` by `saltedge_customer_id` — the SaltEdge-assigned customer ID string (e.g., `"987654321"`). These values will never match, so `fetchedSaltEdgeAccountSummaries` will always be empty. The dashboard falls back to `fallbackSaltEdgeAccounts` (built from `connected_accounts` already stored on the application record).

**`fallbackSaltEdgeAccounts`** (line 1465): Built from `uniqueConnectedAccounts` where `account.provider === "saltedge"`. Provides account summaries even if the live SaltEdge fetch fails.

**`saltEdgeAccounts`** (line 1527): Merges `fallbackSaltEdgeAccounts` (base) with `fetchedSaltEdgeAccountSummaries` (overlay). Since the overlay is always empty due to the `customerId` bug, this reduces to `fallbackSaltEdgeAccounts`.

#### `frontend/app/dashboard/lib/dashboard-page-helpers.ts`
Contains extracted types:
```typescript
type ViewState = "dashboard" | "kyc" | "wiki"

interface HousingHistoryPoint {
  id: string; date: string; periodLabel: string; axisLabel: string; monthKey: string
  housing: number; salary: number; cash: number
  delayed?: boolean; delayMarker?: number
  delayReason?: HousingDelayReason; delayNetCash?: number; delayExpectedHousing?: number
}

type CashFlowBubbleDatum = {
  id: string; axisLabel: string; periodLabel: string; isoDate: string
  cashBalance: number; monthlySalary: number; housingPayment: number
  housingPaymentDelay: number | null; hasDelay: boolean
}

type RiskInsight = {
  title: string; value: string; description: string
  cardClassName?: string; titleClassName?: string; valueClassName?: string; descriptionClassName?: string
}
```
Also exports: `creditBreakdownPalette`, `premiumNetGradientPalette`, `creditRiskToneStyles`, `getPaletteForValue(value)`, `getInitials(value)`, `formatAccountTypeLabel(subtype, type, translate)`, `formatPossessiveName(name)`.

#### `frontend/app/api/saltedge/_proxy.ts`
Server-side proxy. Resolves backend URL from `BACKEND_API_URL` > `API_BASE_URL` > `http://backend:8000` > `http://127.0.0.1:8000` > `http://localhost:8000`. Filters to candidates whose origin differs from the frontend origin. Tries each `endpointPaths` in order, skipping 404s, returning the first non-404 response. 30s timeout per request.

#### `frontend/app/api/saltedge/connection/[connectionId]/persist/route.ts`
```typescript
export async function POST(request, context) {
  const { connectionId } = await context.params
  return proxySaltEdgeRequest(request, [
    `/api/saltedge/connection/${encodedConnectionId}/persist`,
    `/saltedge/connection/${encodedConnectionId}/persist`,
  ])
}
```

#### `frontend/app/api/saltedge/customer/[customerId]/sync/route.ts`
```typescript
export async function POST(request, context) {
  const { customerId } = await context.params
  return proxySaltEdgeRequest(request, [
    `/api/saltedge/customer/${encodedCustomerId}/sync`,
    `/saltedge/customer/${encodedCustomerId}/sync`,
  ])
}
```

#### `frontend/app/api/v1/applicants/[id]/transactions/route.ts`
GET handler. Proxies to `${baseUrl}/api/v1/applications/{id}/transactions?start_date=...&end_date=...`. Passes `Authorization` header from session. Multi-URL retry with `BackendHttpError` handling.

#### `frontend/app/api/v1/applications/[id]/account-balances/route.ts`
GET handler. Proxies to `${baseUrl}/api/v1/applications/{id}/account-balances`.

#### `frontend/app/application/connect-accounts/pageSalt.tsx`
SaltEdge connect page. Key storage key: `"dw_application_saltedge_customer_id"`.

`customerId` is the SaltEdge-assigned customer ID (`e.g. "987654321"`), obtained from:
1. `searchParams.get("saltedge_customer_id")` (URL param)
2. `localStorage.getItem("dw_application_saltedge_customer_id")` (persistent)
3. Set after a successful connection via `setCustomerId(customerIdFromConnection)` and `localStorage.setItem(SALTEDGE_CUSTOMER_STORAGE_KEY, customerIdFromConnection)`.

After widget redirect, calls `POST /api/saltedge/connection/{connection_id}/persist` and `POST /api/saltedge/customer/{customer_id}/sync`.

#### `frontend/app/application/connect-accounts/pagePlaid.tsx`
Plaid connect page. On `onSuccess(publicToken, metadata)`:
- Exchanges public token via `POST ${backendApiUrl}/api/plaid/exchange_token`.
- Stores account info in localStorage key `"dw_application_connected_accounts"` (version 7).
- On application submit, `connected_accounts` is written to the application record.

#### `frontend/app/application/PlaidLinkButton.tsx`
- Calls `GET ${backendApiUrl}/api/plaid/create_link_token` to fetch link token.
- Stores token+accountType in localStorage for OAuth redirect recovery (`PLAID_OAUTH_TOKEN_KEY`, `PLAID_OAUTH_ACCOUNT_TYPE_KEY`).
- Uses `react-plaid-link` `usePlaidLink` hook.

#### `frontend/lib/financial-insights.ts`
**`OpenBankingDashboardLoanAdapter` interface:**
```typescript
interface OpenBankingDashboardLoanAdapter {
  delays: number
  defaultCount: number
  unsecuredLoanCount: number
  securedLoanCount: number
  loanBalance: number
  repaymentPeriodMonths: number
  latePayments: number
  borrowingFromOtherLenders: number
  currencyCode: string | null
}
```

**`adaptOpenBankingToDashboardLoanVariables(transactions, now)`** — frontend equivalent of the backend adapter. Used as fallback when `loanAnalysisOverride` is null.

**`analyseHousingPayments(transactions, options)`** — detects housing payments by keyword matching on description and categories. Returns monthly breakdown for chart data.

**`aggregateAnnualCashFlowTotals(transactions)`** — groups cash inflow by year for bar chart.

**Currency matrix** (static, hardcoded for USD/JPY/EUR/GBP/SEK).

---

## Key Code Patterns

### How the dashboard receives adapter data

```
/api/v1/applicants/{id}/transactions
    → backend returns:
      {
        transactions: [...],
        dashboard_loan_adapter: { delays, default, unsecured_loan, ... },
        dashboard_snapshot_adapter: {
          loan_metrics: { ... },
          risk_metrics: { ... },
          housing_metrics: { ... },
          cashflow_metrics: { ... },
          bureau_metrics: { ... },
          profile_metrics: { ... }
        }
      }
    → dashboard page picks up dashboard_snapshot_adapter.loan_metrics first
      → sets loanAnalysisOverride
```

### How SaltEdge dummy data flows end-to-end

```
1. Admin selects applicant (reviewer) or applicant logs in (customer)
2. fetchApplication → GET /api/v1/applications/{id}
   → returns connected_accounts with provider="saltedge" entries (stored at submit time)
3. loadSaltEdgeConnections → GET ${backendApiUrl}/api/saltedge/customer/${customerId}/connections
   → BUG: customerId = application.id (Postgres integer), but endpoint queries saltedge_customer_id
   → Returns empty; dashboard falls back to fallbackSaltEdgeAccounts from connected_accounts
4. fetchCreditScore → GET /api/v1/applications/{id}/credit-score
   → backend calls SaltEdge pipeline, returns score + dashboard dict
   → dashboard maps v7Dashboard fields to KPI tiles
5. loadCashFlow → GET /api/v1/applicants/{id}/transactions
   → backend returns raw transactions + dashboard_loan_adapter
   → dashboard sets paymentTransactions, loanAnalysisOverride, cashFlowAnnualTotals
```

### How Plaid demo data flows end-to-end

```
1. Applicant clicks "Connect Personal Account" on connect-accounts page
2. PlaidLinkButton: GET ${backendApiUrl}/api/plaid/create_link_token
3. Plaid Link modal opens; user selects demo institution (e.g. "Plaid Bank")
   → uses credentials user_good / pass_good
4. onSuccess(publicToken, metadata)
   → POST ${backendApiUrl}/api/plaid/exchange_token {public_token}
   → stores access_token in backend
   → stores account info in localStorage + application record
5. On dashboard:
   → fetchCreditScore calls Plaid pipeline with stored access_token
   → returns v7 score + dashboard dict
   → v7Data fields populate KPI tiles
6. loadCashFlow fetches transactions from Plaid snapshots
```

### SaltEdge widget reconnect flow

When `POST /api/saltedge/v6/connect-session` is called with `customer_reference` and `saltedge_provider_code`:
- Queries `find_reconnect_candidate(customer_reference, saltedge_provider_code, categorization)`.
- If a live DB row exists → returns `connect_url` with `reconnect_connection_id` set and `mode="reconnect"`.
- If not → returns `mode="create"`.

---

## Data Structures

### `ConnectedAccount` (frontend, `lib/financial-insights.ts`)
```typescript
interface ConnectedAccount {
  id: string; name: string; provider: string; type: string
  source_index?: number | null; subtype?: string | null
  access_token?: string | null; last_synced?: string | null; status?: string | null
  connection_id?: string | null; connection_name?: string | null
  account_id?: string | null; account_name?: string | null
  currency_code?: string | null; balance_currency?: string | null
  institution_name?: string | null; official_name?: string | null; mask?: string | null
  available_balance?: number | null; current_balance?: number | null
}
```

### `SaltEdgeAccountSummary` (frontend, used in `page.tsx`)
```typescript
interface SaltEdgeAccountSummary {
  connectionId: string; connectionName: string
  accountId: string; accountName: string
  currencyCode: string | null; institutionName: string
}
```

### `PaymentHistoryTransactionSummary` (frontend)
```typescript
interface PaymentHistoryTransactionSummary {
  amount: number; date: string
  currency_code?: string | null; status?: string | null
  account_name?: string | null; connection_name?: string | null
  description?: string | null; categories?: string[] | null
  provider?: string | null; metadata?: Record<string, unknown> | null
}
```

### Backend transaction dict shape (for adapters)
```python
{
  "amount": float,           # positive = inflow, negative = outflow
  "date": "YYYY-MM-DD",
  "description": str,
  "categories": [str],
  "currency_code": str,
  "connection_name": str,    # used for lender dedup
  "account_name": str,
  "provider": str,
  "metadata": dict,
}
```

### `SaltEdgeConsent` (backend domain)
```python
@dataclass(slots=True)
class SaltEdgeConsent:
    saltedge_connection_id: str
    saltedge_customer_id: str
    saltedge_provider_code: str
    customer_reference: str       # applicant email
    id: Optional[int] = None
    application_id: Optional[int] = None
    saltedge_provider_name: Optional[str] = None
    categorization: Optional[str] = "personal"
    account_fingerprint: Optional[str] = None
    status: str = "active"        # active|error|superseded|removed
```

---

## Environment Variables

### Backend (required for SaltEdge)
```
SALTEDGE_APP_ID=           # SaltEdge App ID from dashboard
SALTEDGE_SECRET=           # SaltEdge Secret from dashboard
SALTEDGE_PRIVATE_KEY_PEM=  # RSA private key PEM inline (preferred)
SALTEDGE_PRIVATE_KEY_PATH= # OR path to key file
```
Missing any of these raises `SaltEdgeConfigurationError` at import time, which becomes a 503 response.

### Backend (required for Plaid)
```
PLAID_CLIENT_ID=           # Plaid client_id
PLAID_SECRET=              # Plaid sandbox/production secret
PLAID_ENV=sandbox          # sandbox | development | production
PLAID_COUNTRY_CODES=US,CA  # comma-separated, defaults to US
PLAID_LANGUAGE=en          # defaults to en
PLAID_CLIENT_NAME=         # Display name in Plaid Link, defaults to "DW Platform"
```

### Backend (database — Postgres required for SaltEdge consents)
```
CLOUD_SQL_CONNECTION_NAME= # Cloud SQL connection name (production)
DB_USER=
DB_PASSWORD=
DB_NAME=
# OR for local dev:
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
```
The `bank_data_snapshots` and `open_banking_consents` tables are Postgres-only (use `JSONB`, `TIMESTAMPTZ`, partial unique indexes). Migrations must be run before testing.

### Frontend
```
NEXT_PUBLIC_BACKEND_API_URL= # e.g., http://localhost:8000
BACKEND_API_URL=             # server-side only, overrides NEXT_PUBLIC for proxies
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_SECRET=
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=
```
The SaltEdge proxy `_proxy.ts` checks `process.env.BACKEND_API_URL` first, then `API_BASE_URL`, then falls back to `http://backend:8000`, `http://127.0.0.1:8000`, `http://localhost:8000`.

### Root `.env_template`
```
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_TEMPLATE_ID=
PLAID_ENV=
SALTEDGE_APP_ID=
SALTEDGE_SECRET=
SALTEDGE_PRIVATE_KEY_PEM=
SALTEDGE_PARTNERS_APP_ID=
SALTEDGE_PARTNERS_SECRET=
SALTEDGE_PARTNERS_PRIVATE_KEY_PEM=
MYSQL_ROOT_PASSWORD=
MYSQL_DATABASE=
MYSQL_USER=
MYSQL_PASSWORD=
SECRET_KEY=
GCP_PROJECT_ID=
GCP_CREDENTIALS_PATH=
VITE_BACKEND_API_URL=
ALLOWED_ORIGINS=
US_API_DATABASE_URL=
...
```

---

## Build / Run Info

### Start dev server (frontend)
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
# Runs on http://localhost:3000
```

### Start backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

### Run backend tests
```bash
cd backend
source .venv/bin/activate
python -m pytest tests/ -v
# Targeted adapter tests:
python -m pytest tests/ml/test_dashboard_adapters.py tests/ml/test_dashboard_snapshot_adapter.py -v
```

### Run frontend tests
```bash
cd frontend
npm test -- --runInBand
# Targeted dashboard helpers:
npm test -- --runInBand dashboard-page-helpers
```

### Full validation (Unix)
```bash
./validate.sh
```
Runs backend pytest + frontend npm test + `next build`.

### Database migrations (Postgres)
Must run before starting the backend with SaltEdge enabled:
```bash
# Run all SQL files in order:
# 000_platform_tables.sql
# 001_initial_schema.sql
# ...
# 005_bank_data_snapshots.sql
# 006_open_banking_saltedge.sql
```

---

## What to Verify

### SaltEdge (dummy data)

1. **Widget flow**: On the connect-accounts page (`/application/connect-accounts`), can you initiate a SaltEdge widget session? Does `POST /api/saltedge/v6/customer` return a customer ID? Does `POST /api/saltedge/v6/connect-session` return a widget URL?

2. **Widget redirect → persist**: After the widget completes (SaltEdge sandbox test provider), does `POST /api/saltedge/connection/{id}/persist` save a row in `open_banking_consents` with `provider='saltedge'`?

3. **Dashboard SaltEdge connections**: Open `/dashboard?id={applicantId}`. Does the SaltEdge connections `useEffect` fire? Since `customerId = application.id` (integer), this will call `/api/saltedge/customer/42/connections` but `open_banking_consents` has `saltedge_customer_id = "987654321"` — they will not match. The dashboard should still show the accounts saved in `connected_accounts` via `fallbackSaltEdgeAccounts`.

4. **Credit score population**: Does `GET /api/v1/applications/{id}/credit-score` trigger the SaltEdge pipeline (via stored snapshots in `bank_data_snapshots`)? Does `apiScore.dashboard` contain the expected keys: `bank_Balance_checking_saving_accounts`, `average_monthly_salary`, `total_loan_balance`, `balance_of_credit_card_overdraft`, `cash_flow`, etc.?

5. **Dashboard KPI tiles**: After score loads:
   - "Bank Balance" tile shows `v7Data.bankBalance` (from `dash.bank_Balance_checking_saving_accounts`).
   - "Total Assets" tile shows `v7Data.totalAssets`.
   - "Average Cash Flow" tile shows `v7Data.cashFlowMonthly`.
   - "Annual Income" tile shows `v7Data.annualIncome`.
   - Loan analysis shows `v7Data.totalLoanBalance`, `v7Data.monthlyLoanPayment`.

6. **Transaction/cashflow section**: Does `GET /api/v1/applicants/{id}/transactions` return non-empty transactions? Does `dashboard_snapshot_adapter.loan_metrics` come back populated?

7. **Housing payment history**: Does `analyseHousingPayments(paymentTransactions)` detect housing payments from SaltEdge transaction categories?

### Plaid (demo accounts)

Plaid Sandbox test credentials: **username `user_good`**, **password `pass_good`** (for most demo institutions like "Plaid Bank"). Some institutions use `user_good` / `pass_good`; check Plaid docs for institution-specific credentials.

1. **Link token creation**: Does `GET ${backendApiUrl}/api/plaid/create_link_token` return a valid `link_token`?

2. **Plaid Link UI**: Does the Plaid Link modal open with the returned `link_token`? Can you select "Plaid Bank" and log in with demo credentials?

3. **Token exchange**: Does `POST ${backendApiUrl}/api/plaid/exchange_token` succeed with the `public_token` from the Link callback?

4. **Connected accounts saved**: After connecting, are account objects written to localStorage and eventually to the application record's `connected_accounts`?

5. **Dashboard Plaid data**: Does `fetchCreditScore` run the Plaid pipeline? Does `apiScore.source` indicate "plaid"? Do the `dashboard` dict keys match what `plaid_dashboard_variables.py` emits: `average_monthly_salary`, `total_loan_balance`, `bank_Balance_checking_saving_accounts`, etc.?

6. **Live balances**: Does `GET /api/v1/applications/{id}/account-balances` return current/available balances from `bank_data_snapshots`?

7. **No KPI tiles showing "—" or placeholder**: All four highlight tiles (Bank Balance, Total Assets, Average Cash Flow, Annual Income) should show real numbers.

---

## Potential Issues

### Critical Bug: Wrong `customerId` for SaltEdge connections fetch

**Location**: `frontend/app/dashboard/page.tsx`, line 1354–1362 and line 1559.

**Problem**: `customerId` is derived from `application?.id` (the Postgres integer). The endpoint `GET /api/saltedge/customer/{customer_id}/connections` queries `open_banking_consents` by `saltedge_customer_id` (SaltEdge-assigned string). These never match.

**Impact**: `fetchedSaltEdgeAccountSummaries` is always empty. The dashboard silently falls back to `fallbackSaltEdgeAccounts` (from `connected_accounts`). This means the dashboard does not show live SaltEdge account data fetched fresh from SaltEdge — only the snapshot saved at application submit time.

**Fix**: The dashboard should use the SaltEdge customer ID, which is stored in `localStorage` under `"dw_application_saltedge_customer_id"` during the connect-accounts flow. Alternatively, the backend endpoint could accept the application's integer ID and join via `application_id` in `open_banking_consents` (using `list_live_by_application`).

### Potential Issue: Migrations must be run before backend starts

The `open_banking_consents` table has new nullable columns added by `006_open_banking_saltedge.sql`. If the migration has not been run, any `persist_saltedge_connection` call will fail with a column-not-found SQL error.

**Verify**: Check that all migrations in `backend/migrations/` have been applied in order. The `schema_migrations` table (if it exists) tracks which have run.

### Potential Issue: SaltEdge private key configuration

`SaltEdgeClient.__init__` requires either `SALTEDGE_PRIVATE_KEY_PEM` (inline PEM string) or `SALTEDGE_PRIVATE_KEY_PATH` (path to key file). In containerized deployments, the PEM string must include literal `\n` newlines, not escaped sequences. A misconfigured PEM will cause all SaltEdge API calls to fail silently with a `SaltEdgeConfigurationError`.

### Potential Issue: Plaid sandbox vs production env mismatch

`get_plaid_client()` is LRU-cached. If `PLAID_ENV` is changed after first import (e.g., between tests), the cached client still uses the old environment. In tests, explicitly clear the LRU cache: `get_plaid_client.cache_clear()`.

### Potential Issue: `dashboard_snapshot_adapter` key naming

The transactions endpoint returns `dashboard_snapshot_adapter.loan_metrics`. The dashboard picks this up at:
```typescript
const snapshotLoanAdapter = data.dashboard_snapshot_adapter?.loan_metrics
const loanAdapterPayload = snapshotLoanAdapter ?? data.dashboard_loan_adapter
```
The field names in `loan_metrics` use Python snake_case: `delays`, `default`, `unsecured_loan`, `secured_loan`, `loan_balance`, `repayment_period_months`, `late_payments`, `borrowing_from_other_lenders`, `currency_code`. The dashboard maps these as `Number(adapter.delays ?? 0)` etc. If the backend returns camelCase keys or different names, values will be 0.

### Potential Issue: `phone_Number` vs `phone_number` in v7 dashboard

In `page.tsx` line ~2183: `phone: typeof dash.phone_Number === "string" ? dash.phone_Number : null`. The SaltEdge dashboard variables file uses `phone_Number` (capital N per analyst spec). If the pipeline emits `phone_number` (lowercase), the dashboard will always show null for phone.

### Potential Issue: `v7Data.isAvailable` gates most tiles

Most dashboard tiles are conditional on `v7Data.isAvailable` (= `apiScore !== null`). While `scoreRetrying` is true (the initial state before `fetchCreditScore` completes), `creditScoreValue` returns null to prevent a placeholder flash. If `fetchCreditScore` never resolves (e.g., backend returns 500), tiles stay empty with no user-visible error.

### Potential Issue: `dashboard_snapshot_adapter` not yet implemented on backend

The `build_dashboard_snapshot_adapter` function exists in `dashboard_snapshot_adapter.py`, and unit tests cover it. However, whether the backend transaction endpoint (`/api/v1/applications/{id}/transactions`) actually calls `build_dashboard_snapshot_adapter` and includes it in the response is not visible from the reviewed files. If the endpoint only returns `dashboard_loan_adapter` (not `dashboard_snapshot_adapter`), the dashboard still works (it falls back), but `bureau_metrics` and `risk_metrics` from the snapshot won't be surfaced.

### Potential Issue: `loanAnalysisOverride` used only as fallback

Even when `loanAnalysisOverride` is set from the adapter payload, the dashboard's loan analysis section prefers `v7Data` from the credit score endpoint. `loanAnalysisOverride` is only used when `v7Data.isAvailable === false`.

### Potential Issue: Currency conversion matrix is static/hardcoded

`financial-insights.ts` has a hardcoded `currencyConversionMatrix` for USD/JPY/EUR/GBP/SEK only. Non-covered currency pairs return `null` from `convertCurrencyAmount`. For SaltEdge users with accounts in, e.g., CHF or AED, currency conversion will silently fail and amounts will display as `null`.
