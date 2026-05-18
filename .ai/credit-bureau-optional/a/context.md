# Context — credit-bureau-optional / a

## Task

E-housing Condition 1: make the credit-bureau-report submission **optional** in the application form, positioned as "highly recommended." Wording change only. No validation logic change. No backend touch.

## Where the credit-report card lives

The application form's step 3, "Connect your accounts", at route `/application/connect-accounts`.

Two co-existing implementations, one per banking provider:

- `frontend/app/application/connect-accounts/pagePlaid.tsx` — US/CA users (Plaid).
- `frontend/app/application/connect-accounts/pageSalt.tsx` — Rest of world (Salt Edge open banking).

Both render a "Credit Report" card via the same `renderAccountCard(type, title, description, …)` helper. The card's title is rendered inside an `<h3>` (`pagePlaid.tsx:720`). The body description is rendered inside a `<p>` (`pagePlaid.tsx:732`).

## Established copy conventions

| Marker | Pattern | Canonical example |
|---|---|---|
| Required | `*Required` suffix baked into the title string | `pagePlaid.tsx:769` — `showBusiness ? "Business Account *Required" : "Business Account"` |
| Optional | `(Optional)` as a small light-gray `<span>` next to the field label | `frontend/app/application/signup/page.tsx:190` — `<span className="text-sm font-normal text-[#333333]/60">(Optional)</span>` |

The signup page's optional pattern uses a separate `<span>` because the label is composed inline as JSX. In `renderAccountCard` the title is a `string` param baked into an `<h3>`. To preserve a minimal-change footprint, we follow the **`*Required` precedent** and bake `(Optional)` directly into the title string: `"Credit Report (Optional)"`. This sacrifices the lighter gray styling on the parenthetical, but matches an existing in-card pattern and avoids a refactor to `renderAccountCard`'s signature.

## Current behavior (verified)

- **No `*Required` marker** on Credit Report.
- **No validation rule** blocks Continue if credit report is absent. Continue is gated only by `hasPersonalAccount` (`pagePlaid.tsx:794, 832`).
- **No required Pydantic field** server-side. `ApplicationResponse.credit_score` is `Optional[int] = None` (`backend/src/interface/schemas.py:148`). All credit-related DB columns are nullable.
- **No tests** assert "credit report required → error". So copy edits cannot break a test asserting old copy.

## What the user sees today

Plaid variant (`pagePlaid.tsx:885-899`):
```
[Credit Report icon] Credit Report                              [Upload Report ▲]

  Upload your credit report to improve accuracy or if you couldn't
  connect a personal bank account. Accepted formats: PDF, JPG, PNG.
  Max file size: 15 MB.                                      ← BUG: actually 25 MB
```

Salt Edge variant (`pageSalt.tsx:1500-1513`):
```
[Credit Report icon] Credit Report                              [Upload Report]

  Upload your credit report to improve accuracy or if you couldn't
  connect a personal bank account. Accepted formats: PDF, JPG, PNG.
  Max file size: 25 MB.
```

Two issues with current copy:
1. **No explicit optionality marker** — the card sits visually beside the (in some flows) `*Required` Business Account card, with no de-emphasis.
2. **"Fallback" framing** — "if you couldn't connect a personal bank account" implies a backup role, not the "additional supplementary submission" framing the client wants.
3. **Plaid copy bug** — says `15 MB` but the validation constant and error message both use `25 MB` (`pagePlaid.tsx:92, 366`).

## Proposed change

**Title** (both variants): `"Credit Report (Optional)"`

**Body description** (both variants):
```
Optional but highly recommended — uploading your credit report helps us
produce a more accurate score for your application. Accepted formats:
PDF, JPG, PNG. Max file size: 25 MB.
```

This:
- Marks the field as optional explicitly, matching the codebase's only existing visual convention for optional fields.
- Replaces the fallback framing with the "additional submission" framing the client asked for.
- Uses "highly recommended" verbatim per the client's wording.
- Fixes the `15 MB` → `25 MB` copy bug in the Plaid variant.

## Files to change

| File | Lines | Change |
|---|---|---|
| `frontend/app/application/connect-accounts/pagePlaid.tsx` | 887 | Title: `"Credit Report"` → `"Credit Report (Optional)"` |
| `frontend/app/application/connect-accounts/pagePlaid.tsx` | 888 | Body description rewrite + `15 MB` → `25 MB` fix |
| `frontend/app/application/connect-accounts/pageSalt.tsx` | 1502 | Title: `"Credit Report"` → `"Credit Report (Optional)"` |
| `frontend/app/application/connect-accounts/pageSalt.tsx` | 1503 | Body description rewrite |

The `creditReportFileName` branch (uploaded state, where the card shows the filename + remove button) does not need title changes — once a user has uploaded, the marker is moot. Body description there is already empty string.

## Validation strategy

- **Targeted Jest** — there are no Jest tests asserting credit-report copy (Phase 1c confirmed). Run any nearby form tests touching `connect-accounts/` if they exist, plus `tsc` typecheck.
- **Browser** — start dev server, navigate to `/application/connect-accounts` (and the Salt Edge equivalent), screenshot the credit-report card on desktop + mobile (375px), confirm console has no errors.

## Risks

- **None to runtime behavior.** Pure string edits inside the card's title and description.
- **Localization risk:** none, app is single-language.
- **Visual regression risk:** the title is now 4 characters longer; the card flex layout already wraps gracefully (verified by reading the JSX — `<div className="flex items-center gap-2">` with `<h3>` of `text-base`). Will confirm in browser.

## Deployment safety

No migrations. No env-var changes. No flagged code paths. Safe to deploy at any time.

## Follow-up worth filing (out of scope here)

- **Credit-report upload is not wired to the backend from the connect-accounts step.** The file is selected and validated client-side (`handleCreditReportFileChange`), but `creditReportFileName` is never included in the draft save (`pagePlaid.tsx:812-826`) nor in the final application submission (`frontend/app/api/applications/route.ts:116-238`). Phase 1b found a backend `/api/credit-report-uploads/sessions/.../complete` endpoint exists from May 10 work, plus a magic-link-based resubmit flow — but the connect-accounts step does not call either. If "PDF Data Extraction to supplement the data we couldn't obtain" is part of the May 15 delivery, this gap blocks that capability. Flag this as a separate task chip after Phase 8.
