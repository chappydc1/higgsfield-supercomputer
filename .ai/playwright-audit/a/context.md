# Platform Playwright Audit — Context

This document is the canonical reference for implementing new Playwright tests
against the Lita eHousing platform. It is exhaustive — a cold agent should be
able to write coverage from this single file without reading source code.

Repo root: `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/hungry-keller-8a0314`

---

## Frontend Pages & Routes

Every `frontend/app/**/page.tsx` and the URL pattern it serves. Where a layout
exists, it is listed beneath the route group. All `*Layout.tsx` files in
`frontend/app/**/layout.tsx` are documented at the bottom of this section.

| URL pattern | page.tsx path | Purpose |
|---|---|---|
| `/` | `frontend/app/page.tsx` | Server redirect to `/login` |
| `/login` | `frontend/app/login/page.tsx` | Auth0 entry. Server-side: if no `auth0_success` / `auth0_error` query, redirects to `/api/auth/auth0/login`. Otherwise renders `LoginPage` (callback handler). |
| `/register` | `frontend/app/register/page.tsx` | Local register form (lita user agreement, password requirements). Client component. |
| `/forgot-password` | `frontend/app/forgot-password/page.tsx` | Email-only password reset form. Client component, optimistic confirmation UI. |
| `/applicants` | `frontend/app/applicants/page.tsx` | Admin/realtor "Applicants Overview" — table with search, nationality filter, Export CSV, Delete all, status sort, KYC/credit-score columns. Heavy client component using `useAuth`, role checks, and backend application list. |
| `/applications` | `frontend/app/applications/page.tsx` | Realtime applications queue with KPIs. Server component using Suspense + `<DashboardKpis />` and `<ApplicationsTable />` from `components/applications`. |
| `/dashboard` | `frontend/app/dashboard/page.tsx` | Applicant detail dashboard at `?id=<n>`. Renders financial snapshot (Total Assets, Average Cash Flow 3 Years, Bank Balance, Employment Information), credit-score modal, persona attributes, outstanding debt, housing payment history. Heavy client component. Reads `/api/v1/applications/{id}`, `/api/v1/applicants/{id}/transactions` (alias), `/api/v1/applicants/{id}/account-coverage`, `/api/applications/{id}/credit-score`. |
| `/dashboard/mission-control` | `frontend/app/dashboard/mission-control/page.tsx` | Server redirect to `/mission-control` |
| `/mission-control` | `frontend/app/mission-control/page.tsx` | Consent / use-case dashboard (lending, rental, fraud, payroll). Demo-style UI showing consent keys with use-case labels. Client component, no backend calls. |
| `/aml` | `frontend/app/aml/page.tsx` | AML assessment screen with match/no-match/pending statuses, Google + identity badges. Demo client component. |
| `/applicants` (loading) | `frontend/app/applicants/loading.tsx` | Loading skeleton |
| `/connect-accounts` | `frontend/app/connect-accounts/page.tsx` | Re-export of `app/application/connect-accounts/page.tsx` — same UI, different route. |
| `/corporate-overview` | `frontend/app/corporate-overview/page.tsx` | Recharts-driven company financial overview — bars, KPIs. Client component using `useAuth`. |
| `/kyc` | `frontend/app/kyc/page.tsx` | KYC verification status page (Verified / Pending / No-Verify / Clear / Match Found). Client component. |
| `/wiki` | `frontend/app/wiki/page.tsx` | Server component. Loads `WikiScreenContainer` with applicant profile from `loadClientWikiProfile`. Supports `?id=...&dashboardVariant=jp&profileLocale=ja`. |
| `/phone-application` | `frontend/app/phone-application/page.tsx` | Phone-only application entry flow (Plaid + SaltEdge connection wizard with payment history viewer). Client component. |
| `/sentry-example-page` | `frontend/app/sentry-example-page/page.tsx` | Server redirect to `/` (placeholder for Sentry sample) |
| **Application onboarding flow** | | |
| `/application` | `frontend/app/application/page.tsx` | Application gate. Choose-or-login with email pre-fill from `?email=...&login=1`. Validates email; navigates to `/application/login-verify?email=...`. |
| `/application/signup` | `frontend/app/application/signup/page.tsx` | Step 1: phone + name + country code + privacy/user agreement consents. POSTs draft to `/api/applications/draft`. |
| `/application/passcode` | `frontend/app/application/passcode/page.tsx` | Step 2: 6-digit OTP. POSTs `/api/v1/applications/otp` (auto-send) and `/api/v1/applications/verify-passcode`. Persists `dw_application_otp_*` localStorage keys. |
| `/application/login-verify` | `frontend/app/application/login-verify/page.tsx` | OTP-based login for returning applicants. Sends OTP, verifies, then routes to existing application or shows `not_found` / `submitted` resume states. |
| `/application/employment` | `frontend/app/application/employment/page.tsx` | Step 3: Country of citizenship dropdown (typeahead from `countries-list/minimal/countries.en.min`), employment type tabs (Full-time, Self-employed, Business owner, Retired, Other). |
| `/application/connect-accounts` | `frontend/app/application/connect-accounts/page.tsx` | Step 4: Bank linking. Dispatcher — picks `pagePlaid.tsx` for US/CA, otherwise `pageSalt.tsx` (SaltEdge v6). Stores `dw_application_connected_accounts` and `_version` in localStorage. |
| `/application/connect-later` | `frontend/app/application/connect-later/page.tsx` | "Skip for now" intermediate page that builds a return-to-connect URL preserving query string (email/country/showBusiness/provider). |
| `/application/review` | `frontend/app/application/review/page.tsx` | Step 5: Review form. Reads localStorage (connected accounts, `userFormData`, salt-edge customer id, category overrides). On submit, generates `dw_application_reference = AP_xxxxxxx`. POSTs to `/api/v1/applications`. |
| `/application/confirm` | `frontend/app/application/confirm/page.tsx` | Step 6: "Application Submitted!" success page showing `Lita ID:` and submission date. Reads `dw_application_reference` from localStorage. |
| `/auth/post-login` | `frontend/app/auth/post-login/page.tsx` | Server redirect to `/dashboard` |

### Layouts (`frontend/app/**/layout.tsx`)

| Layout | Path |
|---|---|
| Root | `frontend/app/layout.tsx` (Auth0AppProvider, AuthProvider, ThemeProvider, AmplitudeClient, force-dynamic) |
| Application root | `frontend/app/application/layout.tsx` |
| Application/confirm | `frontend/app/application/confirm/layout.tsx` |
| Application/connect-accounts | `frontend/app/application/connect-accounts/layout.tsx` |
| Application/employment | `frontend/app/application/employment/layout.tsx` |
| Application/review | `frontend/app/application/review/layout.tsx` |
| Applicants | `frontend/app/applicants/layout.tsx` |
| Dashboard | `frontend/app/dashboard/layout.tsx` |
| Phone application | `frontend/app/phone-application/layout.tsx` |
| Register | `frontend/app/register/layout.tsx` |

---

## Existing Playwright Specs

Test files live in `frontend/eHousing_Web/tests/testcases/`. The Playwright
config matches `e2e/**/*.spec.ts` and `eHousing_Web/tests/**/*.spec.ts`. There
is currently no `e2e/` directory — all tests live under
`eHousing_Web/tests/testcases/`.

### `frontend/eHousing_Web/tests/testcases/applicants-dev-tests.spec.ts`

Suite: `Applicants | DEV | E2E`. Auth via `loginToApplicantsPortal()` which in
CI uses `ciBypassLogin()` (cookies + localStorage + route mocks for
`/api/applications`, `/api/v1/applications/*`).

| Test title | Coverage |
|---|---|
| `[Applicants][DEV][E2E][Regression] Login` | Loads `/`, logs in, lands on `/applicants`, opens Ayaka Inoue, asserts heading "Applicants Overview". |
| `[Applicants][DEV][E2E][Regression] Archive applicant` | Login then opens any applicant profile, clicks "Archive Applicant" header button. |

### `frontend/eHousing_Web/tests/testcases/applicants-prod-tests.spec.ts`

Suite: `Applicants | PROD | E2E`. Auth via `loginToProdApplicantPortal` →
`prodBypassLogin` (cookies + localStorage + route mocks for production domain
`https://ehousing.joinlita.com`).

| Test title | Coverage |
|---|---|
| `[Applicants][PROD][E2E][Regression] Applicants overview page is displayed` | Verifies prod URL pattern + heading visible. |
| `[Applicants][PROD][E2E][Regression] Applicants overview shows core controls` | Verifies search input, nationality filter (input or button), Export CSV, Delete all, Sort by label. |
| `[Applicants][PROD][E2E][Regression] Applicants overview shows table headers` | Asserts Client Name, Residence Permit No, Credit Score, Status, Submitted, Actions columns. |
| `[Applicants][PROD][E2E][Regression] Applicants overview accepts search and nationality filters` | Searches "Ayaka", filters by "Japan". |

### `frontend/eHousing_Web/tests/testcases/applicants-dashboard-dev-tests.spec.ts`

Suite: `Applicants Dashboard | DEV | E2E`. Uses Auth0 CI bypass + `Ayaka Inoue`
mock.

| Test title | Coverage |
|---|---|
| `[Dashboard][DEV][E2E][Regression] Dashboard page loads for applicant` | Navigates to `/dashboard?id=16`, verifies URL. |
| `[Dashboard][DEV][E2E][Regression] Contact Information tab is visible and clickable` | Clicks "Contact Information" tab. |
| `[Dashboard][DEV][E2E][Regression] Open applicant profile from overview list` | Opens any row from overview into profile. |
| `[Dashboard][DEV][E2E][Regression] Financial snapshot tiles are visible` | Asserts Total Assets, Average Cash Flow (3 Years), Bank Balance, Employment Information tiles. |
| `[Dashboard][DEV][income_history][Regression] Outstanding Debt panel populated for income_history applicant` | Mocks `/api/v1/applications/16` with `income_history`; asserts "Outstanding Debt & Repayment" visible and no "Data pending" warnings. |
| `[Dashboard][DEV][income_history][Regression] Synthetic cash flow shown without calling transactions API` | Detects whether `/api/v1/applicants/16/transactions` is called for an `income_history` applicant — must NOT be (synthetic short-circuit). |
| `[Dashboard][DEV][Transactions][Regression] Dashboard fetches cash flow via /v1/applicants/{id}/transactions route alias` | Asserts the dashboard hits the new `/v1/applicants/{id}/transactions` alias (added in commit `e876c65`) for non-synthetic applicants with connected accounts. |

### `frontend/eHousing_Web/tests/testcases/login-dev-tests.spec.ts`

Suite: `Applicants | DEV | Login`.

| Test title | Coverage |
|---|---|
| `[Applicants][DEV][E2E][Regression] Login and open contact information` | Login → open Ayaka → navigate to dashboard → click Contact Information section. |

### `frontend/eHousing_Web/tests/testcases/application-dev-tests.spec.ts`

Suite: `Application | DEV | E2E`. Mocks `/api/applications/draft`,
`/api/v1/applications/otp`, `/api/v1/applications/verify-passcode`,
`/api/applications/provision-account`, `/api/v1/applications` (POST 201).

| Test title | Coverage |
|---|---|
| `[Application][DEV][E2E][Regression] Complete application flow` | Full happy path: signup → passcode → employment (United States) → connect-accounts (localStorage seed for `dw_application_connected_accounts` + `userFormData`) → reload → review → submit → confirmation. |

### `frontend/eHousing_Web/tests/testcases/application-prod-tests.spec.ts`

Suite: `Application | PROD | E2E`. Same mocks as DEV but on
`https://ehousing.joinlita.com`. Uses dynamic mailinator-style email per run.

| Test title | Coverage |
|---|---|
| `[Application][PROD][E2E][Regression] Complete application flow` | Same flow as DEV against prod URL. |

### `frontend/eHousing_Web/tests/testcases/application-signup-dev-tests.spec.ts`

Suite: `Application Signup | DEV | Validation`.

| Test title | Coverage |
|---|---|
| `[Application][DEV][Signup][Regression] Signup page displays all required elements` | Heading, both checkboxes, disabled Next. |
| `[Application][DEV][Signup][Regression] Next button disabled without email` | Fills name + checkboxes; Next stays disabled. |
| `[Application][DEV][Signup][Regression] Next button disabled without name` | Fills email + checkboxes; Next stays disabled. |
| `[Application][DEV][Signup][Regression] Next button disabled without checkboxes` | Fills email + name; Next stays disabled. |
| `[Application][DEV][Signup][Regression] Invalid email shows validation error` | "Enter a valid email address" surfaces; Next disabled. |
| `[Application][DEV][Signup][Regression] Next button enables when all fields are valid` | All four fields + checkboxes → Next enabled. |
| `[Application][DEV][Signup][Regression] Successful signup navigates to passcode step` | Submits; verifies `/application/passcode` and "Verify your email" heading. |

### `frontend/eHousing_Web/tests/testcases/application-signup-prod-tests.spec.ts`

Suite: `Application Signup | PROD | Smoke`. Same scenarios as DEV but tagged
`Smoke` and run against prod URL.

| Test title |
|---|
| `[Application][PROD][Signup][Smoke] Signup page is reachable and displays correctly` |
| `[Application][PROD][Signup][Smoke] Signup page shows required form fields` |
| `[Application][PROD][Signup][Smoke] Invalid email triggers validation error` |
| `[Application][PROD][Signup][Smoke] Next button remains disabled until all fields valid` |
| `[Application][PROD][Signup][Smoke] Signup navigates to passcode on valid submission` |

### `frontend/eHousing_Web/tests/testcases/application-steps-dev-tests.spec.ts`

Granular step coverage. Three nested describes: `Passcode Step`,
`Employment Step`, `Connect Accounts Step`, `Review & Confirm Step`.

| Test title | Coverage |
|---|---|
| `[Application][DEV][Passcode][Regression] Passcode step loads after signup` | Verifies `/application/passcode` URL after signup submit. |
| `[Application][DEV][Passcode][Regression] Passcode accepts 6-digit code entry` | Fills passcode `123456` digit by digit. |
| `[Application][DEV][Employment][Regression] Employment page displays all elements` | Heading + country selector + 4 employment tabs. |
| `[Application][DEV][Employment][Regression] Country selector opens and is searchable` | Opens country dropdown, listbox visible, searches Japan, selects. |
| `[Application][DEV][Employment][Regression] Employment type tabs are selectable` | Self-employed and Business owner tabs become active. |
| `[Application][DEV][Employment][Regression] Complete employment step navigates to connect accounts` | Country → Next → connect-accounts URL/heading. |
| `[Application][DEV][ConnectAccounts][Regression] Connect accounts page loads` | URL + "Link your accounts" heading. |
| `[Application][DEV][Review][Regression] Review step loads after connecting accounts` | Seeds connected accounts in localStorage, reloads, navigates to `/application/review`. |
| `[Application][DEV][Confirm][Regression] Confirmation page loads after submit` | Full happy path → asserts `/application/confirm` + "Application Submitted!" + Lita ID. |

---

## Page Objects Available

All page objects live under `frontend/eHousing_Web/tests/pages/`.

### `pages/applicants-pages/login-page.ts`

Imports `@PageSetup`, `setupAllure`, action/locator/page utilities.

Exports:
- `navigateToApplicantsAuth0LoginPage()` — go to `http://localhost:3000/`
- `loginToApplicantsPortal(email: string, password: string)` — branches: in `CI=true` runs `ciBypassLogin()` (token, cookies, localStorage, route mocks for `/api/v1/applications/*` GET/POST/archive/status, then redirects to `/applicants`). Otherwise drives Auth0 form (`Email address`, `Password`, `Continue`) with retry loop, fallback to `/api/auth/login` if Auth0 errors.
- `openAyakaInoueApplicantFromAuth0Landing()` — clicks button labelled `Ayaka Inoue — 696 Pending Apr` if present
- `loginToProdApplicantPortal(email, password)` — runs `prodBypassLogin()` (cookies on `ehousing.joinlita.com`, mocks for `/api/applications` and `/api/v1/applications` GETs, then `goto('https://ehousing.joinlita.com/applicants')`)
- `verifyApplicantsLoginPageIsDisplayed()` — checks email input visible
- `verifyApplicantsMovedToPasscodeStep()` — URL regex `application/passcode`
- Internal helpers: `waitForPostLoginState`, `waitForAuth0LoginReadiness`, `fallbackToLocalDevLogin`, `isVisible`, `waitBetweenSteps`

Mock applicant payload (Ayaka Inoue): `id: 16`, `email: 'ayaka.inoue@example.com'`,
`country: 'Japan'`, `credit_score: 696`, `review_status: 'in_review'`,
`connected_accounts.personal: [{id: 'acct_ayaka_001', name: 'Ayaka Personal Checking', currentBalance: 45000}]`,
`metadata: { residence_permit_number: 'JP-2024-0042' }`, `date_of_birth: '1990-03-15'`.

### `pages/applicants-pages/dashboard-page.ts`

Exports:
- `navigateToApplicantsDashboardPage()` — goes to `http://localhost:3000/dashboard?id=16`
- `verifyApplicantsDashboardPageURL()` — URL regex `dashboard\?id=16`
- `openContactInformationSection()` — clicks "Contact Information" text
- `verifyFinancialSnapshotTilesVisible()` — Total Assets, Average Cash Flow (3 Years), Bank Balance, Employment Information
- `verifyOutstandingDebtSectionVisible()` — "Outstanding Debt & Repayment"
- `verifyNoDataPendingWarnings()` — asserts "Data pending" hidden

### `pages/applicants-pages/application-page.ts` (Applicants Overview)

Exports:
- `verifyApplicantsOverviewPageURL()`
- `openApplicantsOverviewHeading()`
- `verifyApplicantsOverviewCoreElements()` — heading, search, nationality filter (input/button), Export CSV, Delete all, Sort by
- `verifyApplicantsOverviewTableHeaders()` — Client Name, Residence Permit No, Credit Score, Status, Submitted, Actions
- `searchApplicantsByQuery(query: string)`
- `filterApplicantsByNationality(nationality: string)`
- `archiveApplicantFromActionsMenu(applicantName: string)` — search → open actions → click "Archive Applicant" menu item
- `openApplicantProfile(applicantName: string)`
- `openAnyApplicantProfile()` — first row, falls back to row link, then row click
- `archiveApplicantFromProfileHeader()` — clicks "Archive Applicant" / "Deleting Applicant…" header button
- `clickDeletedApplicantToast(applicantName: string)`
- Internal: `expectApplicantProfileToBeOpen`, `applicantRowByName`, `resolveOpenActionsButton`, `waitForAnyVisible`, `waitForVisible`

### `pages/applicants-pages/home-page.ts`

Exports:
- `navigateToApplicantsDevHomePage()` — `/applicants`
- `navigateToApplicantsProdHomePage()` — `https://ehousing.joinlita.com/applicants`
- `verifyApplicantsHomePageLoaded()`
- `verifyApplicantsProdHomePageLoaded()` — URL must be `https://ehousing.joinlita.com/applicants*`

### `pages/applicants-pages/otp-page.ts`

Exports:
- `verifyOtpPageIsDisplayed()` — "Verify your email" heading visible
- `verifyOtpHeadingText()` — heading contains "Verify your email"

### `pages/applicants-pages/admin-page.ts`

Exports:
- `toggleApplicantAgreement(index: number)` — clicks the (1-indexed) "I agree" row
- `isApplicantAgreementChecked(index: number)` — reads `aria-checked` attribute

### `pages/application-pages/signup-page.ts`

Exports:
- `navigateToSignupDevPage()` / `navigateToSignupProdPage()`
- `verifySignupPageIsDisplayed()` — URL regex + heading regex `Let.*begin your e-housing application form` + email + name inputs
- `verifyNextButtonIsDisabled()` / `verifyNextButtonIsEnabled()`
- `fillEmail(email)` / `fillName(fullName)`
- `checkPrivacyPolicy()` / `checkUserAgreement()` — both via `clickByJS` (sr-only checkboxes)
- `verifyInvalidEmailErrorIsDisplayed()` — "Enter a valid email address"
- `verifyEmailExistsErrorIsDisplayed()` — "An application with this email already exists."
- `fillCompleteSignupForm(email, fullName)` — fills both + checks both consents
- `submitSignupForm()` — `dispatchEvent('click')` on Next
- `verifyPasscodeStepLoaded()` — URL `/application/passcode` + "Verify your email" heading
- `verifyCheckboxesAreVisible()`
- `focusEmailAndBlur(invalidEmail)` — fill + Tab

### `pages/application-pages/employment-page.ts`

Exports:
- `verifyEmploymentPageIsDisplayed()`
- `openCountrySelector()` / `searchForCountry(name)` / `selectCountryOption(name)` / `verifyCountryDropdownIsOpen()` (asserts listbox `Country of citizenship options` visible)
- `selectCountry(countryName)`
- `selectEmploymentType('Full-time' | 'Self - employed' | 'Business owner' | 'Retired' | 'Other')`
- `verifyEmploymentTabIsSelected(type)`
- `clickNext()`
- `verifyEmploymentCoreElementsDisplayed()` — heading + country selector + 4 tabs

### `pages/application-pages/application-flow-page.ts`

Exports:
- `navigateToApplicationDevHomePage()` (`http://localhost:3000/application/signup`) and `navigateToApplicationProdHomePage()` (prod equivalent)
- `completeApplicantDetailsStep(email, fullName)` — fills email, name, JS-clicks both consent checkboxes, JS-clicks Next
- `verifyPasscodeStepLoaded()`
- `fillPasscode(passcode: string)` — fills 6 digits via `Digit 1`…`Digit 6` labels
- `completeEmploymentStep()` — uses United States, JS-clicks Next
- `verifyConnectAccountsStepLoaded()` — heading "Link your accounts"
- `navigateToReviewStep()` — JS-clicks Next on connect-accounts (because mobile Connect Later overlaps), verifies `/application/review` and "Review & Submit" heading
- `submitApplication()` — `dispatchEvent('click')` on Submit
- `verifyConfirmationStepLoaded()` — `/application/confirm` + "Application Submitted!" heading + Lita ID text

### Test data files (`tests/testdata/testdata/`)

`admin-test-data.ts`, `applicants-test-data.ts`, `automation-exercise-testdata.ts`,
`dashboard-test-data.ts`, `login-test-data.ts`, `otp-test-data.ts`,
`practice-expandtesting-testdata.ts`,
`practise-automation-form-fields-test-data.ts`, `sauce-demo-test-data.ts`,
`the-internet-test-data.ts`. Lita-relevant ones are the first six; the rest are
demo-site fixtures retained from the framework template.

---

## Backend API Endpoints (UI-relevant)

All endpoints live in `backend/src/interface/http_endpoints.py`. They are
mounted under `/api/` (the FastAPI prefix), so the frontend calls
`/api/v1/applications`, `/api/applicants`, etc.

### Application lifecycle (used by signup/dashboard/applicants)

| Method + Path | Purpose |
|---|---|
| `POST /api/v1/applications/otp` | Send 6-digit verification email via Resend. |
| `POST /api/v1/applications/verify-passcode` | Verify the OTP and mark email verified. |
| `POST /api/v1/applications/send-login-email` | Send "resume your application" login link. |
| `POST /api/v1/applications` | Create a housing application (used by review submit). Returns `ApplicationResponse` (includes generated id). |
| `POST /api/v1/applications/draft` | Upsert in-progress draft keyed by email. |
| `GET /api/v1/applications/draft?email=…` | Fetch existing draft. 404 when missing. |
| `GET /api/v1/applications` | List housing applications (admin/realtor). Supports `limit`, `phone`, `residence_permit_number` query, accept-header switching, role-aware. |
| `GET /api/v1/applications/lookup?email=…` | Returns `{ id }` for existing application (used by gate flow). |
| `GET /api/v1/applications/stream` | SSE stream of application updates. |
| `DELETE /api/v1/applications` | Bulk delete (decision roles only). |
| `POST /api/v1/applications/{id}/archive` | Soft-archive applicant (admin/realtor). |
| `GET /api/v1/applications/{id}` | Get application detail (used by `/dashboard?id=…`). Returns full `ApplicationResponse` with `connected_accounts`, `credit_score`, `metadata`, etc. |
| `POST /api/v1/applications/{id}/decision` | Update review status (`approved` / `denied` / `pending`). |
| `GET /api/v1/applications/{id}/credit-score` | Credit score detail (history, attributes). |
| `GET /api/v1/applications/{id}/account-balances` | Account balances (Plaid + SaltEdge merged). |
| `GET /api/v1/applications/{id}/transactions` and `GET /api/v1/applicants/{id}/transactions` | Transaction list + dashboard adapters. The `/applicants/` form is the alias added by `e876c65` to fix dashboard fetches. |
| `GET /api/v1/applications/{id}/payment-history` | Payment-history detail (housing/loan repayments). |
| `GET /api/v1/applications/{id}/saltedge-holder-info` | KYC-lite holder identity from SaltEdge accounts. |
| `GET /api/v1/applications/{id}/bank-data` | Combined bank-data snapshots view. |

### Applicants alternative listing

| Method + Path | Purpose |
|---|---|
| `GET /api/applicants` | Alternate listing for applicants overview, role-scoped. |
| `GET /api/v1/applicants/{id}/account-coverage` | Coverage analysis (reported vs detected accounts, missing, ratio). |
| `GET /api/v1/applicants/{id}/dummy-account-indicators` | Heuristic flags for likely dummy accounts (admin/realtor). |
| `GET /api/v1/applicants/{id}/transactions` | Alias for the dashboard. |

### KYC / Identity

| Method + Path | Purpose |
|---|---|
| `POST /api/create_link_token_id_verification` | Plaid identity verification link token. |
| `GET /api/identity_verification_status/{verification_id}` | Plaid IDV status poll. |

### Plaid

| Method + Path | Purpose |
|---|---|
| `GET /api/plaid/create_link_token` | Plaid Link token for connect-accounts. |
| `GET /api/account/balances` | Aggregated balances. |
| `GET /api/transactions` | Transaction list. |
| `GET /api/accounts/assets` | Asset report. |
| `GET /api/income/data` | Income data (Plaid Income product). |
| `POST /api/payments/history` | Payment history detail submission. |

### Salt Edge (v5 + v6)

| Method + Path | Purpose |
|---|---|
| `POST /api/saltedge/lead-session` | Customer lead session start. |
| `GET /api/saltedge/connection/{connection_id}` | Connection details. |
| `GET /api/saltedge/customer/{customer_id}/connections` | All connections for a customer. |
| `GET /api/saltedge/customers` | Customer list. |
| `GET /api/saltedge/customer/{customer_id}/reports` | Reports listing. |
| `GET /api/saltedge/report/{report_id}` | Report detail. |
| `POST /api/saltedge/v6/customer` | Create v6 customer. |
| `POST /api/saltedge/v6/connect-session` | Start v6 connect session. |

### Phone application + score conversion + research + admin

| Method + Path | Purpose |
|---|---|
| `POST /api/phone-applications` | Phone-only application submission. |
| `GET /api/phone-applications` | List phone applications. |
| `POST /api/v1/score-convert` | Convert provider-specific score to global 0–1000 scale. |
| `POST /api/research/wiki` | Generate the Lita Wiki research report for an applicant. |
| `POST /api/v1/admin/bank-data-snapshots/{snapshot_id}/retry` | Admin manual retry of a Plaid snapshot pull (admin only). |

### Frontend `/api/**` route handlers (Next.js App Router)

These are server-side proxies that wrap the FastAPI calls or implement
local-only behaviour (Auth0, dummy passcode acceptance, KYC dummy fallbacks).

| Path | Behaviour |
|---|---|
| `frontend/app/api/applications/route.ts` | `GET` lists, `POST` creates, `DELETE` bulk-deletes; proxies backend with token negotiation. Filters out empty-email applications. |
| `frontend/app/api/applications/[id]/route.ts` | Fetch detail by id with identifier variants. |
| `frontend/app/api/applications/[id]/archive/route.ts` | Archive proxy with service-account token fallback. |
| `frontend/app/api/applications/[id]/credit-score/route.ts` | Proxies credit-score detail. |
| `frontend/app/api/applications/[id]/run-check/route.ts` | Triggers a credit/risk check. |
| `frontend/app/api/applications/[id]/status/route.ts` | Updates review status (`approved`/`denied`/`pending`). |
| `frontend/app/api/applications/draft/route.ts` | `POST` upsert / `GET` lookup of draft by email. |
| `frontend/app/api/applications/lookup/route.ts` | Returns `{ id: number \| null }` for an email. |
| `frontend/app/api/applications/otp/route.ts` | Proxies OTP send. |
| `frontend/app/api/applications/verify-passcode/route.ts` | Accepts any 6-digit code; proxies to backend; returns user/token (sets cookie). |
| `frontend/app/api/applications/send-login-email/route.ts` | Proxies login email. |
| `frontend/app/api/applications/provision-account/route.ts` | Generates secure password, creates Auth0 user with `applicant` role. |
| `frontend/app/api/applications/read-model/route.ts` | Returns lighter "in_review/approved/denied/hold" status mapping for client consumption. |
| `frontend/app/api/v1/applicants/[id]/account-coverage/route.ts` | Proxies coverage. |
| `frontend/app/api/v1/applicants/[id]/transactions/route.ts` | Proxies transactions; falls back to synthetic 24-month dummy data when `NEXT_PUBLIC_ENABLE_CREDIT_FALLBACK` set / non-prod. |
| `frontend/app/api/v1/applications/[id]/account-balances/route.ts` | Proxies balances. |
| `frontend/app/api/v1/applications/[id]/route.ts` and `archive`, `credit-score`, `status` | v1-prefixed proxies (mirrors of `/api/applications/...`). |
| `frontend/app/api/v1/applications/route.ts` | v1 list/create. |
| `frontend/app/api/v1/applications/otp/route.ts` and `verify-passcode/route.ts` and `send-login-email/route.ts` and `provision-account/route.ts` and `read-model/route.ts` | v1 mirrors. |
| `frontend/app/api/v1/application/residence-permit/ocr/route.ts` | OCR for residence permit upload (file or `file_url`). |
| `frontend/app/api/auth/auth0/[auth0]/route.ts` | Auth0 login/callback handler (organization-aware, sets `auth`, `auth0_session`, `auth0_state` cookies). |
| `frontend/app/api/auth/login/route.ts` | Local guest login (CI bypass, no real password). |
| `frontend/app/api/auth/register/route.ts` | Auth0 user creation (admin scope). |
| `frontend/app/api/auth/token/route.ts` | OAuth token exchange. |
| `frontend/app/api/bank-logos/route.ts` | Bank logo proxy/cache. |
| `frontend/app/api/dashboard/mission-control/route.ts` | Redirects to `/mission-control`. |
| `frontend/app/api/health/route.ts` | Backend connectivity check. |
| `frontend/app/api/ready/route.ts` | Readiness probe. |
| `frontend/app/api/kyc/route.ts` and `[verificationId]/route.ts` | KYC submission + status polling. |
| `frontend/app/api/levels-fyi/route.ts` | Levels.fyi salary lookup. |
| `frontend/app/api/payments/history/route.ts` | Payment history submission. |
| `frontend/app/api/saltedge/connection/[connectionId]/route.ts`, `connection/[connectionId]/persist/route.ts`, `customer/[customerId]/connections/route.ts`, `customer/[customerId]/sync/route.ts`, `v6/connect-session/route.ts`, `v6/customer/route.ts` | SaltEdge proxies. |
| `frontend/app/api/sentry-example-api/route.ts` | Sentry example error trigger. |
| `frontend/app/api/user/onboarding/route.ts` | User onboarding state. |
| `frontend/app/api/wiki/route.ts` | `GET` wiki research report (delegates to `lib/wiki-profile-service.handleWikiApiRequest`). |

---

## Gap Matrix

Existing coverage vs missing scenarios per feature area. Anything not listed
under "Existing" is fair game for new tests.

| Feature area | Existing coverage | Missing scenarios |
|---|---|---|
| **Auth — Auth0 admin login** | DEV `loginToApplicantsPortal` (CI bypass + Auth0 form), PROD `prodBypassLogin` cookie injection. | Auth0 error page handling (Oops! retry path), real form submission rejection (wrong password), session expiry/redirect to `/login`, `auth0_error` callback param branch on `/login`, role-based gating (admin vs realtor vs applicant). |
| **Auth — local register** | None. | `/register` form validation, password requirements (length/number/lowercase/uppercase), Auth0 user creation success/conflict (409). |
| **Auth — forgot password** | None. | `/forgot-password` email validation, success copy ("Check your inbox"), and idempotent submit. |
| **Auth — login resume flow** | Implicit through `loginToApplicantsPortal` only. | `/application/login-verify` OTP send, OTP verify, `not_found`/`submitted`/`error` resume states, `redirecting` to dashboard. |
| **Application — signup form** | DEV: 7 validation tests. PROD: 5 smoke tests. | Email-already-exists error ("An application with this email already exists."), draft auto-restore on revisit (GET draft 200), reCAPTCHA / honeypot if any, name length limits, character set restrictions. |
| **Application — passcode** | DEV: loads + accepts 6-digit. | OTP resend cooldown / button state, invalid passcode rejection (verify-passcode 400), expired OTP, OTP localStorage state across reload, paste-into-first-input UX. |
| **Application — employment** | DEV: page loads, country selector (open + search Japan + select), employment type tabs. | Search no-result state, all 5 employment options (Full-time, Self-employed, Business owner, Retired, Other), `Next` disabled until country selected, draft persistence. |
| **Application — connect-accounts** | DEV: page loads via "Link your accounts" heading. localStorage seed for connected accounts is used in flow tests, but `PlaidLinkButton` and SaltEdge UIs are never driven. | Plaid Link button rendering for US/CA, SaltEdge v6 connect-session for non-US/CA, "Skip for now" path → `/application/connect-later`, removing a connected account, account-categorisation overrides (`dw_application_saltedge_category_overrides`), missing-customer-id path. |
| **Application — connect-later** | None. | Page renders + back-link preserves email/country/showBusiness/provider query. |
| **Application — review** | DEV: navigateToReviewStep + submit happy path. | Review form field surfaces (review of email, employment, accounts), edit-back navigation, missing-data validation errors, `dw_application_reference` generation determinism, submit failure (`/api/v1/applications` 4xx/5xx), `not_provided` placeholders. |
| **Application — confirm** | DEV: confirmation loads with "Application Submitted!" + Lita ID. | Submission date formatting, "send login email" CTA, `LOGIN_EMAIL_SENT_STORAGE_KEY` debounce. |
| **Application — gate (`/application`)** | None. | Email pre-fill from `?email=`, `?login=1` forces login mode, invalid email rejection, redirect to `/application/login-verify`. |
| **Applicants overview** | DEV: login + archive any applicant. PROD: page load, controls, table headers, search "Ayaka", filter "Japan". | Sort order toggling, "Delete all" confirmation modal, "Export CSV" download, pagination, empty-state, real archive flow with toast confirmation, unarchive, role-gated actions for non-decision roles, archived row hidden. |
| **Applicants — actions menu** | None (helper exists but unused). | `archiveApplicantFromActionsMenu` flow, "View profile" / row link variant, locked vs unlocked actions. |
| **Dashboard `/dashboard?id=…`** | DEV: page loads, contact tab clickable, financial tiles visible, income_history outstanding-debt panel, synthetic cash-flow short-circuit, transaction route alias. | Customer Information section content, employment information detail, persona attributes, housing payment history rendering, credit-information section, credit-history section, account summary section, currency selector toggling currencies, average-cash-flow dialog, decision actions (approve/deny/hold), latest-snapshot control, top-nav-action interactions, dashboard for missing applicant (404 fallback), credit score pending modal, no-connected-accounts state, archived applicant view. |
| **Dashboard — credit fallback** | Indirect (synthetic test path). | Explicit assertion that credit-score 404 falls back without breaking UI; `NEXT_PUBLIC_ENABLE_CREDIT_FALLBACK` toggle; loan-payment-card visible when synthetic loans applied. |
| **Mission Control `/mission-control`** | None. | Use-case toggling (lending/rental/fraud/payroll), consent key add/remove, expiry display. |
| **AML `/aml`** | None. | Match/no-match/pending status rendering, identity provider badges, back navigation. |
| **KYC `/kyc`** | None. | Verification status badges, identity match rendering, refresh/retry, address+phone+alerts arrays. |
| **Wiki `/wiki?id=…`** | None. | Profile load (default + `dashboardVariant=jp`), locale switching (`profileLocale=ja` query vs cookie), back-label localisation. |
| **Phone application `/phone-application`** | None. | Phone-only path, Plaid/SaltEdge connection wizard, payment history viewer, dummy-account-indicators surface. |
| **Connect Accounts standalone (`/connect-accounts`)** | None (re-exports application/connect-accounts). | Same as application/connect-accounts but standalone route. |
| **Corporate overview `/corporate-overview`** | None. | KPI cards, recharts bars rendering, locale toggle. |
| **Applications queue `/applications`** | None. | DashboardKpis tiles, ApplicationsTable rows, optimistic update on archive/decision, KPI numbers refresh after action. |
| **Backend route — archive** | DEV via `archiveApplicantFromProfileHeader` (mocked 200). | Real archive call → list refresh, archive failure (4xx/5xx) toast, archive of already-archived applicant. |
| **Backend route — decision** | None. | `POST /api/v1/applications/{id}/decision` for approved/denied/pending; assert UI badge updates. |
| **Backend route — score-convert** | None. | `POST /api/v1/score-convert` 200 payload + band classification. |
| **Backend route — wiki research** | None. | `POST /api/research/wiki` happy path + 500 handling. |
| **Backend route — saltedge holder info / bank-data** | None. | Surface in dashboard / profile (KYC-lite identity matches). |
| **Backend route — payment-history** | None. | `GET /api/v1/applications/{id}/payment-history` rendered into housing payment history section. |
| **Frontend route — `/api/applications/lookup`** | None. | `email` missing → 400, hit lookup, GET id null vs id number. |
| **Frontend route — `/api/v1/applicants/[id]/transactions` fallback** | Implicit via dashboard alias test. | Force backend failure to assert dummy fallback only when `NEXT_PUBLIC_ENABLE_CREDIT_FALLBACK` set. |
| **Frontend route — OCR upload** | None. | `POST /api/v1/application/residence-permit/ocr` (file vs file_url). |
| **Auth0 callback** | None. | `/login?auth0_success=…` renders LoginPage and forwards user; `/login?auth0_error=…` shows error text. |
| **Cross-cutting — locale middleware** | None. | `X-App-Country`, `X-App-Locale` headers set from request, `PROFILE_LOCALE_KEY` cookie set when missing. |
| **Cross-cutting — health/ready** | None. | `/api/health` reachable, `/api/ready` returns 200 when `NEXT_PUBLIC_BACKEND_API_URL` set. |
| **Cross-cutting — error boundary** | None. | `/sentry-example-api` returns sample error; client-side error UI surfaces. |
| **Cross-cutting — applicants `loading.tsx`** | None. | Initial render skeleton for `/applicants` loading state. |

---

## Playwright Infrastructure

### Config (`frontend/playwright.config.ts`)

- `testDir: './'`; `testMatch: ['e2e/**/*.spec.ts', 'eHousing_Web/tests/**/*.spec.ts']`
- `outputDir: 'allure/allure-results'`
- `fullyParallel: true`, `forbidOnly: !!CI`, `retries: CI ? 3 : 1`, `workers: CI ? 1 : 5`
- Reporters: `allure-playwright`, `junit` → `test-results.xml`, custom `eHousing_Common/.../setup/reporter`, `json` → `playwright-report/test-results.json`, `html` → `playwright-report/`
- `globalSetup: eHousing_Common/test-setup/global-setup.ts` (sets allure suite to `ALL`)
- `globalTeardown: eHousing_Common/test-setup/global-teardown.ts` (runs `scripts/generate-allure-report.sh` and posts Slack via `notifySlackWithResults` if Slack creds present)
- Timeouts (from `eHousing_Common/.../constants/timeouts.ts`):
  - `TEST_TIMEOUT = 120s`
  - `EXPECT_TIMEOUT = 5s`
  - `ACTION_TIMEOUT = 5s`
  - `NAVIGATION_TIMEOUT = 30s`
- `use`:
  - `headless: true`
  - `extraHTTPHeaders` includes `CF-Access-Client-Id` / `CF-Access-Client-Secret` from env
  - `ignoreHTTPSErrors: true`, `acceptDownloads: true`
  - `testIdAttribute: 'qa-target'` — locators may rely on `data-qa-target` attributes, not `data-testid`
  - `baseURL = process.env.URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000'`
  - `trace: 'retain-on-failure'`, `screenshot: 'on'`, `video: 'on'`
- Projects: Chrome 1600×1000, Firefox 1600×1000, Safari 1600×1000, Mobile Chrome (Pixel 7), Mobile Safari (iPhone 14). Chrome runs with `--disable-web-security`.
- `webServer` (only when running against localhost): `npm run dev -- --hostname 127.0.0.1 --port 3000`, 120s timeout, `reuseExistingServer: true`.

### Path aliases (`frontend/tsconfig.json`)

- `@/*` → `./*`
- `@PageSetup` → `eHousing_Common/test-setup/page-setup.ts` (adds `setPage(page)`, `blockAds`, sets allure dynamic suite from filename)
- `@AllureMetaData` → `eHousing_Common/src/ehousing-playwright/setup/setupAllure.ts`
- `@TIMEOUT` → constants/timeouts.ts
- `@PageUtils`, `@ActionUtils`, `@AssertUtils`, `@LocatorUtils`, `@ElementUtils`, `@APIUtils`, `@SlackManager`, `@DBManager`, `@StepsUtils`, `@TestMetadata`, `@AllureEnvConfig`, `@LOADSTATE` → corresponding files under `eHousing_Common/src/ehousing-playwright/`
- Demo-site aliases (`@TheInternet*`, `@SauceDemo*`, `@ExpandTesting*`, `@PracticeAutomation*`, `@AutomatioExercise*`) — boilerplate; not used by Lita tests.

### Helpers (`frontend/eHousing_Common/src/ehousing-playwright/`)

- `setup/test-fixtures.ts` — extends Playwright `test` with a `DB: DBManager` fixture wrapped via `withSteps('DBManager')`. Re-exports `expect`. Currently NOT imported by any spec — they import `test` from `@PageSetup` instead.
- `setup/page-setup.ts` (`@PageSetup`) — re-exports `test = base` after a `beforeEach` that calls `setPage(page)`, `blockAds(page)` (skipped on BrowserStack project), and switches Allure suite from filename.
- `setup/setupAllure.ts` — pulls metadata from `setup/test-metadata.ts` and tags the test with allure labels (owner, tms link, severity, tags, parent/suite/feature/story). Skips test when `details.skipReason` is present.
- `setup/test-metadata.ts` — keyed by the IDs passed to `setupAllure(...)` (e.g. `'eHousingDashboardDevPageLoads'`).
- `utils/page-utils.ts` — `getPage()`, `setPage()`, `gotoURL()`, `blockAds()`. Singleton page reference used everywhere.
- `utils/action-utils.ts` — `click(locator, opts?)`, `clickByJS(locator)` (used for sr-only checkboxes and overlapped buttons), `fill(locator, value, opts?)`.
- `utils/assert-utils.ts` — `expectElementToBeVisible`, `expectElementToBeHidden`, `expectElementToBeEnabled`, `expectElementToBeDisabled`, `expectElementToHaveValue`, `expectElementToContainText`, `expectPageToHaveURL`.
- `utils/locator-utils.ts` — `getLocator`, `getLocatorByRole`, `getLocatorByText`, `getLocatorByLabel`, `getLocatorByPlaceholder`, `getLocatorByAltText`, etc.
- `utils/element-utils.ts`, `utils/api-utils.ts`, `utils/steps-utils.ts` (wraps manager methods in `test.step()`), `utils/slackUtils.ts`.
- `managers/slack-manager.ts` — `notifySlackWithResults()` for global teardown.
- `managers/db-manager.ts` — DB fixture used by the SQL/TimescaleDB demo tests, irrelevant for app testing.

### CI Workflow (`.github/workflows/daily-prod-e2e.yml`)

- Triggered daily at 07:00 UTC (`cron: '0 7 * * *'`) plus `workflow_dispatch`.
- `runs-on: ubuntu-latest`, working dir `frontend`.
- Restores Allure history from `gh-pages` branch into `frontend/allure/allure-results/history`.
- Sets up Node 20 + npm cache; `npm ci --legacy-peer-deps`; `npx playwright install --with-deps`.
- Runs three spec files **in series** with `continue-on-error: true`, each against `PLAYWRIGHT_BASE_URL=https://ehousing.joinlita.com` and `CI=true`:
  - `eHousing_Web/tests/testcases/application-prod-tests.spec.ts`
  - `eHousing_Web/tests/testcases/application-signup-prod-tests.spec.ts`
  - `eHousing_Web/tests/testcases/applicants-prod-tests.spec.ts --project=Chrome`
- Each run copies `playwright-report/test-results.json` to a per-run filename and parses totals/passed/failed/skipped via `jq`.
- Uploads `frontend/playwright-report/` as artifact (`retention-days: 14`).
- Generates Allure HTML and deploys both the run-specific report and the history to GitHub Pages under `allure/<run_id>/` and `allure/history/`.
- Posts a Slack message with status emoji, totals, and links to Allure + workflow run.
- Other workflows (`compile.yml`, `pr.yml`, `qa-index.yml`, `pull-requests-workflow.yaml`, etc.) handle PR validation, secret scanning, deploys; the daily prod E2E is the only Playwright runner today (PR workflow may invoke a subset — not yet inspected).

### Other relevant config

- `frontend/middleware.ts` — redirects `/login` to `/api/auth/auth0/login` (with `organization` query when configured) unless callback params present. Adds `X-App-Country` / `X-App-Locale` headers and writes `PROFILE_LOCALE_KEY` cookie when missing. Matcher excludes `_next/static`, `_next/image`, `favicon.ico`.
- `frontend/eHousing_Common/test-setup/global-setup.ts` — sets allure env to `ALL`.

---

## Key Patterns & Conventions

### Auth bypass (CI / dev)

When `process.env.CI === 'true'`, `loginToApplicantsPortal` calls
`ciBypassLogin()` which:

1. `addInitScript` to seed `localStorage`:
   ```ts
   localStorage.setItem('accessToken', 'ci_test_token')
   localStorage.setItem('authUser', JSON.stringify({
     id: 1, username: 'sotheby', email: 'sotheby@joinlita.com',
     role: 'admin', applicationId: null,
   }))
   ```
2. Adds cookies `auth=ci_test_token` and `auth0_session=<base64url(JSON.stringify({token,user}))>` on `localhost`.
3. Mocks the four backend routes under `/api/v1/applications/*` and `/api/applications` with the canonical Ayaka Inoue payload.
4. `goto('http://localhost:3000/applicants')` and waits for `/Applicants Overview/i` or `/Ayaka Inoue/i` to appear.

`prodBypassLogin()` is a similar pattern but on `ehousing.joinlita.com` (only sets `auth` cookie, no `auth0_session`).

### Route mocking conventions

- All mocks use `await page.route(<glob or regex>, async (route) => …)`.
- Common pattern is to `route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })` for happy paths and `route.fallback()` to let unmatched methods through.
- Application flow tests mock both the v1 (`/api/v1/applications/...`) and unversioned (`/api/applications/...`) variants because the frontend hits both depending on the page.
- For draft probes, tests typically respond with `404` so the application starts fresh.

### LocalStorage seeding for connect-accounts step

To avoid driving the Plaid / SaltEdge UIs in tests, the application flow tests seed:

```ts
window.localStorage.setItem('dw_application_connected_accounts', JSON.stringify({
  personal: [{ id: 'acct_001', accountId: 'acct_001', connectionId: 'conn_001', name: 'Test Checking', currentBalance: 5000 }],
  business: [], investments: [],
}))
window.localStorage.setItem('dw_application_connected_accounts_version', '7')
window.localStorage.setItem('userFormData', JSON.stringify({
  fullName: 'Flow Test User', email: '...', phone: '+1 555 111 2222',
  nationality: 'United States', businessOwnership: 'employee', metadata: {},
}))
```

…then `page.reload()` to pick up the seeded data.

### Dashboard income_history synthetic path

Mocking `/api/v1/applications/16` with `connected_accounts.income_history` populated triggers `shouldUseSyntheticTestDashboardData` and `applySyntheticCashFlow` in the dashboard. In that mode the dashboard MUST NOT call `/api/v1/applicants/16/transactions`. Tests assert this by routing the transactions endpoint with a side-effect flag and checking it stayed `false`.

### Click strategies

- `clickByJS` (action-utils) is required for sr-only checkboxes (privacy/user agreement) — `locator.check()` fails to flip state in Firefox/Safari.
- For the application flow `Next` button on connect-accounts the page uses `clickByJS` because on mobile the "Connect Later" paragraph overlaps the fixed-footer button.
- Submit button uses `dispatchEvent('click')` to bypass any pointer-event interception.

### Selector conventions

- `qa-target` is the configured `testIdAttribute`, so `getByTestId('foo')` looks for `[qa-target="foo"]`.
- Specs largely use role/label/text locators (Playwright's accessibility selectors) and only fall back to CSS `tr[role="button"]`, `tbody tr`, `td, [role="cell"]` for table rows.
- BrowserStack-only flag: `testInfo.project.name !== 'BrowserStack'` skips ad-blocking.

### Allure metadata

`setupAllure(<id>)` reads from `eHousing_Common/.../setup/test-metadata.ts` and applies labels/links/parent-suites. New tests should add a corresponding entry to that file when introducing a new id, otherwise `setupAllure` is a no-op (silent skip).

### BrowserStack hooks

`applicants-dev-tests.spec.ts` and `applicants-prod-tests.spec.ts` set
`window.browserstack_executor` to `setSessionName` / `setSessionStatus` in
before/after hooks. The cast `// @ts-expect-error` is intentional. Other
suites omit this and run only on local Chrome/Firefox/Safari/mobile projects.

### Test naming

`[Surface][Env][SubArea][Severity] description` — e.g. `[Application][DEV][Signup][Regression] …`. The same id (without brackets) is passed to `setupAllure` in camelCase form (`eHousingApplicationDevSignupNextEnabled`).
