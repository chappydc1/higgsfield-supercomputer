## Task
Take screenshots of the /dashboard page to visually verify adapter data (SaltEdge and Plaid), showing both what works and what's broken.

## Approach
Use mcp__Claude_in_Chrome browser tools to navigate the dashboard and capture screenshots. If the dev server is not already running, attempt to start it first.

## Background: Known Bugs from Prior Audit
The prior code audit (`.ai/dashboard-verify/a/summary.md`) identified three critical bugs that will be visible in the screenshots:

- **Bug 1** — SaltEdge connections panel will always be empty/errored because `customerId` is derived from the Postgres integer PK (`application.id`, e.g. `"42"`) instead of the SaltEdge provider string ID (e.g. `"SE-1234abc"`). The real customer ID is stored in `open_banking_consents.saltedge_customer_id` and written to `localStorage` by `connect-accounts/pageSalt.tsx`, but `dashboard/page.tsx` never reads it.
- **Bug 2** — All loan metric panels (loan balance, repayment period, delays, late payments, default flags, secured/unsecured split) will be blank because the `GET /v1/applications/{id}/transactions` endpoint does not return `dashboard_loan_adapter` or `dashboard_snapshot_adapter`. Both adapter payloads are silently `undefined` on every response.
- **Bug 3** — Identity fields (name, phone, address, employer), balance/cashflow KPI tiles, housing capacity, repayment burden, mortgage section, and salary fields will render null/zero because the `v7Data` useMemo in `dashboard/page.tsx` uses legacy bare field names (e.g. `dash.full_name`, `dash.phone_Number`, `dash.current_Address`) that neither the SaltEdge pipeline nor the Plaid pipeline ever emits.

Screenshots should confirm which sections show real data vs. blank/zero/error.

---

## Implementation Steps

### Phase 1: Verify dev server and navigate to dashboard

1. Use `mcp__Claude_in_Chrome__navigate` to try `http://localhost:3000`. Observe whether the page loads or returns a connection error.
2. If not running, start the frontend dev server in the background:
   ```bash
   cd frontend && npm run dev
   ```
   Wait ~15 seconds, then retry navigation to `http://localhost:3000`.
3. Check `http://localhost:8000/docs` or `http://localhost:8000/health` to determine whether the backend API is reachable.
4. If the backend is not running, note this in findings. The frontend will still load; API errors will be visible in the UI and screenshots.
5. Take an initial screenshot of whatever loads at `http://localhost:3000` to record the baseline state.

### Phase 2: Find a test applicant and navigate to dashboard

1. Navigate to `http://localhost:3000/applicants` (or the root `/` if that redirects to the applicants list).
2. If an auth wall is presented, check:
   - Whether `DEV_AUTH_BYPASS=true` is set in the environment (from `docker-compose`).
   - Whether there is a dev login form with a test user (e.g. `test@example.com` / `password`).
   - Take a screenshot of the auth page if blocked.
3. Once past auth, locate the seeded test applicants:
   - A JP-locale applicant wired to SaltEdge (seeded by the `seed_test_applicants` task).
   - A US-locale applicant wired to Plaid.
   - Use `mcp__Claude_in_Chrome__get_page_text` to read applicant IDs from the list page.
4. Note the numeric ID for each test applicant (e.g. `42`).
5. Navigate to `http://localhost:3000/dashboard?id={applicantId}` for the SaltEdge applicant first.
6. Wait for the page to finish loading (observe spinners / skeleton states resolving). Take a screenshot immediately after load and again after 3–5 seconds if data is still loading.

### Phase 3: Capture screenshots of all key sections

For each section below, scroll to it (using `mcp__Claude_in_Chrome__javascript_tool` with `window.scrollTo` or keyboard shortcuts) and take a screenshot. Label each screenshot with the section name and the applicant type (SaltEdge or Plaid).

**SaltEdge applicant (`/dashboard?id={saltEdgeId}`):**

1. **Full page overview** — scroll to top, full-page screenshot showing all KPI tiles and the page header. Expected: KPI tiles blank/zero due to Bug 3.
2. **Bank balance / financial highlights** — the balance tile area. Expected: blank or zero due to Bug 3 (`dash.bank_Balance_checking_saving_accounts` is a mismatched key).
3. **Loan analysis / loan composition** — the loan donut chart and loan metric cards. Expected: blank because `dashboard_loan_adapter` is absent from the transactions endpoint (Bug 2). Note: fields like `total_loan_balance` and `balance_of_credit_card_overdraft` DO match the pipeline output, so they may populate if Bug 2 is fixed.
4. **Cash flow / income trend** — the cash flow chart or monthly income section. Expected: blank/zero due to Bug 3 key mismatches.
5. **SaltEdge connections panel** — the section showing connected bank accounts via SaltEdge. Expected: empty or showing an error/spinner because Bug 1 causes every `/api/saltedge/customer/${customerId}/connections` call to fail with a 404 or SaltEdge API error.
6. **Housing payment history** — the payment history table. Document whether rows are present.
7. **Credit score / scorecard** — the score ring and scorecard breakdown. Document the displayed score value and which sub-fields are populated vs. blank.
8. **Browser console / network errors** — use `mcp__Claude_in_Chrome__read_console_messages` to capture any API errors, 404s, or JavaScript exceptions. In particular, look for the `/api/saltedge/customer/42/connections` call and its HTTP status.
9. **Network requests** — use `mcp__Claude_in_Chrome__read_network_requests` to list all XHR/fetch calls made during dashboard load. Note the URLs and status codes for `/transactions`, `/credit-score`, and `/saltedge/customer/.../connections`.

**Plaid applicant (`/dashboard?id={plaidId}`):**

10. Navigate to the Plaid test applicant's dashboard. Repeat screenshots 1–7 for the Plaid applicant to compare. Expected: same Bug 2 and Bug 3 symptoms (different field names in Plaid pipeline vs. the `v7Data` mapping), but Bug 1 does not apply (no SaltEdge connections panel call for Plaid applicants).

### Phase 4: Report findings

1. For each screenshot, annotate whether the section shows real data, blank/zero, or an error, cross-referencing the known bugs:
   - Sections blank due to Bug 1: SaltEdge connections panel.
   - Sections blank due to Bug 2: all loan metric panels (loan balance, repayment period, delays, late payments, secured/unsecured split).
   - Sections blank due to Bug 3: identity fields, balance KPI tiles, cashflow tiles, housing capacity, mortgage section, salary.
   - Sections that should work correctly (not affected by any of the three bugs): credit score ring (if the scoring endpoint responds), housing payment history (if backend is up), loan composition counts (`total_loan_accounts`, `no_of_secured_loan`, etc. — these field names DO match the pipeline output).
2. Confirm that the `/api/saltedge/customer/42/connections` call appears in the network log and returns a non-200 status (confirming Bug 1 is observable in production).
3. Note any additional errors or blank sections not covered by the known bugs — these may indicate new issues or infrastructure problems (e.g. backend not running, missing env vars, seeded applicants absent).
4. Write a concise findings summary at the end of this document (or a separate `findings.md`) covering:
   - Which bugs were visually confirmed.
   - Which sections rendered data correctly.
   - Any unexpected issues discovered.

---

## Notes
- The mcp__Claude_in_Chrome tools available: `navigate`, `read_page`, `computer` (for screenshots), `find`, `get_page_text`, `read_console_messages`, `read_network_requests`, `javascript_tool`.
- If the server cannot be started (e.g. missing node_modules or port conflict), take screenshots of any error pages or terminal output to document the failure.
- Auth may block access. If `DEV_AUTH_BYPASS=true` is not set and no test credentials are available, record the auth block in a screenshot and attempt to find credentials in `.env.local`, `docker-compose.yml`, or `AGENTS.md`.
- For scrolling to specific sections, prefer `mcp__Claude_in_Chrome__javascript_tool` with `document.querySelector('[data-section="..."]')?.scrollIntoView()` or `window.scrollBy(0, N)`.
- If applicant IDs differ from `42`, update all URL examples accordingly.

---

## Status
Phases: 4
- [ ] Phase 1: Verify server and initial load
- [ ] Phase 2: Navigate to dashboard
- [ ] Phase 3: Capture screenshots
- [ ] Phase 4: Report findings

---

Assessed: yes
