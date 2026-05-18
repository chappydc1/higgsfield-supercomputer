# Applicant Playwright Tests — Deny, Approve, Archive

Playwright E2E tests covering the three applicant decision actions in the admin dashboard:

## What exists

### New tests (applicants-dashboard-dev-tests.spec.ts)
- **Deny applicant from dashboard** — navigates to `/dashboard?id=16`, clicks "Deny Client", asserts "Applicant denied." status message
- **Approve applicant from dashboard** — navigates to `/dashboard?id=16`, clicks "Approve Client", asserts "Applicant approved successfully." status message
- **Archive applicant from dashboard header** — navigates to `/dashboard?id=16`, accepts `window.confirm` dialog, clicks "Archive Applicant", asserts redirect to `/applicants`

### Page object additions (dashboard-page.ts)
- `denyApplicantFromDashboard()` — locate + click Deny Client button, assert success text
- `approveApplicantFromDashboard()` — locate + click Approve Client button, assert success text
- `archiveApplicantFromDashboardHeader()` — register one-time dialog acceptor, click Archive button, assert URL redirect

### CI route mock addition (login-page.ts → ciBypassLogin)
- `POST **/api/v1/applications/*/decision` — returns the mock applicant object with `review_status` reflecting the requested status value

## Decision flow
Deny/approve hits `POST /api/v1/applications/{id}/decision` with `{ status: "denied" | "approved" }`.
The response is a full `BackendApplication` object; the dashboard then renders the status message from `setStatusMessage`.

Archive hits `POST /api/v1/applications/{id}/archive` and redirects to `/applicants` on success.
Archive requires `window.confirm` — handled in tests via `page.once('dialog', ...)`.
