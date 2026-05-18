# Review 1 — credit-bureau-optional / a

## Verdict
APPROVED

## Critical (blocking)
None.

## Important (should-fix before merge)
None.

## Nits (optional)
None.

## What's good
- **Wording-only edit**: The commit correctly replaces strings in both `pagePlaid.tsx` and `pageSalt.tsx` with no behavioral or validation logic changes.
- **"Optional" + "Highly recommended" framing**: The title "(Optional)" and description "Optional but highly recommended" clearly communicate the new positioning per E-housing Condition 1. The fallback framing ("if you couldn't connect a personal bank account") is completely removed.
- **Consistency with codebase markers**: The "(Optional)" marker in the title follows the established precedent of baking field markers directly into the `renderAccountCard(title)` string, consistent with the "*Required" pattern at `pagePlaid.tsx:769`.
- **File size bug fix**: The Plaid variant's copy bug ("15 MB" → "25 MB") is corrected; both files now match the validation constant `CREDIT_REPORT_MAX_SIZE_BYTES = 25 * 1024 * 1024` and error message text.
- **UX care**: The "(Optional)" marker is correctly applied only in the upload state (lines 887, 1503); when a file is already uploaded, the card shows plain "Credit Report" (lines 867, 1482) without the marker—appropriate for post-upload display.
- **No other callsites affected**: Grep across the entire codebase (frontend, backend, docs) confirms no other files reference the old copy strings or depend on them for tests, keys, or identifiers. Safe single-point edit.
- **Production safety**: No feature flags, migrations, env-var changes, or backend touch required. Deployable at any time.

---

STATUS: DONE
RESULT_FILE: .ai/credit-bureau-optional/a/review1.md
VERDICT: APPROVED
