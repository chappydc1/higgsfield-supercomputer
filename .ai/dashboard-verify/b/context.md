# Dashboard Screenshot Verification — Task Context

## Task Description

Navigate to the `/dashboard` page of the Lita eHousing platform with both SaltEdge and Plaid adapter data loaded, and capture screenshots of every major section. The screenshots must document the current state — including any bugs that make sections appear empty or broken — so developers can confirm what does and does not render correctly before fixing the two critical bugs identified in the previous code audit.

The screenshots should cover: KPI highlight tiles, loan analysis section, SaltEdge connections panel, Plaid section, cash flow chart, housing payment history, credit scorecard, and any visible error states.

---

## Project Background

The `kapil-potgres` branch adds SaltEdge v6 and Plaid open-banking adapters to the platform. Two critical bugs were confirmed by code inspection (no fixes have been applied yet):

### Bug 1: Wrong `customerId` for SaltEdge connections fetch

**File:** `frontend/app/dashboard/page.tsx`, line ~1354

`customerId` is derived from `application?.id` (the Postgres integer primary key, e.g. `42`). It is passed to:
```
GET /api/saltedge/customer/{customerId}/connections
```
but the backend queries `open_banking_consents WHERE saltedge_customer_id = ?` — which holds the SaltEdge-assigned customer ID string (e.g. `"987654321"`). These values can never match. Result: `fetchedSaltEdgeAccountSummaries` is always empty. The dashboard silently falls back to `fallbackSaltEdgeAccounts` built from the `connected_accounts` snapshot on the application record (the stale data saved at submission time).

**Visual symptom:** The SaltEdge connections panel shows only the accounts stored at application submit time — no live-fetched accounts. The network tab shows a call to `/api/saltedge/customer/42/connections` that returns `{"connections": []}`.

### Bug 2: Transactions endpoint omits adapter payloads

**File:** `backend/src/interface/http_endpoints.py`, line ~2630 (`get_application_transactions`)

`GET /v1/applications/{application_id}/transactions` returns:
```json
{ "applicant_id": ..., "start_date": ..., "end_date": ..., "transactions": [...], "total": ... }
```
It does **not** include `dashboard_loan_adapter` or `dashboard_snapshot_adapter`. The dashboard's `loadCashFlow` hook expects both keys; when they are absent `loanAnalysisOverride` is never set from backend data. The loan analysis section falls back to a frontend-computed approximation (`adaptOpenBankingToDashboardLoanVariables` called client-side) rather than the authoritative backend adapter output.

**Visual symptom:** The loan analysis section may show values, but they are computed entirely on the frontend from raw transaction data rather than from the backend pipeline. The `dashboard_snapshot_adapter` keys (risk_metrics, housing_metrics, cashflow_metrics, bureau_metrics) are completely absent — any sections depending on them show placeholder dashes.

### Minor issue: `customerId` naming collision

The same `customerId` variable in `page.tsx` is used for both the SaltEdge connections fetch (wrong) and wiki navigation (correct). Any fix to Bug 1 must not break the wiki navigation path.

---

## How to Start the Servers

### Option A: Docker Compose (recommended — starts all services together)

The local docker-compose file is at:
```
platform/deployment/local/docker-compose.yml
```

1. Copy `.env_template` to `.env` at the repo root and fill in credentials (see "Environment Variables" below).
2. From the repo root:
   ```bash
   ./scripts/run-local.sh
   ```
   This sources `.env`, runs `docker compose -f platform/deployment/local/docker-compose.yml up -d --build`, then seeds sample applicants via `scripts/applicants-local.sh`.

   Services exposed:
   - Frontend: `http://localhost:3000` (also `http://localhost:80` via Caddy)
   - Backend: `http://localhost:8000`

   **Important:** The docker-compose backend sets `DEV_AUTH_BYPASS=true` and `DEV_AUTH_BYPASS_ROLE=admin`, which bypasses Auth0 for local development.

3. Stream logs if needed:
   ```bash
   docker compose -f platform/deployment/local/docker-compose.yml logs -f
   ```

### Option B: Manual start (no Docker)

**Backend:**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Copy backend/.env.development.example to backend/.env and fill in DB credentials
uvicorn src.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install --legacy-peer-deps
# Copy frontend/.env.local.example to frontend/.env.local and fill in Auth0 + backend URL
npm run dev
# Runs on http://localhost:3000
```

---

## Environment Variables Required

Minimum set for local dev (put in `.env` at repo root for Docker, or in `backend/.env` and `frontend/.env.local` for manual mode):

```bash
# Database (Postgres required for SaltEdge consent storage)
DATABASE_URL=postgresql://user:pass@localhost:5432/lita_dev
# OR Cloud SQL:
CLOUD_SQL_CONNECTION_NAME=your-project:us-central1:dev-db
DB_USER=app_user
DB_PASSWORD=replace_me
DB_NAME=app_dev

# SaltEdge (required to test SaltEdge flow; causes 503 if missing)
SALTEDGE_APP_ID=
SALTEDGE_SECRET=
SALTEDGE_PRIVATE_KEY_PEM=      # RSA private key inline PEM with literal \n newlines

# Plaid (required to test Plaid flow)
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
PLAID_COUNTRY_CODES=US,CA
PLAID_LANGUAGE=en

# Frontend (Auth0 — can use placeholder values for local dev with DEV_AUTH_BYPASS=true)
AUTH0_DOMAIN=example.auth0.com
AUTH0_CLIENT_ID=local-client-id
AUTH0_CLIENT_SECRET=local-client-secret
AUTH0_SECRET=a-long-random-string
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://example.auth0.com

# Backend URL (frontend needs this)
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
BACKEND_API_URL=http://localhost:8000
```

**Note on SaltEdge PEM:** If `SALTEDGE_APP_ID`, `SALTEDGE_SECRET`, or `SALTEDGE_PRIVATE_KEY_PEM` are missing, `SaltEdgeClient` raises `SaltEdgeConfigurationError` at import time and all SaltEdge endpoints return 503. The dashboard will still load with fallback data but the SaltEdge connections panel will be empty.

---

## Database Migrations

Migrations must be applied in order before starting the backend with SaltEdge enabled. Run:
```bash
psql $DATABASE_URL -f backend/migrations/000_platform_tables.sql
psql $DATABASE_URL -f backend/migrations/001_initial_schema.sql
# ... through ...
psql $DATABASE_URL -f backend/migrations/005_bank_data_snapshots.sql
psql $DATABASE_URL -f backend/migrations/006_open_banking_saltedge.sql
```

Migration 005 creates `bank_data_snapshots` (JSONB, TIMESTAMPTZ columns — Postgres only). Migration 006 adds SaltEdge columns + partial unique indexes to `open_banking_consents`.

---

## Dashboard URL and Query Parameters

The dashboard page is at:
```
http://localhost:3000/dashboard?id={applicationId}
```

`applicationId` is the integer primary key of an application row in the database.

### Finding applicant IDs

**From seed data:** The `scripts/applicants-prod-seed.sh` seeds Japanese and US applicants. After seeding, query the applications endpoint:
```bash
curl http://localhost:3000/api/v1/applications | python3 -m json.tool | grep '"id"'
```
or directly:
```bash
curl "http://localhost:3000/api/v1/applications?limit=10" | python3 -m json.tool
```

**Seeded test applicants (Japan):** emails follow the pattern `haruto.sato1@joinlita.com`, `yui.tanaka2@joinlita.com`, etc. (first 5 JP + first 5 US by default).

**From `push_dashboard_test_account.py`:** This script creates applicants with pre-populated `connected_accounts` (SaltEdge for JP, Plaid for US). Run:
```bash
python3 scripts/push_dashboard_test_account.py \
  --url http://localhost:3000/api/v1/applications \
  --countries Japan US \
  --count 2
```
The response includes the created applicant ID. The Japan applicants get `connected_accounts.personal` with `provider="saltedge"` (Mizuho Bank). The US applicants get `connected_accounts.personal` with `provider="plaid"` (Chase Bank).

**Dashboard example URL:**
```
http://localhost:3000/dashboard?id=1
```

---

## What to Capture (Screenshot Checklist)

For each applicant (at minimum one SaltEdge/Japan and one Plaid/US applicant), capture:

1. **Full page load state** — screenshot immediately after navigating, while data is still loading (shows loading spinners or skeleton states if any).

2. **KPI highlight tiles** (top of dashboard) — 4 tiles: Bank Balance, Total Assets, Average Cash Flow, Annual Income. These are gated on `v7Data.isAvailable` (= `apiScore !== null`). If the credit score endpoint returns a non-200, all four tiles show "—".

3. **Loan analysis section** — shows `totalLoanBalance`, `monthlyLoanPayment`, `delays`, `latePayments`, `unsecuredLoanCount`, `securedLoanCount`. Currently sourced from frontend fallback (Bug 2); capture whatever is displayed.

4. **SaltEdge connections panel** — shows the list of `saltEdgeAccounts` (merged from `fallbackSaltEdgeAccounts` + `fetchedSaltEdgeAccountSummaries`). Due to Bug 1, only `fallbackSaltEdgeAccounts` populate (from the application's `connected_accounts`). Capture the connection list and note if it shows the Mizuho Bank accounts from seed data.

5. **Plaid section / connected accounts** — shows Plaid accounts from `connected_accounts`. For US applicants this should show Chase Bank accounts from seed data.

6. **Cash flow chart** — the annual cash flow bar chart fed by `cashFlowAnnualTotals` (derived from raw transactions). If `loadCashFlow` fails or returns no transactions, this chart is empty.

7. **Housing payment history chart** — fed by `analyseHousingPayments(paymentTransactions)`. Shows monthly housing spend. Empty if no transactions with housing keywords are found.

8. **Credit scorecard section** — shows `apiScore.score`, `apiScore.band`, `apiScore.scorecard` fields. If credit score endpoint returns 202 (pending), shows a pending/retrying state.

9. **Network tab screenshot** (or console log) — capture the responses from these key API calls:
   - `GET /api/v1/applications/{id}` — check `connected_accounts` present
   - `GET /api/saltedge/customer/{customerId}/connections` — confirm it uses the Postgres integer ID (Bug 1 visible here)
   - `GET /api/v1/applicants/{id}/transactions` — confirm `dashboard_loan_adapter` and `dashboard_snapshot_adapter` are absent in the response (Bug 2 visible here)
   - `GET /api/v1/applications/{id}/credit-score` — check status (200 with score, 202 pending, or 500 error)

---

## Expected vs Actual (Given the Two Bugs)

| Section | Expected (bugs fixed) | Actual (bugs present) |
|---|---|---|
| KPI tiles — Bank Balance | Real number from SaltEdge/Plaid pipeline `bank_Balance_checking_saving_accounts` | Real number IF credit score endpoint returns 200; "—" if score is pending or errored |
| KPI tiles — Annual Income | Real number from `average_monthly_salary * 12` | Same as above |
| SaltEdge connections panel | Live accounts fetched from SaltEdge via `open_banking_consents` query by `application_id` | Only snapshot accounts from `connected_accounts` saved at submit time; NO live SaltEdge fetch (Bug 1) |
| Loan analysis | Backend-computed values from `dashboard_snapshot_adapter.loan_metrics` | Frontend-computed approximation from raw transactions (Bug 2); `dashboard_snapshot_adapter` keys absent |
| Housing payment chart | Backend housing metrics + frontend `analyseHousingPayments` | Frontend-only `analyseHousingPayments` on raw transactions; no backend housing_metrics from snapshot |
| Cash flow chart | Populated from `cashFlowAnnualTotals` derived from transactions | Populated only if transactions endpoint returns non-empty `transactions[]`; chart empty if no transactions |
| Credit scorecard | Score + scorecard from SaltEdge or Plaid pipeline | Depends on whether credit score endpoint is wired to a live pipeline or returns 202 |

---

## Plaid Sandbox Credentials

For testing the Plaid Link UI:
- **Institution:** "Plaid Bank" (or any demo institution in Plaid Sandbox)
- **Username:** `user_good`
- **Password:** `pass_good`
- **OAuth redirect:** handled by `PlaidLinkButton.tsx`; OAuth state is saved to localStorage under `PLAID_OAUTH_TOKEN_KEY`

---

## Browser Automation Tools Available

The `mcp__Claude_in_Chrome` tools are available for browser control:

- `mcp__Claude_in_Chrome__navigate` — navigate to a URL
- `mcp__Claude_in_Chrome__read_page` — read current page DOM/text
- `mcp__Claude_in_Chrome__get_page_text` — get visible text content
- `mcp__Claude_in_Chrome__find` — find elements on page
- `mcp__Claude_in_Chrome__javascript_tool` — run JS in page (use for reading localStorage, network state, React state)
- `mcp__Claude_in_Chrome__read_network_requests` — inspect network calls (use this to confirm Bug 1 and Bug 2 in the network tab)
- `mcp__Claude_in_Chrome__read_console_messages` — read console errors/warnings
- `mcp__Claude_in_Chrome__computer` — take a screenshot (returns image)
- `mcp__Claude_in_Chrome__form_input` — fill form fields
- `mcp__Claude_in_Chrome__tabs_create_mcp` — open a new tab

**Suggested workflow:**
1. Use `navigate` to go to `http://localhost:3000/dashboard?id={applicantId}`.
2. Wait a few seconds for data to load, then use `computer` to screenshot.
3. Use `read_network_requests` to capture the API responses and confirm bug signatures.
4. Use `javascript_tool` to read React state or localStorage if needed.
5. Scroll down and repeat `computer` to capture each section.

---

## Key File Paths (worktree)

All paths are within:
```
/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/epic-einstein-553ad4/
```

| File | Relevance |
|---|---|
| `frontend/app/dashboard/page.tsx` | Bug 1 at line ~1354 (`customerId` memo); Bug 2 at `loadCashFlow` hook |
| `backend/src/interface/http_endpoints.py` | Bug 2 at line ~2630 (`get_application_transactions` return dict) |
| `backend/src/interface/saltedge_endpoints.py` | `get_connections_for_customer` line 816 (queries by `saltedge_customer_id`) |
| `backend/src/ml/dashboard_adapters.py` | `adapt_open_banking_dashboard_loan_variables` |
| `backend/src/ml/dashboard_snapshot_adapter.py` | `build_dashboard_snapshot_adapter` |
| `scripts/push_dashboard_test_account.py` | Creates test applicants with pre-seeded connected_accounts |
| `scripts/applicants-prod-seed.sh` | Seeds JP + US applicants with full metadata and connected_accounts |
| `platform/deployment/local/docker-compose.yml` | Local docker-compose (frontend + backend + Caddy) |
| `scripts/run-local.sh` | Start script for docker-compose + seed |
| `frontend/.env.local.example` | Frontend env var template |
| `backend/.env.development.example` | Backend env var template |
