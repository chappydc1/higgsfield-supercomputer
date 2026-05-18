# plaid-ekyc

Plaid Identity Verification (eKYC) integrated into the ielove PoC.

## What is built
- **Dashboard KYC result badge**: A compact OK/NG pill badge sits in the top-right of the Credit Information section on the reviewer dashboard. It self-fetches from `GET /api/v1/applications/{id}/kyc-status` and renders nothing when no verification has been run. Clicking the badge opens a dialog with the full Plaid identity verification breakdown: document check, selfie/liveness, watchlist screening, risk score.
- **Two application form variants**: The application flow has an optional eKYC step at `/application/ekyc`. Landlords activate it by appending `?kyc=1` to their application URL. Without that param the form is unchanged. The eKYC step launches Plaid Link (identity verification product), saves the resulting `identity_verification_id` on the application, and lets the applicant skip if Plaid is unavailable.
- **Backend persistence and status**: `PUT /api/v1/applications/{id}/ekyc` stores the Plaid verification ID; `GET /api/v1/applications/{id}/kyc-status` fetches the live result from Plaid and maps it to `ok/ng/pending/none`.
- **DB column**: `plaid_identity_verification_id VARCHAR(64)` on `applications` via idempotent migration 008.

## Files changed
- `backend/migrations/postgres/008_applications_plaid_ekyc.sql`
- `backend/src/infra/postgres/models.py` — `HousingApplicationModel.plaid_identity_verification_id`
- `backend/src/interface/http_endpoints.py` — `PUT /v1/applications/{id}/ekyc`, `GET /v1/applications/{id}/kyc-status`
- `frontend/components/kyc-result-badge.tsx` — `KycResultBadge` component
- `frontend/app/dashboard/page.tsx` — badge integrated next to CreditInformationSection
- `frontend/app/application/ekyc/page.tsx` — Plaid eKYC step
- `frontend/app/application/employment/page.tsx` — `?kyc=1` routing
- `frontend/app/api/applications/[id]/ekyc/route.ts`
- `frontend/app/api/applications/[id]/kyc-status/route.ts`
- `frontend/app/api/v1/applications/[id]/ekyc/route.ts`
- `frontend/app/api/v1/applications/[id]/kyc-status/route.ts`
