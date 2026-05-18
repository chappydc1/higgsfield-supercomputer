# Implementation Plan — Form New Steps_Account Connection

Scope: frontend-only redesign of `/application/*` multi-step wizard to match Figma
"Form New Steps_Account Connection". No backend, no new npm packages.

Branch (worktree): `feat/app-form-new-steps` at
`/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/busy-montalcini-c33ad4`

Backend contract check (from `context-backend.md`): `SaltEdgeV6ConnectSessionRequest.categorization`
accepts `'personal' | 'business' | 'investment'` per line 113, and `ApplicationCreateRequest.connected_accounts`
is a free-form `Dict[str, Any]` (line 59) so adding sub-step metadata in the JSON blob is contract-compatible.
**NO backend changes are required.**

## Status
Phases: 5

- [ ] Phase 4a — Step Progress visual fix
- [ ] Phase 4b — Step 3 inner mini-wizard + sub-step routing (Salt Edge)
- [ ] Phase 4c — Step 3 inner mini-wizard + sub-step routing (Plaid)
- [ ] Phase 4d — Submit confirmation modal + Connect more relabel + tip banner
- [ ] Phase 4e — Step 4 review surface accounts per sub-step
- [ ] Phase 5 — Validation (typecheck + targeted tests)
- [ ] Phase 6 — Browser test
- [ ] Phase 7 — Code review
- [ ] Phase 8 — PR

Assessed: yes

---

## Guiding principles

- Pragmatic structural parity, not pixel parity. Deferred: FAQ accordion (#96), alt
  icons (#95), tooltip required-message variant (#94), bank-statements upload (#93).
- Reuse the existing `ConnectAccountsLayout` shell (sticky header/footer, gradient
  buttons, exit handler) — only the **body region** needs to change for step 3.
- Sub-step state lives in **URL** (`?sub=main|business|investment`) so back-button
  works and QA can deep-link. localStorage stays only as a recovery cache.
- Single PR, single revertable commit chain — **no `NEXT_PUBLIC_NEW_STEPS_UI` feature
  flag**. Rollback = `git revert <merge>`.

## Sub-step routing & data flow (load-bearing detail)

URL contract on `/application/connect-accounts`:

- `?country=<iso>` — existing, owned by employment step
- `?showBusiness=true` — existing, set when employment === `business-owner`
- **NEW** `?sub=main|business|investment` — current sub-step
  - Default when absent: `main`
  - Set on inner mini-wizard click via `router.replace(...)` (no scroll)
  - Set on inner "Next" via `router.push(...)` so back button steps backwards
  - Final inner "Next" on `sub=investment` (or `sub=business` if investment skipped)
    pushes to `/application/review`
- `?connection_id=...&category=...` — existing Salt Edge return params; the existing
  `cleanupReturnParams()` (pageSalt.tsx:580) **already strips** `category` after
  consuming it. **It does NOT strip `sub`** — confirmed safe; `sub` survives the round trip.
- Plaid OAuth flow uses localStorage (`plaid_oauth_link_token`,
  `plaid_oauth_account_type` — see `frontend/app/application/PlaidLinkButton.tsx:11-12`)
  and the `?oauth_state_id=` Plaid query param. None of these conflict with `?sub`.

localStorage cache (existing, unchanged keys):

- `dw_application_connected_accounts` (v7 schema) — array per category
- `dw_application_saltedge_customer_id`
- `dw_application_saltedge_category_overrides`

Add (small): `dw_application_current_sub_step` as a *recovery* hint if URL is missing —
read-once on mount, then URL becomes source of truth. Avoids leaving users in wrong
sub-step if they refresh.

`?sub=` → backend `categorization` mapping:

| URL `sub` | UI label | SaltEdge `categorization` | localStorage bucket |
|-----------|----------|----------------------------|---------------------|
| `main`    | Main bank account | `personal`         | `personal`          |
| `business`| Business account  | `business`         | `business`          |
| `investment` | Investment account | `investment`   | `investments`       |

Note: localStorage bucket name `investments` (plural) is preserved for back-compat;
only the URL/UI uses singular `investment`.

---

## Phase 4 — Implementation units

### 4a — Step Progress visual fix  (PARALLEL-A, no overlap with 4b/4c)

File:
- `frontend/components/application/step-progress.tsx` (66 lines, modify)

Changes:
1. Connector segments: dotted/light-gray between active→upcoming, solid purple between
   completed→active. The current implementation always renders a flat `bg-[#333333]/20`
   line (line 59). Split into two branches based on adjacent step status.
2. Active badge is already 40×40 with purple ring — keep. Completed is 24×24 filled —
   keep. Slight tightening: ensure label gap is consistent (`gap-2`).
3. Label "Account Connection" → **"Account Connections"** (plural, per Figma spec § Top-level wizard).

Atomic commits:
- `feat(step-progress): use solid purple/dotted gray connectors per Figma`
- `chore(step-progress): rename label to "Account Connections" (plural)`

### 4b — Step 3 inner mini-wizard + sub-step routing (Salt Edge)  (SEQUENTIAL — primary path)

Create new component:
- `frontend/app/application/connect-accounts/components/SubStepProgress.tsx` (NEW)
  - Renders 3 pill labels: `Main bank account` `Business account` `Investment account`
  - Each pill has a small (1/3) badge + Required/Optional chip per Figma
  - Active pill: purple bg `#F4ECFF`, text `#7B33E3`, `rounded-full px-4 py-2`
  - Completed pill (has ≥1 connected account): purple bg + check icon
  - Inactive pill: gray border, gray text
  - Click handler: `(sub: 'main' | 'business' | 'investment') => void`
  - Layout: horizontal flex with thin connector lines between pills

Modify:
- `frontend/app/application/connect-accounts/pageSalt.tsx` (1571 lines)

Changes:
1. Add `currentSub` from `searchParams.get("sub") ?? "main"`, validate against allowed
   set, fall back to `dw_application_current_sub_step` then `"main"`. Persist to
   localStorage on every `sub` change.
2. Replace the existing "single-page, three-cards-stacked" body (lines ~1463–1533)
   with a sub-step-routed body:
   - Render `<SubStepProgress current={currentSub} onSelect={...} />` at top of `main` block
   - Render exactly ONE of: main / business / investment card, based on `currentSub`
3. Replace `onContinue` for inner Next button:
   - On `sub=main`: requires personal account (or Skip) → push `?sub=business`
   - On `sub=business`: if `showBusiness` (business-owner), require business account;
     otherwise allow skip → push `?sub=investment`
   - On `sub=investment`: always optional → push to `/application/review`
4. Back button: if `currentSub !== 'main'`, decrement `sub` instead of leaving step 3;
   else use existing `backUrl` (= `/application/employment`).
5. Hide "Want more accurate results?" subhead and the multi-card stack — only the
   active sub-step's card is visible.
6. Keep credit-report upload card on `sub=main` only (matches Figma — main step is
   "Personal Info bank + credit"). Defer relocation per design comment #93.
7. Keep "Add another country" widget visible only on `sub=main` (less clutter).
8. Skip-step link: visible on all 3 sub-steps EXCEPT `sub=business` when
   `showBusiness===true` (Figma variant A — Business required).
9. Pass `categorization: 'investment'` (singular, per backend contract) on the
   investment sub-step's `create_connect_session_v6` call. Current code uses string
   `accountType === "investments" ? "investment" : "bank"` for `consent_scopes`, so
   ensure the `categorization` field also passes the singular form. **AUDIT line
   1140** (the `accountType === "business" ? "corporate" : "personal"` map) — it sends
   `personal` for investments today; fix to `investment` for SaltEdge's
   `categorization` param while keeping the `consent_scopes` mapping as-is.

Atomic commits:
- `feat(connect-accounts): add SubStepProgress inner mini-wizard component`
- `feat(connect-accounts): route Salt Edge step 3 by ?sub= query param`
- `feat(connect-accounts): inner Next/Back navigates sub-steps not pages`
- `fix(connect-accounts): pass categorization=investment for investment sub-step`

### 4c — Step 3 inner mini-wizard + sub-step routing (Plaid)  (PARALLEL-B with 4b — different file)

Why parallel: `pagePlaid.tsx` and `pageSalt.tsx` are separate files. The shared
`SubStepProgress.tsx` from 4b is a dependency — 4c starts AFTER 4b commit 1 lands,
but the body refactor in `pagePlaid.tsx` does not touch any line in `pageSalt.tsx`,
so the two streams can interleave commits.

Modify:
- `frontend/app/application/connect-accounts/pagePlaid.tsx` (974 lines)

Changes — mirror 4b §1–§8 for Plaid:
1. Same `currentSub` extraction / persistence.
2. Replace lines ~851–935 (the accounts container with stacked cards) with a single
   active-sub card chosen by `currentSub`.
3. Same Next/Back sub-step routing semantics.
4. Credit-report card stays on `sub=main`.
5. No SaltEdge `categorization` mapping concern for Plaid (Plaid's
   `accountType` prop already accepts `'personal' | 'business' | 'investments'` —
   see `pagePlaid.tsx:25`). Plural `investments` is the existing Plaid value;
   convert at the URL boundary (`sub === 'investment' ⇒ accountType='investments'`).
6. OAuth resume (PlaidLinkButton lines 52–65): when returning from OAuth, the
   restored `accountType` from localStorage should drive `?sub=` so the user lands
   back on the right sub-step. Add: on OAuth resume in `pagePlaid.tsx`, after
   reading `PLAID_OAUTH_ACCOUNT_TYPE_KEY`, call `router.replace('?sub=...')` with
   the mapped value.

Atomic commits:
- `feat(connect-accounts): route Plaid step 3 by ?sub= query param`
- `fix(connect-accounts): restore sub-step on Plaid OAuth resume`

### 4d — Submit confirmation modal + "Connect more" relabel + tip banner  (SEQUENTIAL after 4b/4c)

Create new component:
- `frontend/components/application/connect-accounts/SubmitConfirmModal.tsx` (NEW)
  - Reuses existing modal pattern from `add-country-modal.tsx` (verified to exist:
    `frontend/components/application/add-country-modal.tsx`)
  - Title "Add more accounts?", body, two buttons (primary gradient + ghost outline)
  - Props: `open`, `onClose`, `onAddMore`, `onSubmitAnyway`

Modify:
- `frontend/app/application/review/page.tsx` (515 lines) — gate Submit with modal
  when `totalAccounts === 1` (sum of personal+business+investments)
- `frontend/app/application/connect-accounts/pageSalt.tsx` — relabel button text:
  `connectedAccounts.{type}.length > 0` → `"+ Connect more"` instead of `"Change"`
  (lines 1374, 1394, 1527 region)
- `frontend/app/application/connect-accounts/pagePlaid.tsx` — same relabel on the
  Plaid button wrapper (Plaid button label is owned by `PlaidLinkButton.tsx` —
  pass a new prop `connectMoreLabel?: boolean` or look up
  `connectedAccounts[accountType].length` already passed in via the
  `connectedAccounts` prop on line 28–32)
- `frontend/app/application/connect-accounts/components/ConnectAccountsLayout.tsx`
  — add an optional `topBanner?: ReactNode` slot above the title for the
  "You selected Business owner..." purple tip banner used by sub=business required variant
- New inline JSX in both `pageSalt.tsx` and `pagePlaid.tsx`: when `currentSub` is
  `business` and `showBusiness===true`, render the tip banner via the new
  `topBanner` slot

Atomic commits:
- `feat(review): add SubmitConfirmModal for single-account submissions`
- `feat(connect-accounts): relabel button to "Connect more" after first account`
- `feat(connect-accounts): show purple tip banner on required Business sub-step`

### 4e — Step 4 review surfaces accounts per sub-step  (PARALLEL-C with 4d, separate file)

Modify:
- `frontend/components/application/review/review-form-content.tsx` (92 lines)

Changes:
1. Rename labels in the "Connected Accounts" `ReviewSection` (lines 72–80):
   - `Personal Accounts` → `Main bank account`
   - `Business Accounts` → `Business account`
   - `Investment Accounts` → `Investment account` (singular, render even when
     empty showing `Skipped`)
2. New behavior: when a category has 0 entries AND the user reached step 4,
   display "Skipped" (italic, `text-[#333333]/60`) instead of empty string.
3. "Edit" link target for each row should deep-link to the matching sub-step:
   - Main row → `/application/connect-accounts?sub=main&...`
   - Business row → `?sub=business&...`
   - Investment row → `?sub=investment&...`
   Update `frontend/app/application/review/page.tsx` to compute three
   sub-step-specific edit URLs and pass them as new props.

Modify:
- `frontend/app/application/review/page.tsx` — compute `mainEditUrl`,
  `businessEditUrl`, `investmentEditUrl` from existing `backUrl` query builder.

Atomic commits:
- `feat(review): split connected-accounts section into per-sub-step rows`
- `feat(review): deep-link each Edit link to its sub-step`

---

## Phase 5 — Validation

```bash
cd frontend && npx tsc --noEmit
cd frontend && npm test -- --runInBand application
```

Specific test files to verify still pass (none need code changes from us, all
exist):

- `frontend/app/application/review/__tests__/payload.test.ts`
- `frontend/app/application/credit-upload/__tests__/page.test.tsx`
- `frontend/app/api/applications/[id]/__tests__/route.test.ts`

If any payload test asserts the shape of `connected_accounts`, the keys haven't
changed (`personal`/`business`/`investments` localStorage bucket → same JSON keys
on submit), so those should not break.

Atomic commit (if needed): `test(review): update assertions for sub-step display`

## Phase 6 — Browser test

Open dev server, manually walk:
1. Step 1 signup → email + name + agree boxes → OTP
2. Passcode auto-advance on 6th digit
3. Employment → choose "Business owner" → Next
4. Step 3 → verify mini-wizard shows on `sub=main`, connect a fake account →
   inner Next → `sub=business` (Required chip + tip banner visible, Skip hidden) →
   connect → `sub=investment` → Skip
5. Step 4 → verify three rows show correctly, Submit modal appears with only 1
   account
6. Repeat with employment="Full-time": business sub-step should show Optional
   chip + Skip visible, no tip banner
7. Refresh on `?sub=business`: should land back on business sub-step
8. Back button from `sub=business`: should go to `sub=main`, not employment
9. Plaid OAuth: connect a US bank that requires OAuth on `sub=main`, return →
   should restore `sub=main` not `sub=undefined`

## Phase 7 — Code review

Self-review via `git diff main`. Look for:
- Any leftover stacked-card rendering in pageSalt / pagePlaid
- Any `console.log` debug lines added during 4b/4c
- Confirm `?sub=` is always one of the 3 valid values before use
- No newly-imported npm packages

## Phase 8 — PR

```
gh pr create \
  --base main \
  --title "feat(application): redesign step 3 with inner mini-wizard sub-steps" \
  --body "..."
```

PR body checklist:
- Screenshots (light + dark if applicable) of all 3 sub-steps
- Note: NO backend changes; `categorization` already accepts singular values
- Note: rollback via single git revert; no feature flag

---

## Rollback plan

**Strategy: single git revert.** No `NEXT_PUBLIC_NEW_STEPS_UI` flag.

Rationale:
- The change is structural but localized to 4 files + 2 new components.
- A feature flag would double the surface area, double the test matrix, and
  encourage skew between code paths. The existing localStorage schema (v7) is
  unchanged, so reverting code does not strand user state.
- If production breaks: `git revert <merge-sha> && gh pr create` → ~5 min to
  redeploy old UI. Users mid-flow lose nothing because localStorage is forward-
  and backward-compatible with the old single-page step 3 (the connected_accounts
  blob shape is identical).

Caveats:
- Users who deep-linked to `?sub=business` mid-flow would lose that param on
  revert and land on the legacy stacked-card view — acceptable degradation.
- The renamed step-progress label `"Account Connections"` is purely cosmetic;
  reverts cleanly.

---

## Files: full path inventory (verified to exist)

Modify:
- `frontend/components/application/step-progress.tsx`
- `frontend/app/application/connect-accounts/pageSalt.tsx`
- `frontend/app/application/connect-accounts/pagePlaid.tsx`
- `frontend/app/application/connect-accounts/components/ConnectAccountsLayout.tsx`
- `frontend/app/application/review/page.tsx`
- `frontend/components/application/review/review-form-content.tsx`
- `frontend/app/application/PlaidLinkButton.tsx` *(only on 4c §6 — OAuth resume sub fix)*

Create:
- `frontend/app/application/connect-accounts/components/SubStepProgress.tsx`
- `frontend/components/application/connect-accounts/SubmitConfirmModal.tsx`

Do NOT touch:
- Backend: zero changes
- `frontend/app/application/signup/page.tsx` — Figma Step 1 already close enough;
  defer cosmetic polish
- `frontend/app/application/passcode/page.tsx` — auto-advance already exists
  (`isComplete` check + existing useEffect)
- `frontend/app/application/employment/page.tsx` — chip selector already there
- Playwright page objects in `frontend/eHousing_Web/tests/pages/application-pages/`
  — selectors are role/text-based and tolerant; verified the `connect-accounts-page.ts`
  uses fuzzy regex matches that survive the rename

---

## Parallelization

| Stream | Phase units | Files touched |
|--------|-------------|---------------|
| A      | 4a          | `step-progress.tsx` |
| B      | 4b, 4d-sub2 (pageSalt portion) | `pageSalt.tsx`, `SubStepProgress.tsx` (new) |
| C      | 4c, 4d-sub3 (pagePlaid portion) | `pagePlaid.tsx`, `PlaidLinkButton.tsx` |
| D      | 4e          | `review-form-content.tsx`, `review/page.tsx` |

A, B, C, D can interleave commits because they touch disjoint files. The only
hard ordering is: **B's first commit must land before C and 4d** because both
import the new `SubStepProgress.tsx`. Practical sequence:

1. Land 4a (any time)
2. Land 4b commit 1 (new `SubStepProgress.tsx`)
3. Then 4b commits 2–4 and 4c commits in parallel
4. Land 4d once 4b/4c are merged
5. Land 4e (can start any time after 4a — no dependency on 4b/4c)

---

## Self-assessment

**Did I list every file path? Are they real?**
Yes. All seven modified paths were verified with `wc -l` and `ls`. The two new
component paths follow existing directory conventions (parent dirs exist).
Caveat: `frontend/components/application/connect-accounts/` does not currently
exist — creating `SubmitConfirmModal.tsx` will create that subfolder. I could
co-locate the modal under `frontend/app/application/connect-accounts/components/`
instead to avoid a new top-level folder; this is the better choice and I should
**revise to**: `frontend/app/application/connect-accounts/components/SubmitConfirmModal.tsx`.

**Are the parallelization claims correct (no overlapping line edits)?**
Mostly yes. The one risk: 4d touches `ConnectAccountsLayout.tsx` to add a
`topBanner` slot AND 4b/4c add JSX consuming it. Solution: land the slot first
as a no-op prop (4d commit 1), then 4b/4c can wire it. This is a 1-commit
re-ordering — minor.

**Is the URL-state approach sound for sub-step routing? Any back-button edge cases?**
- Browser back from `sub=business` → `sub=main`: works because we `router.push`
  on Next (creating history entries).
- Refresh on `sub=business`: works (URL is source of truth).
- Bookmark sharing: works.
- Edge case: user lands on `sub=business` with `showBusiness=false` (employment
  was changed to non-business between sessions). Mitigate: on mount, if URL
  `sub` is inconsistent with localStorage employment (e.g. user un-checked
  business owner), allow the sub-step regardless — it's optional in that
  variant, harmless.
- Edge case: user has both `?sub=` and stale localStorage `dw_application_current_sub_step`.
  URL wins; we only consult localStorage when `sub` param is absent.

**Risk of breaking existing Plaid OAuth redirect flow when I add sub-step query params?**
Low. PlaidLinkButton checks `searchParams.has('oauth_state_id')` (line 52) and
reads link token from localStorage independently of the URL. Adding `?sub=` is
inert to Plaid. The only new code is: on OAuth resume, we should set `?sub=`
to match the stored `PLAID_OAUTH_ACCOUNT_TYPE_KEY`. Explicitly covered in 4c
§6.

**Risk of breaking deep-linkable URLs already used in QA Playwright tests?**
Verified `frontend/eHousing_Web/tests/pages/application-pages/connect-accounts-page.ts`
uses fuzzy role/text selectors (`getLocatorByRole({ name: /Skip|Connect later/i })`).
Tests do not assert on URL `?sub=` presence/absence. Tests do not assert single-page
multi-card layout. Low risk of false failure. If the test that opens the
"Personal Bank Account" card breaks because it's no longer in the DOM on
`sub=business`, a tiny adjustment to the test (navigate to `sub=main` first) is
needed — flagging this as a possible follow-up rather than a blocker.

**Have I forgotten any test files that need updating?**
Reviewed:
- `frontend/app/application/review/__tests__/payload.test.ts` — payload shape unchanged
- `frontend/app/application/credit-upload/__tests__/page.test.tsx` — credit upload route unchanged
- `frontend/app/api/applications/[id]/__tests__/route.test.ts` — API route untouched

No new unit tests required for `SubStepProgress.tsx` (presentational, no logic
worth unit-testing). The Playwright dev spec
`frontend/eHousing_Web/tests/testcases/application-connect-accounts-dev-tests.spec.ts`
may need a small update to navigate through sub-steps — accept as a Phase 5
follow-up commit if `npm test` reveals breakage.

**Is the modal scope creep — should we just disable Submit instead?**
The modal is the Figma-specified behavior (#88–#92). Disabling Submit when only
1 account is connected would be wrong: the design explicitly wants to ALLOW
"Submit anyway". A simple disabled state would block legitimate single-account
submits. Keep the modal. It's ~50 lines of JSX reusing the existing
`add-country-modal.tsx` pattern — not scope creep.

**Risk: SaltEdge `categorization` mismatch (4b §9).**
The current pageSalt sends `'corporate' | 'personal'` to `consent_scopes` and
the same to `categorization`. Per backend (`context-backend.md` line 113) the
field accepts `'investment'` and per the existing persist endpoint contract,
`'business'` is valid too. Today the FE sends `personal` for investment
accounts — likely a latent bug. Fix is in-scope (4b commit 4). If this turns
out to be load-bearing for an upstream service, revert that one commit
independently; the rest of the redesign is unaffected.

Assessed: yes
