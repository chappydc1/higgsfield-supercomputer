# Plan — Playwright Coverage Daily Audit 2026-05-11

## Context

PR #179 (merged 2026-05-10) ships four user-facing changes; only three
warrant new Playwright coverage. The `application-confirm-dev-tests.spec.ts`
file references removed UI and will fail on main — that's the blocking
fix.

## Phases

### Phase 4a — Confirm page tests refresh
1. In `confirm-page.ts`, remove `clickSendLoginEmail` and
   `verifySendLoginEmailToast` (button is gone). Add
   `verifyWhatHappensNextCopy` (3 numbered items: Application Review,
   Qualification Results, Housing Consultation) and
   `verifyBackNavigationStaysOnConfirm` (calls `page.goBack`, asserts
   URL still matches `/application/confirm`).
2. In `application-confirm-dev-tests.spec.ts`:
   - Delete the "Send login email CTA fires API call" test.
   - Delete the "Send login email is debounced" test.
   - Add: "[Confirm][Regression] What happens next? section renders 3
     numbered items" (uses `verifyWhatHappensNextCopy`).
   - Add: "[Confirm][Regression] Browser back stays on /confirm
     (popstate trap)" (uses `verifyBackNavigationStaysOnConfirm`).
   - Add: "[Confirm][Regression] Login email is NOT auto-sent on mount"
     — register a route counter on `**/api/v1/applications/send-login-email`,
     navigate through the flow, assert count = 0.

### Phase 4b — Signup DOB tests
3. In `signup-page.ts`, add:
   - `dateOfBirthInput()` locator — `page.locator('input[type="date"]')`
   - `fillDateOfBirth(value: string)` — sets the date input.
   - `verifyUnderageErrorIsDisplayed()` — asserts
     "You must be at least 18 years old." text.
4. In `application-signup-extra-dev-tests.spec.ts`, add three tests:
   - "[Signup][Regression] DOB is optional — Next stays enabled with
     empty DOB"
   - "[Signup][Regression] DOB under 18 shows error and disables Next"
   - "[Signup][Regression] Valid DOB allows submission to passcode"

### Phase 4c — Review page sandbox bank regression test
5. In `review-page.ts`, add `verifyConnectedAccountShown(label)` —
   asserts a text containing the account name renders on the review
   page (Personal Accounts section).
6. Create `application-review-sandbox-dev-tests.spec.ts` with one test:
   - "[Review][Regression] Sandbox bank named 'Fake Bank Simple' is NOT
     filtered out of review summary" — seeds a connected account with
     `name: 'Fake Bank Simple'` and a non-keyword `id`, navigates to
     review, asserts the bank name renders.

## Validation

- Run `tsc --noEmit` against the frontend to catch type errors in the
  new specs and page-object additions.
- Best-effort: invoke `npx playwright test --list` to confirm the
  Playwright runner enumerates the new tests (does not execute them).

## Rollback

Each phase is an independent commit. Reverting any single commit removes
the corresponding tests cleanly. No production code is touched.

## Status

Phases: 3
Assessed: yes

- [x] Phase 0: setup + branch
- [x] Phase 1: inspect commits + coverage
- [x] Phase 4a: Confirm page tests refresh
- [x] Phase 4b: Signup DOB tests
- [x] Phase 4c: Review sandbox bank test
- [x] Phase 5: Validation (tsc + playwright --list)
- [x] Phase 7: Self-review
- [x] Phase 8: PR
