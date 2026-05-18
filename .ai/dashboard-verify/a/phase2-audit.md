# Phase 2 Code Audit — Critical Bugs
## Branch: `origin/kapil-potgres`
## Date: 2026-04-29

---

## Bug 1: SaltEdge `customerId` Mismatch

**Verdict: YES — bug exists exactly as described**

### Location
`frontend/app/dashboard/page.tsx` lines 1354–1364

### Problematic Code
```ts
const customerId = useMemo(() => {
  const rawId = application?.id
  if (rawId === undefined || rawId === null) {
    return null
  }

  return typeof rawId === "string" ? rawId : String(rawId)
}, [application?.id])
```

This converts the Postgres integer primary key (e.g. `42`) to the string `"42"`, then uses it at line 1559:

```ts
`${backendApiUrl}/api/saltedge/customer/${customerId}/connections`
```

### Root Cause
`application.id` is the Postgres integer PK from `housing_applications`. SaltEdge customer IDs are provider-assigned strings (e.g. `"SE-1234abc"`) stored in `open_banking_consents.saltedge_customer_id`. These are completely different identifiers.

Confirmed: `_application_to_response` (lines 1197–1254 of `http_endpoints.py`) builds `ApplicationResponse` with no `saltedge_customer_id` field. The field is not exposed to the frontend through the application detail endpoint.

### Is `saltedge_customer_id` Available Elsewhere?
`frontend/app/application/connect-accounts/pageSalt.tsx` does write the real SaltEdge customer ID to localStorage under the key `dw_application_saltedge_customer_id` (line 330 defines the constant; lines 716–717 write it on connection success). However, the dashboard page (`frontend/app/dashboard/page.tsx`) contains **zero references** to `dw_application_saltedge_customer_id` or any `SALTEDGE_CUSTOMER` key. The dashboard does not read this localStorage value at all.

### Effect
The SaltEdge connections panel will call the connections endpoint with a Postgres integer ID string, resulting in a 404 or SaltEdge API error for every applicant. The panel will always render empty with no accounts shown. This is a silent failure (no visible crash; the panel just shows no data due to lines 1568–1573 treating 204/404 as an empty result).

### Severity: **Critical**

### Proposed Fix
In `frontend/app/dashboard/page.tsx`, replace the `customerId` memo that reads from `application?.id` with a lookup from `localStorage.getItem("dw_application_saltedge_customer_id")` (the same key that `pageSalt.tsx` writes). Since the dashboard receives `applicationId` as a query param, a more robust fix is to add a `GET /v1/applications/{id}/saltedge-customer` endpoint that queries `open_banking_consents` by `application_id` and returns the real `saltedge_customer_id`, then have the dashboard fetch that on load.

---

## Bug 2: Missing Adapter Payloads in Transactions Endpoint

**Verdict: YES — bug exists exactly as described**

### Location
- Backend: `backend/src/interface/http_endpoints.py` lines 2630–2677
- Frontend proxy: `frontend/app/api/v1/applicants/[id]/transactions/route.ts` (proxies straight through)
- Frontend consumer: `frontend/app/dashboard/page.tsx` lines 1931–1936

### Problematic Code — Backend Endpoint
```python
@router.get("/v1/applications/{application_id}/transactions")
def get_application_transactions(...):
    ...
    return {
        "applicant_id": application_id,
        "start_date": start_date,
        "end_date": end_date,
        "transactions": combined,
        "total": len(combined),
    }
```
The response contains only `transactions`, `total`, `start_date`, and `end_date`. Neither `dashboard_loan_adapter` nor `dashboard_snapshot_adapter` is included.

### Contrast with Legacy Endpoint
The older `/payments/history` endpoint (lines 3270–3484) does return both adapter keys:
```python
response: Dict[str, Any] = {
    "transactions": transactions,
    "start_date": start_iso,
    "end_date": end_iso,
    "dashboard_loan_adapter": adapt_open_banking_dashboard_loan_variables(transactions),
    "dashboard_snapshot_adapter": build_dashboard_snapshot_adapter(
        application=None,
        transactions=transactions,
    ),
}
```

### Frontend Calls New Endpoint
`frontend/app/dashboard/page.tsx` line 1831 shows the dashboard calls:
```
/api/v1/applicants/${encodeURIComponent(applicationId)}/transactions?start_date=...&end_date=...
```
This routes through `frontend/app/api/v1/applicants/[id]/transactions/route.ts`, which proxies to the backend at:
```
${baseUrl}/api/v1/applications/${encodeURIComponent(trimmedId)}/transactions
```
This is the new endpoint — the one that does **not** include the adapters.

### Frontend Consumption
```ts
const snapshotLoanAdapter = data.dashboard_snapshot_adapter?.loan_metrics  // always undefined
const loanAdapterPayload = snapshotLoanAdapter ?? data.dashboard_loan_adapter  // always undefined
```
Since both fields are absent from the API response, `loanAdapterPayload` is always `undefined`. The `if (loanAdapterPayload)` branch at line 1936 is never entered, so `setLoanAnalysisOverride` is never called with actual data. All loan metric UI panels that depend on `loanAnalysisOverride` will display blank/zero values.

### Severity: **Critical**

### Proposed Fix
Add `dashboard_loan_adapter` and `dashboard_snapshot_adapter` to the `get_application_transactions` return value in `http_endpoints.py`. Import `adapt_open_banking_dashboard_loan_variables` and `build_dashboard_snapshot_adapter` (both are already imported at lines 113 and 115) and call them on the assembled `combined` transaction list before returning:
```python
return {
    "applicant_id": application_id,
    "start_date": start_date,
    "end_date": end_date,
    "transactions": combined,
    "total": len(combined),
    "dashboard_loan_adapter": adapt_open_banking_dashboard_loan_variables(combined),
    "dashboard_snapshot_adapter": build_dashboard_snapshot_adapter(
        application=None,
        transactions=combined,
    ),
}
```

---

## Bug 3: `phone_Number` vs `phone_number` Casing Mismatch

**Verdict: YES — bug exists exactly as described**

### Location
`frontend/app/dashboard/page.tsx` line 2178

### Problematic Code
```ts
phone: typeof dash.phone_Number === "string" ? dash.phone_Number : null,
```

### Pipeline Output Keys
- **SaltEdge pipeline** (`backend/src/ml/scoring/saltedge_bundle/saltedge_processing/saltedge_dashboard_variables.py` line 342 and 366): outputs key `"holder_info_phone"` — not `"phone_Number"`
- **Plaid pipeline** (`backend/src/ml/scoring/plaid_bundle/plaid_processing/plaid_dashboard_variables.py` lines 546, 583): outputs key `"identity_primary_phone"` — not `"phone_Number"`

Neither provider pipeline emits a key named `phone_Number`. The field `dash.phone_Number` will always be `undefined` at runtime, so `phone` in the `v7Data` object will always be `null`.

### Effect
The phone number field is always blank in the dashboard UI, regardless of what the SaltEdge or Plaid pipeline actually produces. This is silent data loss — no error is thrown.

### Severity: **Minor**

### Proposed Fix
The frontend mapping should read the correct pipeline key. Since the dashboard may receive data from either SaltEdge or Plaid, a multi-key lookup is appropriate:
```ts
phone:
  typeof dash.holder_info_phone === "string" ? dash.holder_info_phone :
  typeof dash.identity_primary_phone === "string" ? dash.identity_primary_phone :
  null,
```
Alternatively, normalise the key name in both pipeline outputs to a single agreed name (e.g. `"phone_number"`) and update the frontend accordingly.

---

## Additional Finding: `customerId` Also Used for Wiki and Nav

The `customerId` value derived from `application?.id` is also used in `handleWikiNavigation` (line 1365) and `window.localStorage.setItem("selectedApplicantId", ...)` calls (lines 1386, 1442). For wiki navigation these paths appear to use the application's Postgres ID as a URL param, which may or may not be intentional — but the same incorrect derivation for the SaltEdge connections panel is the confirmed critical bug.

---

## Summary Table

| # | Bug | Confirmed | Severity | File | Lines |
|---|-----|-----------|----------|------|-------|
| 1 | `customerId` is Postgres integer, not SaltEdge string customer ID | YES | Critical | `frontend/app/dashboard/page.tsx` | 1354–1364, 1559 |
| 2 | New `/v1/applications/{id}/transactions` endpoint omits `dashboard_loan_adapter` and `dashboard_snapshot_adapter` | YES | Critical | `backend/src/interface/http_endpoints.py` | 2630–2677 |
| 3 | `dash.phone_Number` never matches pipeline keys (`holder_info_phone` / `identity_primary_phone`) | YES | Minor | `frontend/app/dashboard/page.tsx` | 2178 |

**Merge recommendation: BLOCK.** Both critical bugs confirmed. Bug 1 causes the SaltEdge connections panel to always fail silently. Bug 2 causes all loan metric UI panels to always display blank/zero. Neither is self-healing. Both require targeted code changes before merging to `main`.
