# Playwright Audit — Implementation Plan

## Status
Phases: 16
Assessed: yes

- [x] P0-A — Application Signup edge cases (draft restore + email-exists)
- [x] P0-B — Application Passcode invalid / expired / resend / paste
- [x] P0-C — Application Employment full coverage (all 5 types, validation, dropdown empty-state)
- [x] P0-D — Application Review form + submit failure
- [x] P0-E — Application Confirm + send-login-email CTA
- [x] P0-F — Application Gate (`/application`) + login-verify resume flow
- [x] P0-G — Applicants Overview deeper coverage (sort, pagination, archive toast, role gating, actions menu)
- [x] P0-H — Dashboard expanded sections (persona, payment history, credit, account summary, currency, decision)
- [x] P0-I — Dashboard error & edge states (404 fallback, no-accounts, archived, credit-score 404 fallback)
- [x] P1-A — Auth surfaces: register, forgot password, Auth0 callback (`auth0_success` / `auth0_error`)
- [x] P1-B — Connect Accounts step + connect-later (Plaid/SaltEdge dispatch, skip flow, category overrides)
- [x] P1-C — Applications queue `/applications` + Mission Control + AML + KYC demo pages
- [x] P2-A — Wiki `/wiki` (locale + dashboardVariant)
- [x] P2-B — Phone Application `/phone-application`
- [x] P2-C — Corporate Overview `/corporate-overview`
- [x] P3-A — Cross-cutting infra (`/api/health`, `/api/ready`, locale middleware, Sentry error boundary, `/applicants/loading.tsx`)

Each phase below specifies the spec file owned, the page-object owned (and shared
page-objects modified by exactly one phase to keep parallel writes safe), the
route mocks needed, and the exact `test('…')` title strings. The titles follow
the existing convention `[Surface][Env][SubArea][Severity] description`.

Naming convention for `setupAllure` ids: `eHousing<Surface><Env><Detail>` in
camelCase (e.g. `eHousingApplicationDevSignupEmailExists`). New ids must be
added to `frontend/eHousing_Common/src/ehousing-playwright/setup/test-metadata.ts`
— that file is owned by phase **P0-A** and updated in a single PR-friendly
batch.

---

## Write-set Map (parallelisation guide)

| Phase | Spec file (owned) | Page object (created/extended) | Shared files modified |
|---|---|---|---|
| P0-A | `application-signup-extra-dev-tests.spec.ts` | `application-pages/signup-page.ts` (extend) | `setup/test-metadata.ts` (this phase batches **all** new ids for every phase) |
| P0-B | `application-passcode-dev-tests.spec.ts` | `application-pages/passcode-page.ts` (NEW) | — |
| P0-C | `application-employment-extra-dev-tests.spec.ts` | `application-pages/employment-page.ts` (extend) | — |
| P0-D | `application-review-dev-tests.spec.ts` | `application-pages/review-page.ts` (NEW) | — |
| P0-E | `application-confirm-dev-tests.spec.ts` | `application-pages/confirm-page.ts` (NEW) | — |
| P0-F | `application-gate-dev-tests.spec.ts` | `application-pages/gate-page.ts` (NEW), `application-pages/login-verify-page.ts` (NEW) | — |
| P0-G | `applicants-overview-extra-dev-tests.spec.ts` | `applicants-pages/application-page.ts` (extend) | — |
| P0-H | `applicants-dashboard-extra-dev-tests.spec.ts` | `applicants-pages/dashboard-page.ts` (extend) | — |
| P0-I | `applicants-dashboard-edge-dev-tests.spec.ts` | `applicants-pages/dashboard-edge-page.ts` (NEW) | — |
| P1-A | `auth-surfaces-dev-tests.spec.ts` | `applicants-pages/register-page.ts` (NEW), `applicants-pages/forgot-password-page.ts` (NEW), `applicants-pages/auth0-callback-page.ts` (NEW) | — |
| P1-B | `application-connect-accounts-dev-tests.spec.ts` | `application-pages/connect-accounts-page.ts` (NEW), `application-pages/connect-later-page.ts` (NEW) | — |
| P1-C | `admin-surfaces-dev-tests.spec.ts` | `applicants-pages/applications-queue-page.ts` (NEW), `applicants-pages/mission-control-page.ts` (NEW), `applicants-pages/aml-page.ts` (NEW), `applicants-pages/kyc-page.ts` (NEW) | — |
| P2-A | `wiki-dev-tests.spec.ts` | `applicants-pages/wiki-page.ts` (NEW) | — |
| P2-B | `phone-application-dev-tests.spec.ts` | `application-pages/phone-application-page.ts` (NEW) | — |
| P2-C | `corporate-overview-dev-tests.spec.ts` | `applicants-pages/corporate-overview-page.ts` (NEW) | — |
| P3-A | `infra-cross-cutting-dev-tests.spec.ts` | `applicants-pages/infra-page.ts` (NEW) | — |

Constraints satisfied:
- Each phase owns exactly ONE new spec file.
- Shared page objects (`signup-page.ts`, `employment-page.ts`, `application-page.ts`, `dashboard-page.ts`) are extended by exactly ONE phase each.
- `test-metadata.ts` is centralised under P0-A (which adds **every** new id introduced across all phases). Other phases reference those ids without editing the file.
- `pages/applicants-pages/login-page.ts` is read-only for every phase (its `loginToApplicantsPortal` / `prodBypassLogin` helpers are imported but never modified).

---

## Auth pattern reference

- **CI bypass** = `await ApplicantsLoginPage.navigateToApplicantsAuth0LoginPage(); await ApplicantsLoginPage.loginToApplicantsPortal('sotheby@joinlita.com', 'Sotheby123?')`
  Use for any test that needs `/applicants`, `/dashboard`, `/applications`, `/corporate-overview`, `/aml`, `/kyc`, `/wiki`, or a user with the admin/realtor role seeded.
- **No-auth** = navigate directly via `gotoURL` (used for `/application/**` flow, `/register`, `/forgot-password`, `/login?...`, `/api/health`, etc.).
- **Prod bypass** = `await LoginPage.loginToProdApplicantPortal(...)` (only used by phases that explicitly cover production; this plan keeps everything as DEV/dev mocks to maximise coverage and stability).

---

## Phase P0-A — Application Signup Extra Coverage

**Spec:** `frontend/eHousing_Web/tests/testcases/application-signup-extra-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/application-pages/signup-page.ts` (extend)
**Shared file owned by this phase:** `frontend/eHousing_Common/src/ehousing-playwright/setup/test-metadata.ts` (append all new ids for every phase below)
**Auth:** No-auth — `SignupPage.navigateToSignupDevPage()`
**Estimated test count:** 5

### Page-object additions
- `verifyEmailExistsErrorIsDisplayed()` already exists; ensure it asserts text "An application with this email already exists." and that the Next button stays disabled.
- `verifyDraftRestoredFromEmail(email)` — assert that after `gotoURL('/application/signup?email=…')` the email input has the supplied value AND the name input is pre-filled with the `fullName` from the mocked draft response.
- `enterMaxLengthName(value)` — fill name with a 200-char string and assert input value is truncated/accepted.
- `enterUnsupportedCharacterEmail(email)` — fill an email containing whitespace; rely on `verifyInvalidEmailErrorIsDisplayed()`.

### Tests to add
1. `[Application][DEV][Signup][Regression] Email-already-exists error surfaces from /api/applications/lookup`
   - **Mocks:**
     - `**/api/applications/lookup**` → 200 `{ id: 42 }` (signals existing application).
     - `**/api/applications/draft**` GET → 200 `{ email: 'taken@example.com', fullName: 'Existing User', country: 'JP', businessOwnership: 'employee' }`.
   - **Steps:** `navigateToSignupDevPage` → `fillEmail('taken@example.com')` → `focusEmailAndBlur('taken@example.com')`.
   - **Asserts:** "An application with this email already exists." visible; Next button disabled.

2. `[Application][DEV][Signup][Regression] Draft auto-restores from /application/signup?email= prefill`
   - **Mocks:** `**/api/applications/draft?email=*` GET → 200 with `{ email, fullName: 'Restored Draft', phone: '+81 90 0000 0000', countryDialCode: '+81', country: 'JP', businessOwnership: 'employee' }`.
   - **Steps:** Navigate to `http://localhost:3000/application/signup?email=resume@example.com`; allow draft to load.
   - **Asserts:** email input has value `resume@example.com`; name input has value `Restored Draft`; both consent checkboxes are checked (page restores acceptance).

3. `[Application][DEV][Signup][Regression] Long name is accepted up to UI maximum`
   - **Mocks:** None (validation is client-side).
   - **Steps:** `fillEmail('long@example.com')` → `enterMaxLengthName('A'.repeat(200))` → check both consents.
   - **Asserts:** Next button enabled; name input value length ≤ 200; no JS console error captured by `page.on('pageerror')` listener.

4. `[Application][DEV][Signup][Regression] Whitespace inside email triggers validation error`
   - **Mocks:** None.
   - **Steps:** `enterUnsupportedCharacterEmail('foo bar@example.com')`.
   - **Asserts:** `verifyInvalidEmailErrorIsDisplayed()`; Next button disabled.

5. `[Application][DEV][Signup][Regression] Empty draft GET (404) does not pre-fill form`
   - **Mocks:** `**/api/applications/draft**` GET → 404.
   - **Steps:** `navigateToSignupDevPage()`; wait for form ready.
   - **Asserts:** email input value is empty; name input value is empty; both consent checkboxes unchecked; Next disabled.

### test-metadata ids (this phase appends ALL new ids in one batch)
This phase owns `test-metadata.ts`. Append the following ids — used by every other phase below — in a single PR. Each entry uses owner `Tobias Andersen - [a.tobias@dwilar.tech]`, parentSuite `eHousing Web Regression`, severity `NORMAL` (or `CRITICAL` where flagged), and tags matching the bracketed sub-area.

```
eHousingApplicationDevSignupEmailExists
eHousingApplicationDevSignupDraftRestored
eHousingApplicationDevSignupLongName
eHousingApplicationDevSignupWhitespaceEmail
eHousingApplicationDevSignupEmptyDraft

eHousingApplicationDevPasscodeInvalidCode
eHousingApplicationDevPasscodeExpired
eHousingApplicationDevPasscodeResendCooldown
eHousingApplicationDevPasscodePasteCode
eHousingApplicationDevPasscodeReloadPersists

eHousingApplicationDevEmploymentNoResultsState
eHousingApplicationDevEmploymentAllTypesSelectable
eHousingApplicationDevEmploymentNextDisabledNoCountry
eHousingApplicationDevEmploymentDraftPersistsCountry

eHousingApplicationDevReviewFieldsRendered
eHousingApplicationDevReviewEditBackNavigates
eHousingApplicationDevReviewSubmissionFailure
eHousingApplicationDevReviewSubmissionServerError
eHousingApplicationDevReviewReferenceGenerated
eHousingApplicationDevReviewMissingDataPlaceholders

eHousingApplicationDevConfirmDateFormatted
eHousingApplicationDevConfirmSendLoginEmail
eHousingApplicationDevConfirmLoginEmailDebounce

eHousingApplicationDevGateEmailPrefill
eHousingApplicationDevGateLoginModeForced
eHousingApplicationDevGateInvalidEmail
eHousingApplicationDevGateRedirectsToLoginVerify
eHousingApplicationDevLoginVerifyOtpSend
eHousingApplicationDevLoginVerifyOtpAccepted
eHousingApplicationDevLoginVerifyNotFoundState
eHousingApplicationDevLoginVerifySubmittedState
eHousingApplicationDevLoginVerifyErrorState

eHousingApplicantsDevSortOrderToggle
eHousingApplicantsDevDeleteAllConfirmModal
eHousingApplicantsDevExportCsvDownload
eHousingApplicantsDevPaginationVisible
eHousingApplicantsDevEmptyState
eHousingApplicantsDevArchiveToastSuccess
eHousingApplicantsDevArchiveFailureToast
eHousingApplicantsDevRoleGatedActionsRealtor
eHousingApplicantsDevActionsMenuViewProfile
eHousingApplicantsDevArchivedRowHidden

eHousingDashboardDevCustomerInfoSection
eHousingDashboardDevEmploymentDetailRendered
eHousingDashboardDevPersonaAttributesRendered
eHousingDashboardDevHousingPaymentHistoryRendered
eHousingDashboardDevCreditInformationRendered
eHousingDashboardDevCreditHistoryRendered
eHousingDashboardDevAccountSummaryRendered
eHousingDashboardDevCurrencyToggle
eHousingDashboardDevAverageCashFlowDialog
eHousingDashboardDevDecisionApprove
eHousingDashboardDevDecisionDeny
eHousingDashboardDevDecisionHold
eHousingDashboardDevLatestSnapshotControl

eHousingDashboardDevMissingApplicant404
eHousingDashboardDevCreditScorePending
eHousingDashboardDevCreditScore404Fallback
eHousingDashboardDevNoConnectedAccountsState
eHousingDashboardDevArchivedApplicantView
eHousingDashboardDevLoanPaymentCardSynthetic

eHousingAuthDevRegisterFormValidation
eHousingAuthDevRegisterPasswordRequirements
eHousingAuthDevRegisterAuth0Conflict
eHousingAuthDevRegisterAuth0Success
eHousingAuthDevForgotPasswordEmailValidation
eHousingAuthDevForgotPasswordSuccessCopy
eHousingAuthDevForgotPasswordIdempotentSubmit
eHousingAuthDevAuth0CallbackSuccess
eHousingAuthDevAuth0CallbackError

eHousingApplicationDevConnectPlaidUSRendered
eHousingApplicationDevConnectSaltEdgeNonUSRendered
eHousingApplicationDevConnectSkipFlow
eHousingApplicationDevConnectRemoveAccount
eHousingApplicationDevConnectCategoryOverrides
eHousingApplicationDevConnectMissingCustomerId
eHousingApplicationDevConnectLaterPagePreservesQuery

eHousingAdminDevApplicationsQueueLoads
eHousingAdminDevApplicationsQueueKpis
eHousingAdminDevApplicationsQueueOptimisticArchive
eHousingAdminDevMissionControlUseCases
eHousingAdminDevMissionControlConsentMutation
eHousingAdminDevAmlMatchStatuses
eHousingAdminDevAmlIdentityProviderBadges
eHousingAdminDevKycStatusBadges
eHousingAdminDevKycRefreshRetry

eHousingWikiDevDefaultProfileLoads
eHousingWikiDevJpDashboardVariant
eHousingWikiDevLocaleSwitchJa
eHousingWikiDevBackLabelLocalised

eHousingPhoneApplicationDevPageLoads
eHousingPhoneApplicationDevPlaidConnect
eHousingPhoneApplicationDevSaltEdgeConnect
eHousingPhoneApplicationDevPaymentHistoryViewer
eHousingPhoneApplicationDevDummyAccountIndicators

eHousingCorporateDevKpiCardsRender
eHousingCorporateDevRechartsBarsRender
eHousingCorporateDevLocaleToggle

eHousingInfraDevHealthEndpointReachable
eHousingInfraDevReadyEndpointReturns200
eHousingInfraDevLocaleMiddlewareSetsHeaders
eHousingInfraDevSentryExampleErrorSurfaces
eHousingInfraDevApplicantsLoadingSkeleton
```

---

## Phase P0-B — Application Passcode Step Edge Cases

**Spec:** `frontend/eHousing_Web/tests/testcases/application-passcode-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/application-pages/passcode-page.ts` (NEW)
**Auth:** No-auth — completes signup first to land on `/application/passcode`.
**Estimated test count:** 5

### Page-object exports
- `verifyPasscodePageIsDisplayed()` — URL regex `/application/passcode` + heading `Verify your email`.
- `fillIndividualPasscodeDigit(index, digit)` — 1-indexed.
- `fillFullPasscode(code: string)` — 6-char string.
- `pasteFullPasscode(code: string)` — focus first digit input, dispatch `paste` event with `clipboardData`. Asserts all 6 inputs filled.
- `clickResendCode()` — clicks the "Resend code" button.
- `verifyResendCooldown(seconds: number)` — asserts the button label contains a countdown e.g. `Resend in 0:30`.
- `verifyInvalidPasscodeError()` — asserts text matching `/Invalid|incorrect|expired/i`.
- `verifyVerifyButtonEnabled() / verifyVerifyButtonDisabled()`.
- `verifyExpiredOtpMessage()` — text "code has expired" (or similar) visible.

### Shared mocks (all tests use a `beforeEach` that signs up first)
- `**/api/applications/draft**` GET → 404 / POST → 200.
- `**/api/v1/applications/otp` POST → 200 `{ status: 'sent' }`.

### Tests
1. `[Application][DEV][Passcode][Regression] Invalid passcode shows verification error`
   - **Mocks:** `**/api/v1/applications/verify-passcode` POST → 400 `{ error: 'Invalid code' }`.
   - **Steps:** Sign-up flow → `fillFullPasscode('999999')`.
   - **Asserts:** `verifyInvalidPasscodeError()`; URL still on `/application/passcode`.

2. `[Application][DEV][Passcode][Regression] Expired OTP rejected with explicit message`
   - **Mocks:** `**/api/v1/applications/verify-passcode` POST → 400 `{ error: 'expired', message: 'This code has expired.' }`.
   - **Steps:** signup → `fillFullPasscode('123456')`.
   - **Asserts:** `verifyExpiredOtpMessage()`; resend button enabled.

3. `[Application][DEV][Passcode][Regression] Resend code button enters cooldown after click`
   - **Mocks:** `**/api/v1/applications/otp` POST → 200; second call (after click) → 200.
   - **Steps:** signup → `clickResendCode()`.
   - **Asserts:** `verifyResendCooldown(30)`; button disabled while counting down.

4. `[Application][DEV][Passcode][Regression] Pasting 6-digit code populates all inputs`
   - **Mocks:** `**/api/v1/applications/verify-passcode` POST → 200 `{ verified: true }`.
   - **Steps:** signup → `pasteFullPasscode('246810')`.
   - **Asserts:** each of `Digit 1`…`Digit 6` inputs has the corresponding value; verify button enabled.

5. `[Application][DEV][Passcode][Regression] Passcode persists across reload via localStorage`
   - **Mocks:** verify-passcode 200 (only used after reload to confirm flow continues).
   - **Steps:** signup → `fillFullPasscode('135790')` → `page.reload()`.
   - **Asserts:** after reload `localStorage.getItem('dw_application_otp_email')` matches the signup email; the page still shows the passcode UI (heading visible).

---

## Phase P0-C — Application Employment Step Extra Coverage

**Spec:** `frontend/eHousing_Web/tests/testcases/application-employment-extra-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/application-pages/employment-page.ts` (extend)
**Auth:** No-auth — `beforeEach` runs signup + passcode to land on `/application/employment`.
**Estimated test count:** 4

### Page-object additions
- `searchForCountryWithNoResults(query)` — types nonsense and asserts the listbox shows a "No results" / empty state (or falls through to no `option` rows).
- `verifyCountryDropdownEmptyState()` — listbox visible but zero `option` children.
- `verifyNextButtonDisabled()` / `verifyNextButtonEnabled()` — adjacency to the existing `clickNext()`.
- `selectAllEmploymentTypesInOrder()` helper that selects each tab and asserts `verifyEmploymentTabIsSelected` for: Full-time, Self - employed, Business owner, Retired, Other.

### Shared mocks (`beforeEach`)
- Same as the existing `Employment Step` block in `application-steps-dev-tests.spec.ts` (draft 404, otp/verify-passcode 200).

### Tests
1. `[Application][DEV][Employment][Regression] Country dropdown shows empty state for nonsense search`
   - **Mocks:** none beyond signup-flow.
   - **Steps:** `openCountrySelector()` → `searchForCountry('Zzzzzzzz')`.
   - **Asserts:** `verifyCountryDropdownEmptyState()`.

2. `[Application][DEV][Employment][Regression] All five employment types selectable`
   - **Mocks:** none.
   - **Steps:** `selectAllEmploymentTypesInOrder()`.
   - **Asserts:** for each type `verifyEmploymentTabIsSelected(type)` returns true; final selection is `Other`.

3. `[Application][DEV][Employment][Regression] Next button disabled until country selected`
   - **Mocks:** none.
   - **Steps:** Land on employment without picking a country.
   - **Asserts:** `verifyNextButtonDisabled()`. Then `selectCountry('United States')`. Asserts `verifyNextButtonEnabled()`.

4. `[Application][DEV][Employment][Regression] Country choice persists in draft after reload`
   - **Mocks:** `**/api/applications/draft**` POST captures payload via a `let savedCountry` flag and returns 200; GET → 200 `{ country: 'JP' }`.
   - **Steps:** `selectCountry('Japan')` → `page.reload()`.
   - **Asserts:** country selector trigger displays `Japan` after reload (read aria value or trigger text).

---

## Phase P0-D — Application Review Step

**Spec:** `frontend/eHousing_Web/tests/testcases/application-review-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/application-pages/review-page.ts` (NEW)
**Auth:** No-auth.
**Estimated test count:** 6

### Page-object exports
- `verifyReviewPageIsDisplayed()` — URL `/application/review` + heading `Review & Submit`.
- `verifyReviewSummaryFields({ email, fullName, country, employmentType, accounts })` — for each label asserts the corresponding text/value is rendered (uses `getByText` with regex).
- `clickEditButton(section: 'employment'|'accounts'|'identity')` — clicks the per-section "Edit" link/button.
- `verifyMissingDataPlaceholder(field: string)` — asserts text "Not provided" present for the given field (e.g. when phone is empty).
- `submitReview()` — `dispatchEvent('click')` on Submit (mirrors `ApplicationFlowPage.submitApplication`).
- `verifySubmissionFailureToast()` — assert "Failed to submit" / error toast visible.
- `verifyReferenceMatchesPattern()` — read `localStorage.getItem('dw_application_reference')` and assert `/^AP_[A-Z0-9]{7}$/` after submit.

### Shared `beforeEach`
- Mocks: draft 404, otp/verify-passcode 200, provision-account 200.
- Run sign-up → passcode → employment → arrive at `/application/connect-accounts`.
- Seed `dw_application_connected_accounts` + `userFormData` + reload (existing pattern).
- Navigate to review.

### Tests
1. `[Application][DEV][Review][Regression] Review summary renders all expected fields`
   - **Mocks:** `**/api/v1/applications` POST → never called (test only navigates to review, not submit).
   - **Steps:** `navigateToReviewStep()`.
   - **Asserts:** `verifyReviewSummaryFields({ email: 'review@example.com', fullName: 'Review Test', country: 'United States', employmentType: 'Full-time', accounts: ['Test Checking'] })`.

2. `[Application][DEV][Review][Regression] Edit-back navigation returns to employment`
   - **Mocks:** none new.
   - **Steps:** `navigateToReviewStep()` → `clickEditButton('employment')`.
   - **Asserts:** URL matches `/application/employment`.

3. `[Application][DEV][Review][Regression] Submission failure surfaces toast and stays on review page`
   - **Mocks:** `**/api/v1/applications` POST → 400 `{ error: 'Validation failed' }`.
   - **Steps:** `navigateToReviewStep()` → `submitReview()`.
   - **Asserts:** `verifySubmissionFailureToast()`; URL still `/application/review`; submit button re-enabled.

4. `[Application][DEV][Review][Regression] 500 server error surfaces friendly message`
   - **Mocks:** `**/api/v1/applications` POST → 500 `{ error: 'Internal' }`.
   - **Steps:** `navigateToReviewStep()` → `submitReview()`.
   - **Asserts:** `verifySubmissionFailureToast()` (message containing "try again"); URL still `/application/review`.

5. `[Application][DEV][Review][Regression] Submit generates dw_application_reference matching AP_ pattern`
   - **Mocks:** `**/api/v1/applications` POST → 201 `{ id: 'app_999' }`; provision-account 200.
   - **Steps:** `navigateToReviewStep()` → `submitReview()`.
   - **Asserts:** URL `/application/confirm` reached; `verifyReferenceMatchesPattern()`.

6. `[Application][DEV][Review][Regression] Missing phone number renders Not provided placeholder`
   - **Mocks:** seed `userFormData` with `phone: ''`.
   - **Steps:** `navigateToReviewStep()`.
   - **Asserts:** `verifyMissingDataPlaceholder('phone')` (regex `/Not provided/i`).

---

## Phase P0-E — Application Confirm Step

**Spec:** `frontend/eHousing_Web/tests/testcases/application-confirm-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/application-pages/confirm-page.ts` (NEW)
**Auth:** No-auth.
**Estimated test count:** 3

### Page-object exports
- `verifyConfirmationPageIsDisplayed()` — URL `/application/confirm` + heading `Application Submitted!` + visible `Lita ID:`.
- `verifySubmissionDateFormatted()` — asserts a date string matching `/[A-Z][a-z]+ \d{1,2}, \d{4}/` is rendered.
- `clickSendLoginEmail()` — clicks the "Email me a login link" CTA.
- `verifySendLoginEmailToast()` — asserts success toast visible.
- `verifySendLoginEmailDebounced()` — clicks twice quickly; asserts `localStorage.getItem('dw_application_login_email_sent')` is set and only ONE network call to `**/api/v1/applications/send-login-email` is made (track via request listener).

### Shared `beforeEach`
- Run the full happy-path flow (mirrors `[Application][DEV][Confirm][Regression] Confirmation page loads after submit`) ending on `/application/confirm`.

### Tests
1. `[Application][DEV][Confirm][Regression] Submission date renders formatted as Month Day, Year`
   - **Mocks:** none extra.
   - **Asserts:** `verifySubmissionDateFormatted()`.

2. `[Application][DEV][Confirm][Regression] Send login email CTA fires API call and toasts success`
   - **Mocks:** `**/api/v1/applications/send-login-email` POST → 200.
   - **Steps:** `clickSendLoginEmail()`.
   - **Asserts:** `verifySendLoginEmailToast()`.

3. `[Application][DEV][Confirm][Regression] Send login email is debounced via localStorage key`
   - **Mocks:** `**/api/v1/applications/send-login-email` POST → 200.
   - **Steps:** Click CTA twice within 1s.
   - **Asserts:** `verifySendLoginEmailDebounced()` — only one POST captured.

---

## Phase P0-F — Application Gate + Login-Verify Resume Flow

**Spec:** `frontend/eHousing_Web/tests/testcases/application-gate-dev-tests.spec.ts` (NEW)
**Page objects:**
- `frontend/eHousing_Web/tests/pages/application-pages/gate-page.ts` (NEW)
- `frontend/eHousing_Web/tests/pages/application-pages/login-verify-page.ts` (NEW)

**Auth:** No-auth.
**Estimated test count:** 9

### `gate-page.ts` exports
- `navigateToApplicationGate(query?: string)` — `gotoURL('http://localhost:3000/application' + (query ?? ''))`.
- `verifyEmailPrefill(email)` — assert email input has the supplied value.
- `verifyLoginModeActive()` — assert "Resume" / "Continue" CTA visible (vs "Start a new application").
- `submitGateEmail(email)` — fill + click `Continue`/`Next`.
- `verifyInvalidEmailRejection()` — assert validation message visible.
- `verifyRedirectsToLoginVerify(email)` — `expectPageToHaveURL` matching `/application/login-verify\?email=…`.

### `login-verify-page.ts` exports
- `verifyLoginVerifyPageIsDisplayed()` — URL + heading `Verify your email` (or similar).
- `fillLoginVerifyPasscode(code)` — fills 6 digits.
- `verifyResumeStateNotFound()` — text `/We couldn't find an application/i`.
- `verifyResumeStateSubmitted()` — text `/already been submitted/i`.
- `verifyResumeStateError()` — text `/Something went wrong/i`.
- `verifyRedirectingToDashboard()` — URL `/dashboard`.

### Tests
1. `[Application][DEV][Gate][Regression] Email pre-fill from ?email= populates form`
   - **Mocks:** `**/api/applications/lookup**` → 200 `{ id: null }`.
   - **Steps:** `navigateToApplicationGate('?email=hello@example.com')`.
   - **Asserts:** `verifyEmailPrefill('hello@example.com')`.

2. `[Application][DEV][Gate][Regression] ?login=1 forces login mode`
   - **Mocks:** lookup → 200 `{ id: 7 }`.
   - **Steps:** `navigateToApplicationGate('?email=hello@example.com&login=1')`.
   - **Asserts:** `verifyLoginModeActive()`.

3. `[Application][DEV][Gate][Regression] Invalid email is rejected before navigation`
   - **Mocks:** none.
   - **Steps:** `submitGateEmail('not-an-email')`.
   - **Asserts:** `verifyInvalidEmailRejection()`; URL stays `/application`.

4. `[Application][DEV][Gate][Regression] Valid email redirects to /application/login-verify`
   - **Mocks:** `**/api/applications/lookup**` → 200 `{ id: 7 }`.
   - **Steps:** `submitGateEmail('hello@example.com')`.
   - **Asserts:** `verifyRedirectsToLoginVerify('hello@example.com')`.

5. `[Application][DEV][LoginVerify][Regression] OTP send fires on page load`
   - **Mocks:** `**/api/v1/applications/otp` POST → 200; capture call count.
   - **Steps:** `gotoURL('http://localhost:3000/application/login-verify?email=hi@example.com')`.
   - **Asserts:** otp endpoint called exactly once; `verifyLoginVerifyPageIsDisplayed()`.

6. `[Application][DEV][LoginVerify][Regression] Valid passcode triggers redirect to dashboard`
   - **Mocks:** otp 200; verify-passcode 200 with `{ verified: true, redirect: '/dashboard' }`; mock `**/api/applications/lookup**` → `{ id: 7 }`.
   - **Steps:** Land on login-verify → `fillLoginVerifyPasscode('123456')`.
   - **Asserts:** `verifyRedirectingToDashboard()`.

7. `[Application][DEV][LoginVerify][Regression] not_found resume state renders`
   - **Mocks:** otp 200; verify-passcode 200 returning `{ verified: true, applicationId: null }`; lookup → `{ id: null }`.
   - **Steps:** `fillLoginVerifyPasscode('123456')`.
   - **Asserts:** `verifyResumeStateNotFound()`.

8. `[Application][DEV][LoginVerify][Regression] submitted resume state renders`
   - **Mocks:** verify-passcode 200 → `{ verified: true, status: 'submitted', applicationId: 9 }`.
   - **Steps:** `fillLoginVerifyPasscode('123456')`.
   - **Asserts:** `verifyResumeStateSubmitted()`.

9. `[Application][DEV][LoginVerify][Regression] error resume state renders`
   - **Mocks:** verify-passcode 500.
   - **Steps:** `fillLoginVerifyPasscode('123456')`.
   - **Asserts:** `verifyResumeStateError()`.

---

## Phase P0-G — Applicants Overview Extra Coverage

**Spec:** `frontend/eHousing_Web/tests/testcases/applicants-overview-extra-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/applicants-pages/application-page.ts` (extend)
**Auth:** CI bypass (`loginToApplicantsPortal` in `beforeEach`).
**Estimated test count:** 10

### Page-object additions
- `toggleSortOrder()` — clicks the existing "Sort by" control, asserts indicator order flips (caret-up vs caret-down).
- `verifyDefaultSortIsDescending()` — heuristic: read first row's "Submitted" date and assert it's the most recent in the visible page.
- `openDeleteAllConfirmModal()` — click `Delete all`; assert dialog visible with `Confirm` + `Cancel`.
- `cancelDeleteAllModal()` — click `Cancel`; assert dialog dismissed.
- `triggerExportCsv()` — click `Export CSV` and capture the `download` event via `page.waitForEvent('download')`. Assert filename matches `/applicants.*\.csv/i`.
- `verifyTablePagination()` — asserts pagination controls (`Previous`, `Next`, page indicator) visible when row count > page size.
- `verifyEmptyState()` — when list is empty, asserts "No applicants found" / similar copy visible.
- `verifyArchiveSuccessToast(applicantName)` — assert toast `Deleted ${name}.` visible.
- `verifyArchiveFailureToast()` — assert toast text matching `/Failed to archive|error/i`.
- `verifyRowHidden(applicantName)` — asserts the applicant's row is no longer present in the DOM after archive.
- `verifyActionsLockedForRealtor(applicantName)` — for realtor role, assert `Open actions for ${name}` button is hidden OR menu items "Archive Applicant" hidden.
- `clickViewProfileFromActionsMenu(applicantName)` — click the actions menu's `View Profile` item.

### Shared `beforeEach` (login flow)
Reuses CI bypass via `ApplicantsLoginPage.loginToApplicantsPortal('sotheby@joinlita.com', 'Sotheby123?')`.

### Tests
1. `[Applicants][DEV][E2E][Regression] Sort by toggle flips order`
   - **Mocks:** none beyond default CI bypass mocks.
   - **Steps:** `verifyDefaultSortIsDescending()` → `toggleSortOrder()`.
   - **Asserts:** order flipped (compare first row before vs after).

2. `[Applicants][DEV][E2E][Regression] Delete all opens confirmation modal and Cancel dismisses`
   - **Mocks:** none.
   - **Steps:** `openDeleteAllConfirmModal()` → `cancelDeleteAllModal()`.
   - **Asserts:** dialog visible then hidden; no `DELETE /api/v1/applications` request fired (track via request listener).

3. `[Applicants][DEV][E2E][Regression] Export CSV triggers a CSV download`
   - **Mocks:** intercept `**/api/applications?format=csv*` (or whatever the UI hits) → return CSV body with `Content-Type: text/csv` and `Content-Disposition: attachment`.
   - **Steps:** `triggerExportCsv()`.
   - **Asserts:** download event fired; suggested filename matches `/applicants.*\.csv/i`.

4. `[Applicants][DEV][E2E][Regression] Pagination controls render when more than 25 rows`
   - **Mocks:** override `**/api/applications` GET → return 30 rows synthesized from Ayaka template.
   - **Steps:** `verifyTablePagination()`.
   - **Asserts:** Next/Previous buttons visible; page indicator shows `1` of `2`.

5. `[Applicants][DEV][E2E][Regression] Empty state shown when list is empty`
   - **Mocks:** override `**/api/applications` GET → `[]`; `**/api/v1/applications` GET → `[]`.
   - **Steps:** Reload `/applicants`.
   - **Asserts:** `verifyEmptyState()`; no `tbody tr` rows present.

6. `[Applicants][DEV][E2E][Regression] Archive applicant shows success toast`
   - **Mocks:** `**/api/v1/applications/16/archive` POST → 200 `{ success: true }`.
   - **Steps:** Open Ayaka profile → `archiveApplicantFromProfileHeader()`.
   - **Asserts:** `verifyArchiveSuccessToast('Ayaka Inoue')`.

7. `[Applicants][DEV][E2E][Regression] Archive failure surfaces error toast`
   - **Mocks:** `**/api/v1/applications/16/archive` POST → 500.
   - **Steps:** Open Ayaka profile → `archiveApplicantFromProfileHeader()`.
   - **Asserts:** `verifyArchiveFailureToast()`; profile remains open (URL unchanged).

8. `[Applicants][DEV][E2E][Regression] Realtor role hides archive actions`
   - **Mocks:** override `addInitScript` so `localStorage.authUser.role = 'realtor'`; `**/api/applications` GET → list with one applicant.
   - **Steps:** Open actions menu for Ayaka.
   - **Asserts:** `verifyActionsLockedForRealtor('Ayaka Inoue')`.

9. `[Applicants][DEV][E2E][Regression] Actions menu View Profile opens dashboard`
   - **Mocks:** none beyond CI bypass.
   - **Steps:** `clickViewProfileFromActionsMenu('Ayaka Inoue')`.
   - **Asserts:** URL matches `/dashboard?id=16`.

10. `[Applicants][DEV][E2E][Regression] Archived row hidden from list after archive`
    - **Mocks:** archive 200; subsequent `**/api/applications` GET → `[]` (simulating list refresh).
    - **Steps:** Archive → wait for list refresh.
    - **Asserts:** `verifyRowHidden('Ayaka Inoue')`.

---

## Phase P0-H — Dashboard Expanded Sections

**Spec:** `frontend/eHousing_Web/tests/testcases/applicants-dashboard-extra-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/applicants-pages/dashboard-page.ts` (extend)
**Auth:** CI bypass.
**Estimated test count:** 13

### Page-object additions
- `verifyCustomerInformationSectionRendered()` — heading `Customer Information` + name + email + phone visible.
- `verifyEmploymentDetailRendered()` — section "Employment Information" shows employer/title/income.
- `verifyPersonaAttributesRendered()` — heading `Persona Attributes` (or similar) plus at least one attribute pill.
- `verifyHousingPaymentHistoryRendered()` — heading `Housing Payment History`; rows with date + amount.
- `verifyCreditInformationRendered()` — heading `Credit Information`; score visible.
- `verifyCreditHistoryRendered()` — heading `Credit History`; chart or list of past scores.
- `verifyAccountSummaryRendered()` — heading `Account Summary`; cards for connected accounts.
- `toggleCurrency(targetCurrency: 'USD'|'JPY'|'EUR')` — opens currency selector and picks target.
- `verifyCurrencyDisplayed(targetCurrency)` — asserts a tile uses the new currency symbol.
- `openAverageCashFlowDialog()` / `verifyAverageCashFlowDialog()` — clicks tile, asserts dialog with monthly breakdown.
- `submitDecision(decision: 'approved'|'denied'|'pending')` — clicks the corresponding decision button + confirm.
- `verifyDecisionBadge(decision)` — assert the status badge in the header reflects the new decision.
- `clickLatestSnapshotControl()` / `verifyLatestSnapshotPanel()` — assert latest snapshot panel populated with 1+ snapshot row.

### Shared mocks (single helper used by all tests in this spec)
A helper `mockFullDashboardData(page)` registers route handlers for:
- `**/api/v1/applications/16` GET → full Ayaka payload with `connected_accounts.personal[0].employer`, `persona_attributes`, etc.
- `**/api/v1/applications/16/credit-score` GET → 200 with `{ score: 696, history: [...], factors: [...] }`.
- `**/api/v1/applicants/16/transactions` GET → 200 with 6 months of transactions including `Salary Deposit` and `Rent Payment`.
- `**/api/v1/applications/16/payment-history` GET → 200 with 12 months of housing repayments.
- `**/api/v1/applications/16/account-balances` GET → 200.
- `**/api/v1/applicants/16/account-coverage` GET → 200 with `{ ratio: 0.92 }`.
- `**/api/v1/applications/16/saltedge-holder-info` GET → 200.
- `**/api/v1/applications/16/decision` POST → 200 `{ status: 'approved' }` (or whatever payload supplied).

### Tests
1. `[Dashboard][DEV][E2E][Regression] Customer Information section renders applicant identity`
   - **Asserts:** `verifyCustomerInformationSectionRendered()`.

2. `[Dashboard][DEV][E2E][Regression] Employment Information detail renders`
   - **Asserts:** `verifyEmploymentDetailRendered()`.

3. `[Dashboard][DEV][E2E][Regression] Persona attributes panel renders`
   - **Asserts:** `verifyPersonaAttributesRendered()`.

4. `[Dashboard][DEV][E2E][Regression] Housing Payment History renders rows from /payment-history`
   - **Asserts:** `verifyHousingPaymentHistoryRendered()`; assert ≥ 12 rows present.

5. `[Dashboard][DEV][E2E][Regression] Credit Information section renders score`
   - **Asserts:** `verifyCreditInformationRendered()`; score text contains `696`.

6. `[Dashboard][DEV][E2E][Regression] Credit History chart renders historical scores`
   - **Asserts:** `verifyCreditHistoryRendered()`.

7. `[Dashboard][DEV][E2E][Regression] Account Summary section renders connected accounts`
   - **Asserts:** `verifyAccountSummaryRendered()`; `Ayaka Personal Checking` present.

8. `[Dashboard][DEV][E2E][Regression] Currency selector toggles between USD and JPY`
   - **Steps:** `toggleCurrency('JPY')`.
   - **Asserts:** `verifyCurrencyDisplayed('JPY')`; tile labels contain `¥` or `JPY`.

9. `[Dashboard][DEV][E2E][Regression] Average Cash Flow dialog opens with monthly breakdown`
   - **Steps:** `openAverageCashFlowDialog()`.
   - **Asserts:** `verifyAverageCashFlowDialog()`.

10. `[Dashboard][DEV][E2E][Regression] Decision approve updates status badge`
    - **Mocks:** decision 200 `{ status: 'approved' }`.
    - **Steps:** `submitDecision('approved')`.
    - **Asserts:** `verifyDecisionBadge('approved')`.

11. `[Dashboard][DEV][E2E][Regression] Decision deny updates status badge`
    - **Mocks:** decision 200 `{ status: 'denied' }`.
    - **Steps:** `submitDecision('denied')`.
    - **Asserts:** `verifyDecisionBadge('denied')`.

12. `[Dashboard][DEV][E2E][Regression] Decision hold updates status badge`
    - **Mocks:** decision 200 `{ status: 'pending' }`.
    - **Steps:** `submitDecision('pending')`.
    - **Asserts:** `verifyDecisionBadge('pending')`.

13. `[Dashboard][DEV][E2E][Regression] Latest snapshot control populates with snapshot row`
    - **Mocks:** `**/api/v1/applications/16/bank-data` GET → 200 with snapshots.
    - **Steps:** `clickLatestSnapshotControl()`.
    - **Asserts:** `verifyLatestSnapshotPanel()`.

---

## Phase P0-I — Dashboard Edge & Error States

**Spec:** `frontend/eHousing_Web/tests/testcases/applicants-dashboard-edge-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/applicants-pages/dashboard-edge-page.ts` (NEW — to avoid clobbering shared `dashboard-page.ts`)
**Auth:** CI bypass.
**Estimated test count:** 6

### Page-object exports
- `navigateToMissingApplicantDashboard()` — `gotoURL('http://localhost:3000/dashboard?id=99999')`.
- `verifyMissing404Fallback()` — assert text `/We couldn't find that applicant|Applicant not found/i` visible.
- `verifyCreditScorePendingModal()` — assert modal heading `Credit score pending` (or similar) with retry CTA.
- `verifyCreditScoreFallbackUI()` — even with 404 from credit-score endpoint, dashboard still renders financial tiles.
- `verifyNoConnectedAccountsState()` — assert "No connected accounts" placeholder visible.
- `verifyArchivedApplicantBanner()` — assert banner `This applicant has been archived` visible.
- `verifyLoanPaymentCardSyntheticVisible()` — when `NEXT_PUBLIC_ENABLE_CREDIT_FALLBACK` toggled, assert `Loan Repayment` card surfaces with synthetic loan rows.

### Tests
1. `[Dashboard][DEV][E2E][Regression] Missing applicant returns 404 fallback UI`
   - **Mocks:** `**/api/v1/applications/99999` GET → 404; `**/api/applications/99999` GET → 404.
   - **Steps:** `navigateToMissingApplicantDashboard()`.
   - **Asserts:** `verifyMissing404Fallback()`.

2. `[Dashboard][DEV][E2E][Regression] Credit score pending modal renders when score=null`
   - **Mocks:** `**/api/v1/applications/16` GET → Ayaka payload with `credit_score: null`; `**/api/v1/applications/16/credit-score` GET → 202 `{ status: 'pending' }`.
   - **Steps:** Navigate to dashboard.
   - **Asserts:** `verifyCreditScorePendingModal()`.

3. `[Dashboard][DEV][E2E][Regression] Credit score 404 falls back without breaking UI`
   - **Mocks:** `**/api/v1/applications/16/credit-score` GET → 404; main applicant payload still 200.
   - **Steps:** Navigate to dashboard.
   - **Asserts:** `verifyCreditScoreFallbackUI()`; `verifyFinancialSnapshotTilesVisible()` (existing helper) passes; no JS console errors.

4. `[Dashboard][DEV][E2E][Regression] No connected accounts state renders`
   - **Mocks:** Ayaka payload override with `connected_accounts: { personal: [], business: [], investments: [] }`.
   - **Steps:** Navigate to dashboard.
   - **Asserts:** `verifyNoConnectedAccountsState()`.

5. `[Dashboard][DEV][E2E][Regression] Archived applicant view renders banner`
   - **Mocks:** Ayaka payload with `archived: true`.
   - **Steps:** Navigate to dashboard.
   - **Asserts:** `verifyArchivedApplicantBanner()`.

6. `[Dashboard][DEV][E2E][Regression] Loan payment card surfaces when synthetic loans applied`
   - **Mocks:** Ayaka payload with `connected_accounts.income_history` populated **and** `connected_accounts.synthetic_loans: [{ amount: 1500, dueDate: '2025-12-01' }]`. Also set env injection via `addInitScript` to flip `window.__NEXT_PUBLIC_ENABLE_CREDIT_FALLBACK = true` if needed.
   - **Asserts:** `verifyLoanPaymentCardSyntheticVisible()`.

---

## Phase P1-A — Auth Surfaces (register, forgot-password, Auth0 callback)

**Spec:** `frontend/eHousing_Web/tests/testcases/auth-surfaces-dev-tests.spec.ts` (NEW)
**Page objects:**
- `frontend/eHousing_Web/tests/pages/applicants-pages/register-page.ts` (NEW)
- `frontend/eHousing_Web/tests/pages/applicants-pages/forgot-password-page.ts` (NEW)
- `frontend/eHousing_Web/tests/pages/applicants-pages/auth0-callback-page.ts` (NEW)

**Auth:** No-auth.
**Estimated test count:** 9

### `register-page.ts` exports
- `navigateToRegisterPage()` — `gotoURL('http://localhost:3000/register')`.
- `fillRegisterForm({ email, password, confirmPassword, fullName })`.
- `submitRegister()`.
- `verifyPasswordRequirementsVisible()` — asserts the four hint rows (length ≥8, lowercase, uppercase, number).
- `verifyPasswordRequirementMet(label: 'length'|'lowercase'|'uppercase'|'number')` — asserts the corresponding hint shows the "met" state (icon class change or aria-checked=true).
- `verifyAuth0ConflictError()` — asserts text "An account with this email already exists" visible.
- `verifyRegisterSuccessRedirect()` — URL `/login` or `/auth/post-login` depending on flow.

### `forgot-password-page.ts` exports
- `navigateToForgotPasswordPage()` — `gotoURL('http://localhost:3000/forgot-password')`.
- `submitForgotPasswordForm(email)`.
- `verifyInvalidEmailError()`.
- `verifyCheckYourInboxCopy()` — text "Check your inbox" / "If an account exists" visible.

### `auth0-callback-page.ts` exports
- `navigateToAuth0SuccessCallback(payload: string)` — `gotoURL('http://localhost:3000/login?auth0_success=' + payload)`.
- `navigateToAuth0ErrorCallback(message: string)` — `gotoURL('http://localhost:3000/login?auth0_error=' + encodeURIComponent(message))`.
- `verifyAuth0SuccessForwarded()` — assert URL changes to `/applicants` or `/auth/post-login`.
- `verifyAuth0ErrorMessage(message: string)` — assert error text visible.

### Tests
1. `[Auth][DEV][Register][Regression] Register form validation enforces all fields`
   - **Mocks:** none.
   - **Steps:** `navigateToRegisterPage()` → submit empty.
   - **Asserts:** required-field errors visible; submit blocked.

2. `[Auth][DEV][Register][Regression] Password requirement hints turn green as user types`
   - **Mocks:** none.
   - **Steps:** Type `Aa1aaaaa` into password.
   - **Asserts:** `verifyPasswordRequirementMet('length')`, `verifyPasswordRequirementMet('lowercase')`, `verifyPasswordRequirementMet('uppercase')`, `verifyPasswordRequirementMet('number')`.

3. `[Auth][DEV][Register][Regression] Auth0 conflict (409) surfaces account-exists error`
   - **Mocks:** `**/api/auth/register` POST → 409 `{ error: 'user_exists' }`.
   - **Steps:** Submit valid form.
   - **Asserts:** `verifyAuth0ConflictError()`.

4. `[Auth][DEV][Register][Regression] Auth0 success redirects to login`
   - **Mocks:** `**/api/auth/register` POST → 200 `{ user_id: 'auth0|abc' }`.
   - **Steps:** Submit valid form.
   - **Asserts:** `verifyRegisterSuccessRedirect()`.

5. `[Auth][DEV][ForgotPassword][Regression] Invalid email shows validation error`
   - **Mocks:** none.
   - **Steps:** Submit `not-an-email`.
   - **Asserts:** `verifyInvalidEmailError()`.

6. `[Auth][DEV][ForgotPassword][Regression] Successful submit shows Check your inbox copy`
   - **Mocks:** `**/api/auth/forgot-password` (or whatever local endpoint) POST → 200.
   - **Steps:** Submit valid email.
   - **Asserts:** `verifyCheckYourInboxCopy()`.

7. `[Auth][DEV][ForgotPassword][Regression] Idempotent submit shows same copy without duplicate request`
   - **Mocks:** Track count of `forgot-password` requests; respond 200 each.
   - **Steps:** Submit twice.
   - **Asserts:** Two requests recorded; copy still present; no duplicate-error toast.

8. `[Auth][DEV][Auth0Callback][Regression] auth0_success forwards user to /applicants`
   - **Mocks:** Seed `auth` cookie + `authUser` localStorage via `addInitScript` (so middleware does not redirect back to Auth0). Also stub `**/api/applications` GET → `[]`.
   - **Steps:** `navigateToAuth0SuccessCallback('ok')`.
   - **Asserts:** `verifyAuth0SuccessForwarded()`.

9. `[Auth][DEV][Auth0Callback][Regression] auth0_error renders error message inline`
   - **Mocks:** none.
   - **Steps:** `navigateToAuth0ErrorCallback('access_denied')`.
   - **Asserts:** `verifyAuth0ErrorMessage('access_denied')`.

---

## Phase P1-B — Connect Accounts + Connect Later

**Spec:** `frontend/eHousing_Web/tests/testcases/application-connect-accounts-dev-tests.spec.ts` (NEW)
**Page objects:**
- `frontend/eHousing_Web/tests/pages/application-pages/connect-accounts-page.ts` (NEW)
- `frontend/eHousing_Web/tests/pages/application-pages/connect-later-page.ts` (NEW)

**Auth:** No-auth.
**Estimated test count:** 7

### `connect-accounts-page.ts` exports
- `navigateToConnectAccountsForCountry(country: 'United States'|'Japan')` — completes signup+passcode+employment seeded with the supplied country, lands on `/application/connect-accounts`.
- `verifyPlaidLinkButtonVisible()` — button labelled `Connect with Plaid` visible.
- `verifySaltEdgeFrameVisible()` — SaltEdge widget container or v6 connect-session button visible.
- `clickSkipForNow()` — clicks the `Skip for now` button.
- `verifyRedirectsToConnectLater(query: string)` — URL match `/application/connect-later?...` containing the supplied query string fragments.
- `seedConnectedAccountsLocalStorage(payload: object)` — generic helper to seed `dw_application_connected_accounts`.
- `removeConnectedAccount(accountId: string)` — clicks the inline `Remove` icon on the matching row; asserts row removed.
- `seedCategoryOverrides(overrides: Record<string,string>)` — seeds `dw_application_saltedge_category_overrides`.
- `verifyCategoryOverridesApplied(overrides: Record<string,string>)` — for each entry, asserts the rendered category label.
- `verifyMissingCustomerIdState()` — asserts text `/Connection unavailable/i` or similar when SaltEdge customer id is missing.

### `connect-later-page.ts` exports
- `verifyConnectLaterPageIsDisplayed()` — URL `/application/connect-later` + heading.
- `verifyBackLinkPreservesQuery(expectedQuery: string)` — read the back link href; assert it includes `email=`, `country=`, `showBusiness=`, `provider=` fragments.

### Shared mocks (used by all tests)
- draft 404, otp 200, verify-passcode 200, provision-account 200.
- `**/api/plaid/create_link_token` GET → 200 `{ link_token: 'link-test-tok' }`.
- `**/api/saltedge/v6/connect-session` POST → 200 `{ connect_url: 'https://saltedge.example/connect' }`.

### Tests
1. `[Application][DEV][ConnectAccounts][Regression] Plaid Link button rendered for US`
   - **Steps:** `navigateToConnectAccountsForCountry('United States')`.
   - **Asserts:** `verifyPlaidLinkButtonVisible()`.

2. `[Application][DEV][ConnectAccounts][Regression] SaltEdge widget rendered for non-US`
   - **Steps:** `navigateToConnectAccountsForCountry('Japan')`.
   - **Asserts:** `verifySaltEdgeFrameVisible()`.

3. `[Application][DEV][ConnectAccounts][Regression] Skip for now redirects to connect-later with preserved query`
   - **Steps:** `navigateToConnectAccountsForCountry('Japan')` (with `showBusiness=1` query manually appended) → `clickSkipForNow()`.
   - **Asserts:** `verifyRedirectsToConnectLater('email=...&country=JP&showBusiness=1&provider=saltedge')`.

4. `[Application][DEV][ConnectAccounts][Regression] Removing a connected account clears it from the list`
   - **Steps:** Land on connect-accounts → `seedConnectedAccountsLocalStorage(...)` → reload → `removeConnectedAccount('acct_001')`.
   - **Asserts:** account row hidden; `localStorage.dw_application_connected_accounts.personal.length === 0`.

5. `[Application][DEV][ConnectAccounts][Regression] Category overrides apply on review`
   - **Steps:** seed overrides `{ 'tx_001': 'Housing' }` → seed connected accounts with a transaction tx_001 → reload → navigate to review.
   - **Asserts:** `verifyCategoryOverridesApplied({ 'tx_001': 'Housing' })` on review summary.

6. `[Application][DEV][ConnectAccounts][Regression] Missing SaltEdge customer id surfaces fallback message`
   - **Mocks:** `**/api/saltedge/v6/customer` POST → 500 (so customer creation fails). Also clear any localStorage `dw_application_saltedge_customer_id`.
   - **Steps:** `navigateToConnectAccountsForCountry('Japan')`.
   - **Asserts:** `verifyMissingCustomerIdState()`.

7. `[Application][DEV][ConnectLater][Regression] Connect-later page back-link preserves query`
   - **Steps:** `gotoURL('http://localhost:3000/application/connect-later?email=hi%40example.com&country=JP&showBusiness=1&provider=saltedge')`.
   - **Asserts:** `verifyConnectLaterPageIsDisplayed()`; `verifyBackLinkPreservesQuery('email=hi%40example.com')`.

---

## Phase P1-C — Admin Surfaces (queue + Mission Control + AML + KYC)

**Spec:** `frontend/eHousing_Web/tests/testcases/admin-surfaces-dev-tests.spec.ts` (NEW)
**Page objects:**
- `frontend/eHousing_Web/tests/pages/applicants-pages/applications-queue-page.ts` (NEW)
- `frontend/eHousing_Web/tests/pages/applicants-pages/mission-control-page.ts` (NEW)
- `frontend/eHousing_Web/tests/pages/applicants-pages/aml-page.ts` (NEW)
- `frontend/eHousing_Web/tests/pages/applicants-pages/kyc-page.ts` (NEW)

**Auth:** CI bypass.
**Estimated test count:** 9

### `applications-queue-page.ts` exports
- `navigateToApplicationsQueue()` — `gotoURL('http://localhost:3000/applications')`.
- `verifyKpiTilesVisible()` — assert tiles for `In Review`, `Approved`, `Pending`, `Denied` (or whatever current labels) visible.
- `verifyApplicationsTableRows(minRows: number)` — assert `tbody tr` count ≥ minRows.
- `archiveFirstRow()` — click the row's overflow → Archive.
- `verifyKpiNumbersDecrement(beforeMap: Record<string, number>)` — re-read KPIs after action; assert at least one decremented.

### `mission-control-page.ts` exports
- `navigateToMissionControl()` — `gotoURL('http://localhost:3000/mission-control')`.
- `toggleUseCase(useCase: 'lending'|'rental'|'fraud'|'payroll')`.
- `addConsentKey(key: string)` / `removeConsentKey(key: string)`.
- `verifyConsentKeyVisible(key)` / `verifyConsentKeyHidden(key)`.

### `aml-page.ts` exports
- `navigateToAml()` — `gotoURL('http://localhost:3000/aml')`.
- `verifyMatchStatusBadge(status: 'match'|'no_match'|'pending')`.
- `verifyIdentityProviderBadgeVisible(provider: 'google'|'identity')`.
- `clickBackToDashboard()` / `verifyBackNavigation()`.

### `kyc-page.ts` exports
- `navigateToKyc()` — `gotoURL('http://localhost:3000/kyc')`.
- `verifyVerificationStatusBadge(status: 'verified'|'pending'|'no_verify'|'clear'|'match_found')`.
- `clickRefreshStatus()` / `verifyRefreshFiredApi()`.

### Tests
1. `[Admin][DEV][ApplicationsQueue][Regression] Queue page loads and renders KPI tiles`
   - **Mocks:** `**/api/v1/applications/stream` (SSE) → return empty event stream; `**/api/applications` GET → list of 3.
   - **Asserts:** `verifyKpiTilesVisible()`; `verifyApplicationsTableRows(3)`.

2. `[Admin][DEV][ApplicationsQueue][Regression] Optimistic archive decrements KPI`
   - **Mocks:** `**/api/v1/applications/16/archive` POST → 200; pre-archive list has `In Review: 3`.
   - **Steps:** Read KPI numbers → `archiveFirstRow()`.
   - **Asserts:** `verifyKpiNumbersDecrement({ 'In Review': 3 })` (one fewer after archive).

3. `[Admin][DEV][MissionControl][Regression] Use-case tabs are togglable`
   - **Steps:** `navigateToMissionControl()` → `toggleUseCase('rental')`.
   - **Asserts:** the rental tab is active (aria-selected="true").

4. `[Admin][DEV][MissionControl][Regression] Consent key add/remove is reflected immediately`
   - **Steps:** `addConsentKey('balance.read')` → `verifyConsentKeyVisible('balance.read')` → `removeConsentKey('balance.read')`.
   - **Asserts:** `verifyConsentKeyHidden('balance.read')`.

5. `[Admin][DEV][AML][Regression] Match status badge renders for each status`
   - **Steps:** Inject mock data via `addInitScript` (or query string e.g. `/aml?status=match`). Repeat for `no_match` and `pending`.
   - **Asserts:** `verifyMatchStatusBadge('match')`, `verifyMatchStatusBadge('no_match')`, `verifyMatchStatusBadge('pending')` (one assertion per branch covered in this test using table-driven loop).

6. `[Admin][DEV][AML][Regression] Identity provider badges render for Google + identity`
   - **Asserts:** `verifyIdentityProviderBadgeVisible('google')`; `verifyIdentityProviderBadgeVisible('identity')`.

7. `[Admin][DEV][KYC][Regression] Verification status badges render for known statuses`
   - **Steps:** Loop through `['verified','pending','no_verify','clear','match_found']` (using query param toggle if available, else mock `/api/kyc` GET payload variants).
   - **Asserts:** for each status, `verifyVerificationStatusBadge(status)`.

8. `[Admin][DEV][KYC][Regression] Refresh button hits API and re-renders status`
   - **Mocks:** `**/api/kyc` GET → 200 with `{ status: 'pending' }` initially, then on second call → `{ status: 'verified' }`.
   - **Steps:** `navigateToKyc()` → `clickRefreshStatus()`.
   - **Asserts:** `verifyRefreshFiredApi()`; final badge `verified`.

9. `[Admin][DEV][AML][Regression] Back navigation returns to dashboard`
   - **Mocks:** none beyond CI bypass.
   - **Steps:** `clickBackToDashboard()`.
   - **Asserts:** `verifyBackNavigation()` URL `/dashboard`.

---

## Phase P2-A — Wiki

**Spec:** `frontend/eHousing_Web/tests/testcases/wiki-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/applicants-pages/wiki-page.ts` (NEW)
**Auth:** CI bypass.
**Estimated test count:** 4

### `wiki-page.ts` exports
- `navigateToWiki(query: string)` — `gotoURL('http://localhost:3000/wiki' + query)`.
- `verifyWikiProfileLoaded(name: string)` — assert heading containing the supplied name.
- `verifyJpDashboardVariantBadge()` — assert `JP` variant badge visible.
- `verifyLocaleJa()` — assert at least one Japanese-text element rendered (regex `[぀-ヿ]`).
- `verifyBackLabelText(expected: string)` — assert back-link label matches expected localised text.

### Tests
1. `[Wiki][DEV][Regression] Default profile loads with applicant heading`
   - **Mocks:** `**/api/wiki?id=16*` GET → 200 `{ profile: { name: 'Ayaka Inoue', sections: [...] } }`.
   - **Steps:** `navigateToWiki('?id=16')`.
   - **Asserts:** `verifyWikiProfileLoaded('Ayaka Inoue')`.

2. `[Wiki][DEV][Regression] dashboardVariant=jp surfaces JP variant badge`
   - **Mocks:** wiki 200 with `dashboard_variant: 'jp'`.
   - **Steps:** `navigateToWiki('?id=16&dashboardVariant=jp')`.
   - **Asserts:** `verifyJpDashboardVariantBadge()`.

3. `[Wiki][DEV][Regression] profileLocale=ja query renders Japanese strings`
   - **Mocks:** wiki 200 with localised Japanese values.
   - **Steps:** `navigateToWiki('?id=16&profileLocale=ja')`.
   - **Asserts:** `verifyLocaleJa()`.

4. `[Wiki][DEV][Regression] Back-label localises with profileLocale cookie`
   - **Mocks:** wiki 200; set `PROFILE_LOCALE_KEY` cookie `ja-JP` via `context.addCookies` before navigation.
   - **Steps:** `navigateToWiki('?id=16')`.
   - **Asserts:** `verifyBackLabelText('戻る')` (or whatever JA localisation is configured — confirm against `wiki-profile-service`).

---

## Phase P2-B — Phone Application

**Spec:** `frontend/eHousing_Web/tests/testcases/phone-application-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/application-pages/phone-application-page.ts` (NEW)
**Auth:** CI bypass.
**Estimated test count:** 5

### Page-object exports
- `navigateToPhoneApplication()` — `gotoURL('http://localhost:3000/phone-application')`.
- `verifyPhoneApplicationPageLoaded()`.
- `clickConnectViaPlaid()` / `verifyPlaidWidgetTriggered()`.
- `clickConnectViaSaltEdge()` / `verifySaltEdgeWidgetTriggered()`.
- `verifyPaymentHistoryViewerVisible()`.
- `verifyDummyAccountIndicatorsVisible()`.

### Tests
1. `[PhoneApplication][DEV][Regression] Page loads with wizard intro`
   - **Mocks:** `**/api/phone-applications` GET → 200 `[]`; `**/api/v1/applicants/16/dummy-account-indicators` → 200 `{ flags: [] }`.
   - **Asserts:** `verifyPhoneApplicationPageLoaded()`.

2. `[PhoneApplication][DEV][Regression] Plaid connection button triggers link-token request`
   - **Mocks:** `**/api/plaid/create_link_token` GET → 200.
   - **Steps:** `clickConnectViaPlaid()`.
   - **Asserts:** `verifyPlaidWidgetTriggered()`; request was made.

3. `[PhoneApplication][DEV][Regression] SaltEdge connection button triggers connect-session`
   - **Mocks:** `**/api/saltedge/v6/connect-session` POST → 200.
   - **Steps:** `clickConnectViaSaltEdge()`.
   - **Asserts:** `verifySaltEdgeWidgetTriggered()`.

4. `[PhoneApplication][DEV][Regression] Payment history viewer renders rows`
   - **Mocks:** `**/api/payments/history` POST → 200 with 3 rows.
   - **Steps:** Trigger viewer.
   - **Asserts:** `verifyPaymentHistoryViewerVisible()`; ≥ 3 rows.

5. `[PhoneApplication][DEV][Regression] Dummy-account indicators surface heuristic flags`
   - **Mocks:** `**/api/v1/applicants/16/dummy-account-indicators` GET → 200 `{ flags: ['low-tx-count', 'rounded-balances'] }`.
   - **Asserts:** `verifyDummyAccountIndicatorsVisible()`; both flag chips visible.

---

## Phase P2-C — Corporate Overview

**Spec:** `frontend/eHousing_Web/tests/testcases/corporate-overview-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/applicants-pages/corporate-overview-page.ts` (NEW)
**Auth:** CI bypass.
**Estimated test count:** 3

### Page-object exports
- `navigateToCorporateOverview()` — `gotoURL('http://localhost:3000/corporate-overview')`.
- `verifyKpiCardsRendered()` — assert ≥ 4 KPI cards visible.
- `verifyRechartsBarsRendered()` — assert ≥ 1 `<svg class="recharts-surface">` rendered.
- `toggleLocale(target: 'en'|'ja')`.
- `verifyLocaleApplied(target: 'en'|'ja')` — assert sample copy in target language.

### Tests
1. `[Corporate][DEV][Regression] KPI cards render`
   - **Mocks:** none specific (page uses `useAuth`; CI bypass already seeds user).
   - **Asserts:** `verifyKpiCardsRendered()`.

2. `[Corporate][DEV][Regression] Recharts bars render in chart container`
   - **Asserts:** `verifyRechartsBarsRendered()`.

3. `[Corporate][DEV][Regression] Locale toggle re-renders copy in JA`
   - **Steps:** `toggleLocale('ja')`.
   - **Asserts:** `verifyLocaleApplied('ja')`.

---

## Phase P3-A — Cross-cutting Infra

**Spec:** `frontend/eHousing_Web/tests/testcases/infra-cross-cutting-dev-tests.spec.ts` (NEW)
**Page object:** `frontend/eHousing_Web/tests/pages/applicants-pages/infra-page.ts` (NEW)
**Auth:** No-auth.
**Estimated test count:** 5

### Page-object exports
- `pingHealthEndpoint()` — `request.get('http://localhost:3000/api/health')`; returns response.
- `pingReadyEndpoint()` — `request.get('http://localhost:3000/api/ready')`.
- `verifyLocaleHeadersOnApplicants()` — make a `request.get('/applicants')` and assert response headers contain `x-app-country` and `x-app-locale`.
- `verifyProfileLocaleCookieSet()` — same request; assert `set-cookie` header contains `PROFILE_LOCALE_KEY=`.
- `triggerSentryExampleApi()` — `request.get('/api/sentry-example-api')`; assert non-200.
- `navigateToApplicantsAndCaptureLoadingSkeleton()` — navigate with throttling so `loading.tsx` is briefly visible; assert skeleton class visible (e.g. `[data-state="loading"]` or aria-busy="true").

### Tests
1. `[Infra][DEV][Regression] /api/health returns OK and healthy payload`
   - **Steps:** `pingHealthEndpoint()`.
   - **Asserts:** status 200; body JSON.

2. `[Infra][DEV][Regression] /api/ready returns 200 when backend URL configured`
   - **Mocks:** Set `NEXT_PUBLIC_BACKEND_API_URL` via `process.env` (already set in dev).
   - **Steps:** `pingReadyEndpoint()`.
   - **Asserts:** status 200.

3. `[Infra][DEV][Regression] Locale middleware sets X-App-Country and X-App-Locale headers`
   - **Steps:** `verifyLocaleHeadersOnApplicants()`.
   - **Asserts:** both headers present and non-empty.

4. `[Infra][DEV][Regression] Sentry example endpoint returns sample error`
   - **Steps:** `triggerSentryExampleApi()`.
   - **Asserts:** response status ≥ 500 (or `error` payload as the route advertises a deliberate error).

5. `[Infra][DEV][Regression] Applicants loading skeleton renders during initial fetch`
   - **Mocks:** Throttle `**/api/applications` GET with a 1.5s delay. Use CI bypass init script but defer applicant data so the skeleton is observable.
   - **Steps:** Navigate to `/applicants`; immediately query for skeleton element.
   - **Asserts:** `aria-busy="true"` element OR known skeleton class is briefly visible; eventually overview heading appears.

---

## Implementation Notes (apply across all phases)

- Use `import { test } from '@PageSetup'` and `setupAllure(<id>)` exactly like every existing spec.
- Apply `test.describe.configure({ mode: 'parallel' })` at the top of each new spec file (matches existing convention).
- Always provide BOTH `**/api/applications` and `**/api/v1/applications` mocks when the dashboard / overview is involved — the frontend hits both shapes (per `context.md` route-mocking conventions).
- For DELETE/POST routes that only matter when invoked, count requests via `let count = 0; await page.route(..., async (route) => { count++; await route.fulfill({ ... }); })` and assert `count` after the action.
- For toast assertions, prefer `getByText(/Deleted .+\./i)` with a 5–10s timeout, since toasts auto-dismiss.
- For role-gating tests, override `addInitScript` (the CI bypass exposes it) — but DO NOT modify `login-page.ts`. Add a wrapper in the spec file that mirrors `ciBypassLogin` minus the role and seeds `localStorage.authUser.role = 'realtor'` directly via `page.addInitScript`.
- For `applicants-dashboard-edge-dev-tests.spec.ts`, prefer registering `page.route` BEFORE calling the CI-bypass login helper (the helper uses `getPage().goto` after registering its own routes; later `page.route` calls override earlier matches by precedence).
- Add the new id ↔ allure metadata entries to `test-metadata.ts` in **one** PR (Phase P0-A's responsibility), because that file is shared across phases.
- Keep test bodies under ~80 lines each; extract helpers into the corresponding page-object files. The page-object files are the only place where shared helpers should live (no `tests/utils/` additions in this plan).

---

## Out of Scope (deferred)

- Real Auth0 form coverage with bad-password rejection requires a dedicated test tenant; we leave the existing CI bypass as the sole DEV path.
- Real BrowserStack mobile coverage of new specs (only `applicants-prod-tests.spec.ts` and `applicants-dev-tests.spec.ts` set BrowserStack hooks; the new specs do not).
- True end-to-end Plaid Link / SaltEdge connection (those widgets run in iframes that require live tokens). All connection-step coverage uses route mocks + localStorage seeding.
- The retired demo-site fixtures under `tests/testdata/testdata/*-testdata.ts` (sauce-demo, the-internet, etc.) — these are framework boilerplate, not Lita features.
