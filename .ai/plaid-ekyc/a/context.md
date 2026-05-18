# Plaid eKYC — Context

## Task
Implement Plaid eKYC for the ielove PoC:
1. KYC result box (OK/NG) on the reviewer dashboard, next to the score section, clickable for details
2. Two application form variants: `?kyc=1` activates Plaid identity verification step; without it, the form skips KYC

## What already exists (do not rebuild)
- **Plaid identity verification link token** endpoint: `POST /create_link_token_id_verification` in `backend/src/interface/http_endpoints.py:3543`
- **Plaid identity verification status** endpoint: `GET /identity_verification_status/{id}` in `backend/src/interface/http_endpoints.py:3556`
- **Frontend KYC status page**: `frontend/app/kyc/page.tsx` — full status viewer showing Plaid verification results
- **Frontend API routes**: `frontend/app/api/kyc/route.ts` (POST, creates link token) and `frontend/app/api/kyc/[verificationId]/route.ts` (GET, status)
- **KYC screen component**: `frontend/components/kyc-screen.tsx` — mock visual (not wired to real Plaid, used in dashboard)
- **PlaidLinkButton**: `frontend/app/application/PlaidLinkButton.tsx` — uses `react-plaid-link` for bank account connection (NOT eKYC)
- **`CanonicalIdentityProfileModel`**: `backend/src/infra/postgres/models.py:154` — has `kyc_status`, `kyc_provider`, `kyc_checked_at` fields

## What is MISSING (must build)
1. **DB column**: `plaid_identity_verification_id VARCHAR(64)` on `applications` table — currently absent from `HousingApplicationModel` (`backend/src/infra/postgres/models.py:196`) and no migration
2. **Backend save endpoint**: `PUT /v1/applications/{id}/ekyc` — saves `verification_id` to the applications row
3. **Backend KYC status endpoint**: `GET /v1/applications/{id}/kyc-status` — looks up `plaid_identity_verification_id`, calls Plaid, returns `{ status: "ok"|"ng"|"pending"|"none", details: {...} }`
4. **Frontend proxy routes**: `/api/v1/applications/[id]/ekyc` (PUT) and `/api/v1/applications/[id]/kyc-status` (GET)
5. **`KycResultBadge` component**: compact OK/NG badge, clickable to open a details drawer/dialog — to be placed next to the score section in the dashboard
6. **Dashboard integration**: render `KycResultBadge` in `frontend/app/dashboard/page.tsx` after the `CreditInformationSection` (or beside it) — only when application has a `plaid_identity_verification_id`
7. **Application form KYC step**: in the application flow, when `?kyc=1` URL param is present, inject a Plaid eKYC step (use `usePlaidLink` with the identity verification token from `/api/kyc`) — after signup/passcode, before connect-accounts. When completed, call the save endpoint.

## Key file paths
- Backend model: `backend/src/infra/postgres/models.py` (HousingApplicationModel at line 196)
- Backend endpoints: `backend/src/interface/http_endpoints.py`
- Backend KYC usecase: `backend/src/usecase/kyc.py`
- Backend KYC gateway: `backend/src/domain/kyc_gateway.py`
- Backend PlaidKycGateway impl: `backend/src/infra/external_apis/plaid_client.py`
- Migrations dir: `backend/migrations/postgres/`
- Dashboard page: `frontend/app/dashboard/page.tsx` (7818 lines)
- Dashboard components: `frontend/app/dashboard/components/`
- Application form entry: `frontend/app/application/page.tsx`
- Application signup: `frontend/app/application/signup/page.tsx`
- Application connect-accounts: `frontend/app/application/connect-accounts/page.tsx`
- Application layout: `frontend/app/application/layout.tsx`
- Frontend API applications: `frontend/app/api/v1/applications/[id]/` (check for existing routes)

## Plaid eKYC flow (application form)
1. User visits `/application?kyc=1` → after auth (passcode), before connect-accounts, show KYC step
2. KYC step: call `POST /api/kyc` with `{ applicationId }` → get `{ linkToken }` → open Plaid Link with `linkToken` (identity verification mode)
3. On Plaid `onSuccess`, `metadata.link_session_id` is the verification session. The verification_id comes from `metadata.transfer.id` or must be fetched via Plaid API. In Plaid IDV flow, `onSuccess` callback receives `{ public_token, metadata }` but for identity verification it may just return the `identity_verification_id` directly in metadata.
4. Call `PUT /api/v1/applications/{id}/ekyc` with `{ verification_id }` to persist

## Plaid onSuccess for identity verification
For Plaid Identity Verification (not bank link), `usePlaidLink` `onSuccess` is called with `(public_token, metadata)` where `metadata` contains `link_session_id`. The `identity_verification_id` is typically stored in the verification payload returned by the create link token call (it's pre-created). Check `data.verification.id` from the POST /api/kyc response.

## Dashboard KYC result box design (from Yoshi)
- Display box showing just "OK" or "NG" 
- Placed next to the score section
- When clicked: shows detailed OK/NG background based on info from Plaid
- Only shown when `plaid_identity_verification_id` is set on the application

## KYC OK/NG mapping from Plaid
- Plaid `identity_verification` status: `"success"` → OK; `"failed"`, `"abandoned"` → NG; `"pending_review"`, `"active"` → Pending
- Overall status field from Plaid: `status` on the verification object
