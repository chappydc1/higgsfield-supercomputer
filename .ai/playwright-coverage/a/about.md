# Playwright Coverage — Daily Audit (2026-05-11)

Daily scheduled audit that compares the last 24 hours of merged work against
existing Playwright specs and fills missing coverage. Lives at
`.ai/playwright-coverage/`.

## Scope of this run (letter a)

Reviewed merged commits on `main` from 2026-05-09 through 2026-05-10. The
only merged PR carrying user-facing UI change in that window is
[#179 — Kapil changes](https://github.com/Dwilar/lita-ehousing/pull/179).
Branches with unmerged credit-upload work (`claude/laughing-tu-5877d2` and
`tobias`) are outside scope — those files do not exist on `main` yet.

## What ships on `main` that wasn't covered

| Feature | File | Existing coverage | Gap |
|---|---|---|---|
| `/application/confirm` no longer auto-sends login email; "Resend login email" button removed; browser-back trapped via `popstate` | `frontend/app/application/confirm/page.tsx` | `application-confirm-dev-tests.spec.ts` — tests **still target the removed button** (broken on main) | Update obsolete tests; add browser-back trap test; add "What happens next?" copy test |
| `/application/signup` optional DOB field with 18-year minimum validation | `frontend/app/application/signup/page.tsx` | `application-signup-dev-tests.spec.ts` happy path only | Add DOB optional, DOB <18 error, DOB persists across reload |
| `/application/review` sandbox bank (e.g. "Fake Bank Simple") no longer filtered out (only `id` checked, not display labels) | `frontend/app/application/review/page.tsx` | `application-review-dev-tests.spec.ts` doesn't seed a demo-named bank | Add regression test that seeds a bank named "Fake Bank Simple" + assert it renders in the Personal Accounts summary |
| Dashboard dialogs use new `hideCloseButton` prop on shared `DialogContent`; long lists scroll within viewport | `frontend/app/dashboard/components/dashboard-dialogs-section.tsx`, `frontend/components/ui/dialog.tsx` | No coverage for the single-close-button or scrollable-body behavior | Skip — visual close-button assertions are fragile; the round close still works and the current dashboard dialog tests open them successfully |
| `RiskAnalysisSection` no longer renders "View Details" CTA | `frontend/app/dashboard/components/risk-analysis-section.tsx` | None | Skip — testing absence of an element is brittle; no positive behavior to assert |

## Files added/updated

### Updated
- `frontend/eHousing_Web/tests/pages/application-pages/confirm-page.ts`
- `frontend/eHousing_Web/tests/testcases/application-confirm-dev-tests.spec.ts`
- `frontend/eHousing_Web/tests/pages/application-pages/signup-page.ts`
- `frontend/eHousing_Web/tests/testcases/application-signup-extra-dev-tests.spec.ts`
- `frontend/eHousing_Web/tests/pages/application-pages/review-page.ts`

### Added
- `frontend/eHousing_Web/tests/testcases/application-review-sandbox-dev-tests.spec.ts`

## Selector convention

`playwright.config.ts` pins `testIdAttribute: 'qa-target'`, so any new test
IDs are added as `data-qa-target="…"` — not `data-testid`. This audit did
not need to add any new selectors; every new assertion uses existing
roles, placeholders, or text already on the page.

## Out of scope / blocked

- Credit-upload page (`/application/credit-upload`) — committed on
  `claude/laughing-tu-5877d2` and `tobias` branches, not yet merged to
  `main`. Will pick up on a future daily run after the PR lands.
- Dashboard dialog close-button visual regression — fragile and the
  scrollable body cannot be deterministically exercised without a real
  long list rendered through the production data path.
