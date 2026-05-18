# Dashboard Adapter Verification — Project Overview

This directory documents the verification and fix effort for the `/dashboard` page's
integration with the SaltEdge and Plaid open-banking pipelines, spanning a code
audit phase and a follow-on implementation fix.

## Context

Branch `kapil-potgres` introduced the complete open-banking scoring pipeline
(SaltEdge + Plaid) for the `/dashboard` page. The pipeline includes new backend
modules (`bank_data_snapshots`, `dashboard_adapters`, `dashboard_snapshot_adapter`,
the full `saltedge_bundle` and `plaid_bundle` scoring modules, and the
`saltedge_endpoints` API surface). All of this infrastructure was merged into
`main` and then carried forward on the `claude/epic-einstein-553ad4` working branch.

## What Was Found

A structured code audit identified three bugs that prevented the dashboard from
rendering pipeline output correctly. All three bugs exist in both `kapil-potgres`
and the working branch; `kapil-potgres` did not fix them.

**Bug 1 — Wrong SaltEdge customer ID (Critical)**
`dashboard/page.tsx` derives `customerId` from `application.id` (the Postgres
integer primary key) and passes it to `GET /api/saltedge/customer/{customerId}/connections`.
SaltEdge customer IDs are provider-assigned strings (e.g. `"SE-1234abc"`) stored
in `open_banking_consents.saltedge_customer_id`. The fix replaces the memo with a
read of `localStorage.getItem("dw_application_saltedge_customer_id")`, which is
written by `connect-accounts/pageSalt.tsx` after a successful SaltEdge link.

**Bug 2 — Adapter payloads missing from transactions endpoint (Critical)**
`GET /v1/applications/{id}/transactions` (`get_application_transactions` in
`http_endpoints.py`) returns only raw transaction rows. The dashboard consumes
`data.dashboard_loan_adapter` and `data.dashboard_snapshot_adapter` from this
response, both of which are always `undefined`. The fix adds two lines to the
`return` dict, calling the already-imported `adapt_open_banking_dashboard_loan_variables`
and `build_dashboard_snapshot_adapter` on the combined transaction list.

**Bug 3 — v7Data useMemo uses wrong field names (Critical)**
The `v7Data` useMemo in `dashboard/page.tsx` read field names that neither the
SaltEdge pipeline nor the Plaid pipeline ever emits. Task c fixed the financial/KPI
fields (bank balance, cash flow, loan balance, etc.) but incorrectly also applied
pipeline-key lookups to the identity fields (fullName, phone, address, employer).

**Bug 3b — v7Data identity fields sourced from pipeline instead of application (Critical)**
The identity fields in the `v7Data` useMemo (`fullName`, `phone`, `address`,
`employer`) were updated by task c to read from pipeline output keys
(`dash.holder_info_full_name`, `dash.holder_info_phone`, etc.). These pipeline
keys are only populated when a credit score has been computed (i.e., after a
successful bank link). The correct source for identity fields is the `application`
object returned by `GET /api/v1/applications/{id}`, which is always available.

The fix (task d) updates `v7Data.fullName`, `v7Data.phone`, `v7Data.address`,
and `v7Data.employer` to read from `application` directly (with pipeline keys
kept as secondary enrichment when available), and adds `application` as a
dependency of the `v7Data` useMemo.

## Identity Fields: Correct Data Sources

The `application` state variable is typed as `ApplicationDetail | null`
(which is `BackendApplication & { connected_accounts: ..., income_history: ... }`).
The relevant identity fields on `BackendApplication` are:

| Display field | `application` property | Notes |
|---|---|---|
| Full name | `application.full_name` | `string`, always present |
| Phone | `application.phone` | `string`, always present |
| Employer | `application.current_employer` | `string | undefined` |
| Address | not a direct field — from `application.metadata` | see metadata keys below |

Address is not a top-level field on `BackendApplication`. The address is stored
in `application.metadata` under keys such as `address_line1`, `street`,
`city`, `region`, `postal_code`, etc. The `customerInformationData` useMemo
(lines 3545–3559) already reads these metadata keys correctly. The pipeline
address fields (`dash.holder_info_address_*`, `dash.identity_street`, etc.)
are a secondary enrichment source when a bank link has been completed.

## Architecture: How Identity Reaches the UI

```
application (ApplicationDetail | null)
  ├─ .full_name          ← always available (from /api/v1/applications/{id})
  ├─ .phone              ← always available
  ├─ .current_employer   ← available when provided during application
  └─ .metadata           ← dict with address_line1, city, region, etc.

v7Data (useMemo over apiScore + application)
  ├─ .fullName   ← application.full_name, enriched by pipeline if score available
  ├─ .phone      ← application.phone, enriched by pipeline if score available
  ├─ .address    ← from metadata keys, enriched by pipeline if score available
  └─ .employer   ← application.current_employer, enriched by pipeline if score available

customerInformationData (useMemo)
  ├─ displayFullName = (v7Data.fullName || null) ?? metadata ?? application.full_name
  ├─ phone       = v7Data.phone ?? metadata ?? application.phone
  ├─ addressLabel = v7Data.address ?? (addressParts from metadata)
  └─ employer    = v7Data.employer ?? metadata ?? application.current_employer
```

## What Was Verified

- All 101 ML unit tests (including `test_dashboard_adapters.py` and
  `test_dashboard_snapshot_adapter.py`) pass on the working branch.
- Migration `006_open_banking_saltedge.sql` is safe to apply to a live database
  with existing Plaid rows.
- The SaltEdge and Plaid submit pull threads correctly write to `bank_data_snapshots`.
- The credit-score endpoint returns `dashboard_vars` and `scorecard_vars` correctly.

## Directory Structure

```
.ai/dashboard-verify/
  about.md          — this file
  a/
    plan.md         — original code audit plan (4 phases)
    summary.md      — audit verdict: BLOCK, 3 critical bugs confirmed
  b/
    plan.md         — screenshot verification plan
  c/
    context.md      — implementation context for fix agent (Bugs 1, 2, 3 financial fields)
  d/
    context.md      — implementation context for fix agent (Bug 3b: identity fields)
```
