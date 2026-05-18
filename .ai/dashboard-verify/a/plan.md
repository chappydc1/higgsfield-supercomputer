## Task
Verify that the `/dashboard` page works correctly with the SaltEdge and Plaid adapters on branch `kapil-potgres`, and identify any bugs or blockers before merging to `main`.

## Approach
The verification is a structured code-audit + test-run plan. We run automated tests first to establish a baseline, then do a targeted bug audit on the five known risk areas identified during pre-read (customer ID mismatch, snapshot adapter inclusion, phone-field casing, adapter key naming, migration safety), then trace both provider data flows end-to-end, and finally produce a merge recommendation.

All code references below are verified against `origin/kapil-potgres` as it exists in this repo. The branch has not been checked out locally; commands use `git show origin/kapil-potgres:<path>` or a local checkout where needed.

---

## Phases

### Phase 1: Run automated tests

Steps:

1. Check out the branch locally so pytest can run against it:
   ```bash
   git fetch origin kapil-potgres
   git worktree add /tmp/kapil-verify origin/kapil-potgres
   cd /tmp/kapil-verify
   ```

2. Install backend dependencies and run the adapter unit tests:
   ```bash
   cd backend
   pip install -r requirements.txt -q
   python -m pytest tests/ml/test_dashboard_adapters.py tests/ml/test_dashboard_snapshot_adapter.py -v
   ```
   Expected: all tests pass. Both files exist in the branch (`backend/tests/ml/`). Key assertions to check:
   - `test_dashboard_adapters.py` covers `adapt_open_banking_dashboard_loan_variables` (zeroed case, full mapping).
   - `test_dashboard_snapshot_adapter.py` covers `build_dashboard_snapshot_adapter` returning all six section keys (`loan_metrics`, `risk_metrics`, `housing_metrics`, `cashflow_metrics`, `bureau_metrics`, `profile_metrics`).

3. Run any other backend tests related to saltedge / plaid:
   ```bash
   python -m pytest tests/ -k "saltedge or plaid or snapshot or dashboard" -v
   ```
   Document each failure with full traceback.

4. Run frontend type-checking from the branch root:
   ```bash
   cd frontend
   npm ci --silent
   npx tsc --noEmit 2>&1 | head -100
   ```
   The dashboard page is `frontend/app/dashboard/page.tsx`. Any type errors in the adapter-consumption block (around lines 1852–1936) are relevant.

5. Document all test failures and type errors before proceeding.

---

### Phase 2: Code audit — critical bugs

Steps:

1. **Bug: `customerId` derived from `application.id` (Postgres integer) but endpoint queries by SaltEdge string customer ID**

   Location: `frontend/app/dashboard/page.tsx` lines 1354–1362.

   The current code:
   ```ts
   const customerId = useMemo(() => {
     const rawId = application?.id
     if (rawId === undefined || rawId === null) return null
     return typeof rawId === "string" ? rawId : String(rawId)
   }, [application?.id])
   ```
   This converts the Postgres integer `application.id` (e.g. `42`) to the string `"42"`.

   This value is then used at line ~1559 to call:
   ```
   GET /api/saltedge/customer/${customerId}/connections
   ```
   The SaltEdge `/saltedge/customer/{customer_id}/connections` endpoint in `backend/src/interface/http_endpoints.py` (lines 2942–3039) passes `customer_id` directly to `saltedge_client.list_connections(customer_id)`. SaltEdge customer IDs are provider-assigned strings (e.g. `"SE-1234abc"`), not Postgres integer IDs. Passing `"42"` will result in a 404 or SaltEdge API error for every real applicant.

   Verify: check whether `saltedge_customer_id` is ever returned to the frontend in the application detail response (`_application_to_response` in `http_endpoints.py` lines 1197–1254). Result: it is **not** — `ApplicationResponse` does not include `saltedge_customer_id`. There is no `saltedge_customer_id` column on the `housing_applications` table; it lives on `open_banking_consents.saltedge_customer_id`.

   Action: confirm whether there is an alternative endpoint (e.g. a per-application consents list) that could supply the real SaltEdge customer ID to the dashboard, and document whether the SaltEdge connections panel will silently return empty or throw a visible error.

2. **Check if `saltedge_customer_id` is available from any other source (localStorage, applicant payload)**

   Search `frontend/app/dashboard/page.tsx` for `saltedge_customer_id` and `localStorage`. Also check if the SaltEdge persist endpoint response (`SaltEdgePersistConnectionResponse`) stores the customer ID somewhere accessible after the connect-accounts flow (i.e. does the connect-accounts page write it to localStorage so the dashboard can read it back?).

   Also check `backend/src/interface/saltedge_endpoints.py` around line 639: the `/persist` endpoint does return `saltedge_customer_id` in its response — verify whether the `connect-accounts` page (or the SaltEdge callback flow) stores this in localStorage and under what key.

3. **Verify whether `dashboard_snapshot_adapter` is included in the new per-application transactions endpoint**

   There are two separate transactions endpoints on `kapil-potgres`:

   a. **New endpoint** (lines 2631–2676 in `http_endpoints.py`):
      ```
      GET /v1/applications/{application_id}/transactions
      ```
      This is the endpoint the dashboard uses (called with `application.id`). Its response body is:
      ```json
      { "applicant_id": ..., "transactions": [...], "total": ..., "start_date": ..., "end_date": ... }
      ```
      **It does NOT include `dashboard_loan_adapter` or `dashboard_snapshot_adapter`.**

   b. **Older Plaid/SaltEdge payment-history endpoint** (around line 3290 in `http_endpoints.py`):
      ```
      POST /payments/history
      ```
      This endpoint does include both adapter payloads in its response.

   Verify which URL the dashboard frontend actually calls to get transaction/adapter data. Check `frontend/app/dashboard/page.tsx` around line 1805 and lines 1852–1936 where `dashboard_loan_adapter` and `dashboard_snapshot_adapter.loan_metrics` are consumed. If the dashboard fetches `/v1/applications/{id}/transactions`, neither adapter payload will be present and both will silently be `undefined`, leaving all loan metric UI fields blank.

4. **Check `phone_Number` vs `phone_number` field casing mismatch**

   In `frontend/app/dashboard/page.tsx` line 2178:
   ```ts
   phone: typeof dash.phone_Number === "string" ? dash.phone_Number : null,
   ```
   The `v7Dashboard` object (`apiScore.dashboard`) is populated from `score.dashboard_vars` in the credit-score endpoint (line 2453 of `http_endpoints.py`). `dashboard_vars` is built by the SaltEdge pipeline (`saltedge_dashboard_variables.py`), which outputs `holder_info_phone` (line 366), **not** `phone_Number`.

   Result: `dash.phone_Number` will always be `undefined`, so the phone field will always render as `null` regardless of what the pipeline produces. This is a silent data loss bug, not a crash. Confirm by grepping the full pipeline output spec (lines 340–380 of `saltedge_dashboard_variables.py`) for any key named `phone_Number`.

   Also check whether the Plaid pipeline (`plaid_dashboard_variables.py`) outputs a field named `phone_Number`. Plaid outputs `identity_primary_phone` (line 583), again not `phone_Number`.

5. **Check `dashboard_loan_adapter` vs `dashboard_snapshot_adapter.loan_metrics` key naming**

   In `frontend/app/dashboard/page.tsx` lines 1935–1936:
   ```ts
   const snapshotLoanAdapter = data.dashboard_snapshot_adapter?.loan_metrics
   const loanAdapterPayload = snapshotLoanAdapter ?? data.dashboard_loan_adapter
   ```
   The TypeScript interface at lines 1852–1863 defines both keys:
   ```ts
   dashboard_loan_adapter?: { ... }
   dashboard_snapshot_adapter?: { loan_metrics?: { ... }, ... }
   ```
   The older `/payments/history` endpoint returns **both keys** in its response. The new `/v1/applications/{id}/transactions` returns **neither**. The fallback chain `snapshotLoanAdapter ?? data.dashboard_loan_adapter` is correct for the older endpoint but will always produce `undefined` if the dashboard is using the newer endpoint. Confirm which endpoint is used.

---

### Phase 3: Integration data flow verification

Steps:

1. **Trace SaltEdge data flow end-to-end**

   Map each step in the code:
   - `POST /api/saltedge/connect-session` → creates SaltEdge customer + returns connect URL (`saltedge_endpoints.py`)
   - User completes OAuth in SaltEdge widget → SaltEdge redirects back
   - `POST /api/saltedge/persist` → stores `open_banking_consents` row with `saltedge_customer_id`, `saltedge_connection_id` (lines 606–639 of `saltedge_endpoints.py`)
   - `POST /api/saltedge/customer/{customer_id}/sync` → calls `list_connections`, syncs accounts (lines 649+ of `saltedge_endpoints.py`)
   - `POST /v1/applications/{id}/submit` → triggers `_kick_off_saltedge_submit_pull` in `http_endpoints.py` (lines 166–202), which reads live consents from `open_banking_consents` and calls `run_submit_saltedge_pull`
   - `run_submit_saltedge_pull` → writes `bank_data_snapshots` rows (source=`"saltedge"`, product_type=`"transactions"`)
   - `GET /v1/applications/{id}/credit-score` → `get_or_compute_score` reads `bank_data_snapshots`, runs SaltEdge bundle, returns `score.dashboard_vars`
   - `GET /v1/applications/{id}/transactions` → reads `bank_data_snapshots`, runs `_normalise_saltedge_transactions`, returns transaction list (no adapters)

   Key question: does the dashboard call credit-score and transactions separately, or does it call the older `/payments/history` endpoint? Trace the fetch calls in `page.tsx`.

2. **Trace Plaid data flow end-to-end**

   - `GET /link_token` → creates Plaid Link token
   - User completes Plaid Link → frontend gets `public_token`
   - `POST /exchange-token` → exchanges for `access_token`, stores in `open_banking_consents` (provider=`"plaid"`)
   - `POST /v1/applications/{id}/submit` → triggers `_kick_off_plaid_submit_pull` (lines 131–161), reads consents, calls `run_submit_plaid_pull`
   - `run_submit_plaid_pull` → writes `bank_data_snapshots` rows (source=`"plaid"`)
   - `GET /v1/applications/{id}/credit-score` → reads snapshots, runs Plaid bundle
   - `GET /v1/applications/{id}/transactions` → reads snapshots, runs `_normalise_plaid_transactions`

3. **Verify the new transactions endpoint returns both provider data**

   In `get_application_transactions` (lines 2631–2676), the code iterates `snap_repo.list_latest_for_user(application_id)` and handles `source == "plaid"` and `source == "saltedge"` branches. Confirm:
   - `list_latest_for_user` queries by `application_id` — does it filter by provider or return both?
   - Both `_normalise_plaid_transactions` and `_normalise_saltedge_transactions` are called in the same loop
   - The combined array is returned as `"transactions"` with no adapter data attached

4. **Verify whether the frontend reads adapter data from the right endpoint**

   In `frontend/app/dashboard/page.tsx`, locate every `fetch(` call that contains `"transactions"` or `"payments/history"` or `"dashboard_loan_adapter"`. Determine:
   - Which URL is called to populate `data.dashboard_loan_adapter` and `data.dashboard_snapshot_adapter`
   - Whether the adapter fallback `snapshotLoanAdapter ?? data.dashboard_loan_adapter` can ever be non-null given the actual endpoint used

5. **Check migration 006 for risk to existing Plaid rows**

   `backend/migrations/006_open_banking_saltedge.sql` runs these on `open_banking_consents`:
   ```sql
   ALTER TABLE open_banking_consents ADD COLUMN IF NOT EXISTS provider VARCHAR(32) NOT NULL DEFAULT 'plaid';
   ALTER TABLE open_banking_consents ALTER COLUMN consent_reference DROP NOT NULL;
   ALTER TABLE open_banking_consents ALTER COLUMN expires_at DROP NOT NULL;
   ALTER TABLE open_banking_consents ALTER COLUMN scopes DROP NOT NULL;
   ```
   Risks:
   - `DEFAULT 'plaid'` on `provider` is safe — existing rows get tagged as Plaid automatically.
   - Dropping `NOT NULL` on `consent_reference`, `expires_at`, `scopes` is safe for existing Plaid rows (they already have values). New SaltEdge rows can omit them.
   - The unique index on `saltedge_connection_id WHERE saltedge_connection_id IS NOT NULL` will not affect existing Plaid rows (their `saltedge_connection_id` is NULL).
   - Confirm there are no existing `NOT NULL` constraints in the original schema that would prevent new SaltEdge rows from inserting.

---

### Phase 4: Final assessment

Steps:

1. **Summarise all bugs found, classified as critical or minor**

   Expected findings based on pre-read:

   | # | Issue | Severity | Location |
   |---|-------|----------|----------|
   | 1 | `customerId` is Postgres integer ID, not SaltEdge string customer ID — SaltEdge connections panel will always fail | Critical | `frontend/app/dashboard/page.tsx:1354-1362` |
   | 2 | New `/v1/applications/{id}/transactions` endpoint does not return `dashboard_loan_adapter` or `dashboard_snapshot_adapter` — all loan metric panels will be blank | Critical | `backend/src/interface/http_endpoints.py:2631-2676` |
   | 3 | `dash.phone_Number` never matches pipeline output key (`holder_info_phone` for SaltEdge, `identity_primary_phone` for Plaid) — phone always `null` | Minor | `frontend/app/dashboard/page.tsx:2178` |
   | 4 | Migration 006 drops NOT NULL on `consent_reference`/`expires_at`/`scopes` — appears safe but needs confirmation against production schema | Low | `backend/migrations/006_open_banking_saltedge.sql` |

2. **Determine if the branch is safe to merge**

   Apply the merge/no-merge rule: if any Critical issue is confirmed, block the merge. Minor issues should be documented and triaged but need not block if they don't cause crashes or data loss visible to the user.

3. **List blockers vs nice-to-have**

   Blockers (must fix before merge):
   - Issue #1: SaltEdge customer ID mismatch. Fix: expose `saltedge_customer_id` from the application record (e.g. via a consents lookup endpoint), store it during the connect-accounts flow in localStorage, and read it in the dashboard. Alternatively, add a `GET /v1/applications/{id}/saltedge-customer` endpoint that queries `open_banking_consents`.
   - Issue #2: Missing adapter payloads on new transactions endpoint. Fix: either add `dashboard_loan_adapter` and `dashboard_snapshot_adapter` to the `GET /v1/applications/{id}/transactions` response, or make the dashboard fetch the older `/payments/history` endpoint (or a new dedicated adapter endpoint) separately.

   Nice-to-have (non-blocking):
   - Issue #3: Rename `phone_Number` → `holder_info_phone` in the frontend `v7Data` mapping, or rename the pipeline output key to `phone_Number` for clarity.
   - Issue #4: Add a comment to migration 006 confirming it is idempotent on existing rows.

4. **Produce final recommendation**

   After completing Phases 1–3, write one of:
   - **Block merge** — list the confirmed critical bugs and the minimal fix required per bug.
   - **Conditional merge** — merge is safe if specific minor fixes are applied first.
   - **Approve merge** — all issues are either non-existent or non-blocking.

   Record findings in `.ai/dashboard-verify/a/summary.md` using this structure:
   ```
   ## Verdict: [BLOCK / CONDITIONAL / APPROVE]
   ## Critical bugs confirmed: [list or "none"]
   ## Minor issues: [list or "none"]
   ## Recommendation: [one paragraph]
   ```

---

## Status
- [x] Phase 1: Automated tests
- [x] Phase 2: Code audit — critical bugs
- [x] Phase 3: Integration data flow verification
- [x] Phase 4: Final assessment
