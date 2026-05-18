# Form New Steps — Account Connection redesign

The `/application/connect-accounts` page is a three-sub-step wizard inside the
existing four-step outer wizard. Sub-steps are: **Main bank account →
Business account → Investment account**.

Sub-step state lives in the URL as `?sub=main|business|investment` so the
back button works and pages are bookmarkable. `localStorage` key
`dw_application_current_sub_step` is used only as a resume hint when the URL
loses the param (notably after Plaid OAuth redirects).

The inner `SubStepProgress` mini-wizard renders three clickable pills with
Required/Optional semantics. The **Business** sub-step is required iff the
applicant chose "Business owner" on the Employment step (`showBusiness=true`);
in that case a purple "Required" tip banner appears, the Skip step link is
hidden, and the outer Next button is disabled until at least one business
account is connected.

The outer `StepProgress` indicator uses a solid purple connector between
completed steps and a dashed gray connector to upcoming steps, and the third
label is "Account Connections" (plural).

The connect button copy switches to "Connect more" after the first account
has been connected on the current sub-step. This applies to both the Plaid
and Salt Edge implementations.

On the Review & Submit step the connected-accounts section is split into
three per-sub-step rows; each renders "Skipped" (italic muted) when the
corresponding bucket is empty, with an Edit link that deep-links back to the
matching sub-step. If the user clicks Submit with exactly one account
connected, the `SubmitConfirmModal` opens with two options: "Add more
accounts" (returns them to `sub=main`) or "Submit anyway".

No backend changes are needed: the Salt Edge `categorization` field already
accepts `personal|business|investment` and the application submission payload
already has the `skipped_connect_accounts` flag. The redesign also fixes a
latent FE bug where the investment sub-step's connect-session call was
sending `categorization=personal`.

## Key files

- `frontend/components/application/step-progress.tsx` — outer wizard visual treatment
- `frontend/app/application/connect-accounts/components/SubStepProgress.tsx` — inner mini-wizard
- `frontend/app/application/connect-accounts/components/SubmitConfirmModal.tsx` — "Add more accounts?" modal
- `frontend/app/application/connect-accounts/components/ConnectAccountsLayout.tsx` — accepts `subProgress`, `topBanner`, `skipLink`, `onBack`, `subtitle` slots
- `frontend/app/application/connect-accounts/pageSalt.tsx` — Salt Edge sub-step routing + categorization fix
- `frontend/app/application/connect-accounts/pagePlaid.tsx` — Plaid sub-step routing + OAuth resume via localStorage
- `frontend/app/application/PlaidLinkButton.tsx` — "Connect more" relabel
- `frontend/app/application/review/page.tsx` — Submit modal gate + per-sub-step Edit URLs
- `frontend/components/application/review/review-form-content.tsx` — per-sub-step rows
- `frontend/components/application/review/review-layout.tsx` — `ReviewField` accepts `ReactNode` for "Skipped" italics

PR: [Dwilar/lita-ehousing#186](https://github.com/Dwilar/lita-ehousing/pull/186)
