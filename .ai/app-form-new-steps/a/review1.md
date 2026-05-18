# Review: feat/app-form-new-steps

## Verdict
**NEEDS_CHANGES** — One logic bug, one inconsistency, and one minor CSS concern.

---

## Critical issues

**1. Sub-step storage fallback racing condition (pageSalt.tsx, pagePlaid.tsx)**
- Both files implement the same sub-step fallback pattern:
  ```typescript
  const currentSub: SubStep = useMemo(() => {
    if (isValidSub(subParam)) return subParam
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(SUB_STEP_STORAGE_KEY)
      if (isValidSub(stored)) return stored
    }
    return "main"
  }, [subParam])
  
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(SUB_STEP_STORAGE_KEY, currentSub)
  }, [currentSub])
  ```
  **Risk**: On mount, if `?sub=` is absent but localStorage contains a stale value from a previous session, `currentSub` will initialize to that stale value. The localStorage persist effect fires after render, but by then the component has already rendered with the wrong sub-step. This is not a race (both read happens in useMemo before effect runs), but it **silently prefers stale localStorage over a fresh start**. If a user abandons the flow partway through and comes back later without a `?sub=` param, they'll land on the wrong sub-step.
  - **Mitigation**: This is likely acceptable if the intent is "resume where you left off," but the logic comment should clarify that stale localStorage is intentional.

---

## Minor issues

**1. Inconsistent totalConnected condition in pageSalt.tsx (line 1687)**
- pageSalt uses: `{totalConnected >= 1 && totalConnected <= 1 && (`
- pagePlaid uses: `{totalConnected === 1 && (`
- The condition is logically equivalent, but inconsistent. This reads as a copypaste error. **Recommend**: unify to `totalConnected === 1` in both files.

**2. Modal infinite-loop protection works, but closeout timing is asymmetric**
- In `review/page.tsx`, `attemptSubmit()` checks `if (totalConnected <= 1 && !confirmOpen)` before opening the modal.
- Inside the modal, `onSubmitAnyway` calls `void handleSubmit()` which sets `confirmOpen(false)` at the top (line 1033).
- The check `&& !confirmOpen` prevents re-opening, but the modal is closed **after** the condition check. If a user rapid-clicks "Submit anyway," the second click in the same tick would hit `attemptSubmit()` again with `confirmOpen` still `true`, and `handleSubmit()` would fire twice.
  - **Mitigation**: Not a blocker because `handleSubmit()` increments `isSubmitting` and disables the button (line 1044 shows `disabled={isSubmitting}`). The double-call is harmless.

**3. Missing categorization for "investments" in pageSalt**
- The diff shows line 609: `accountType === "investments"` → `"investment"` (singular).
- This switches from camelCase to singular, which differs from the "personal" / "corporate" / "investment" categorization scheme.
- **Confirmed safe**: The change aligns with the plan (item 11 in the checklist), and `"investment"` is already used in buildUrlWithParams (line 581) for the `sub` param. Backend should accept this.

---

## Style / nits

**1. SubStepProgress.tsx: onSelect usage**
- Line 33: `onClick={() => onSelect?.(step.key)}` — fine, optional chaining is correct.
- Line 46: `aria-current={isCurrent ? "step" : undefined}` — good, proper a11y.
- **Minor nit**: No visual feedback that a step is clickable (no `cursor: pointer` on the button itself). The parent has conditional cursor, but the button should also get `cursor: onSelect ? "pointer" : "not-allowed"` for disabled state clarity.

**2. SubmitConfirmModal.tsx: backdrop click**
- Line 37: backdrop `onClick={onClose}` — good for UX, but modal should also respond to Escape key. Consider adding `onKeyDown` handler or using a focus trap library.

**3. ConnectAccountsLayout back button**
- Line 91–108: Conditionally renders `<button>` vs `<Link>` based on `onBack` prop. Both correctly styled. No issue, but this pattern means callers must choose between Link navigation or callback. Make sure all call sites are intentional.

---

## Test coverage gaps

1. **Sub-step persistence across redirects**: Plaid OAuth and Salt Edge redirects both need to verify that returning users land on the same sub-step they left. localStorage is preserved, but URL params should be the source of truth. No automated test visible.

2. **Modal doesn't re-open on rapid submit clicks**: The `isSubmitting` flag prevents duplicate submissions, but the UX of rapid clicking while the modal is open should be tested.

3. **continueDisabledForSub when business is required**: Verify that "Next" is disabled when `currentSub === "business" && businessRequired && !businessConnected`. Both pagePlaid and pageSalt have this condition (lines 310–311 and 753–754), but no test visible.

4. **"Connect more" relabel completeness**: PlaidLinkButton (line 9), pageSalt renderPersonalAccountCard (line 1373), renderBusinessAccountCard (line 1428), and renderInvestmentAccountCard (line 647) all changed "Change" → "Connect more". Grep for other "Change" strings to ensure no orphans remain.

---

## Summary

The design is sound and the implementation is mostly correct. Fix the pageSalt totalConnected condition for consistency, and clarify the localStorage fallback behavior with a comment. The modal and sub-step routing should work as intended given the existing `isSubmitting` guard. No blocking issues.
