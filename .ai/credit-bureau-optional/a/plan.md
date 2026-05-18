# Plan — credit-bureau-optional / a

Route: **Quick** (≤5 changes, 2 files, no validation/backend touch, no new component or schema).
Phases: 4 (Phase 0 ✓, Phase 1 ✓, Phase 4 implement, Phase 5 validate, Phase 6 browser, Phase 7 lite review, Phase 8 PR).
Assessed: yes (self-check inline, no separate Phase 3 agent given trivial blast radius).

## Steps

### Step 1 — `pagePlaid.tsx` title

In `frontend/app/application/connect-accounts/pagePlaid.tsx`, on the unconnected branch of the Credit Report card (~line 887), change the second argument of `renderAccountCard` from `"Credit Report"` to `"Credit Report (Optional)"`.

### Step 2 — `pagePlaid.tsx` description

In `frontend/app/application/connect-accounts/pagePlaid.tsx`, line 888, replace the description string

```
"Upload your credit report to improve accuracy or if you couldn't connect a personal bank account. Accepted formats: PDF, JPG, PNG. Max file size: 15 MB."
```

with

```
"Optional but highly recommended — uploading your credit report helps us produce a more accurate score for your application. Accepted formats: PDF, JPG, PNG. Max file size: 25 MB."
```

This fixes the `15 MB` → `25 MB` copy bug in the same edit (actual enforcement is 25 MB at `pagePlaid.tsx:92` and `:366`).

### Step 3 — `pageSalt.tsx` title

In `frontend/app/application/connect-accounts/pageSalt.tsx`, on the unconnected branch of the Credit Report card (~line 1502), change `"Credit Report"` to `"Credit Report (Optional)"`.

### Step 4 — `pageSalt.tsx` description

In `frontend/app/application/connect-accounts/pageSalt.tsx`, line 1503, replace the description string

```
"Upload your credit report to improve accuracy or if you couldn’t connect a personal bank account. Accepted formats: PDF, JPG, PNG. Max file size: 25 MB."
```

(note: uses U+2019 right-single-quote in `couldn't`) with

```
"Optional but highly recommended — uploading your credit report helps us produce a more accurate score for your application. Accepted formats: PDF, JPG, PNG. Max file size: 25 MB."
```

### Step 5 — Validate

```bash
# Frontend typecheck (from frontend/):
npx tsc --noEmit
# Frontend tests touching connect-accounts (none expected, per Phase 1c):
npm test -- --runInBand connect-accounts
```

Expected: zero new type errors; zero new test failures (no existing tests should reference the old strings, but if any do, update them in this step).

### Step 6 — Browser test (golden path desktop + mobile)

- Start the dev server with `mcp__Claude_Preview__preview_start` if not already running. Check `package.json` script for the command.
- Navigate to `/application/connect-accounts` (Plaid variant — default in dev unless `country=` query param set).
- Screenshot the credit-report card on desktop (default viewport) → `screenshots/phase-6-golden-path.png`.
- Resize to 375px → screenshot → `screenshots/phase-6-mobile.png`.
- Navigate to `/application/connect-accounts?country=<non-US>` (or set up Salt Edge variant per dev seed) → screenshot → `screenshots/phase-6-saltedge.png`.
- Check `preview_console_logs` — confirm zero new errors.

### Step 7 — Lite code review

Spawn a Haiku `general-purpose` agent on the diff. Read `digested-agents.md` first. Verdict: APPROVED or NEEDS_CHANGES with file:line.

### Step 8 — Push and PR

`git push -u origin feat/credit-bureau-optional` then `gh pr create --base main` with the body template.

## Rollback plan

Pure string edits; rollback = revert the commit. No state migration, no env, no DB. Safe to revert at any time, including post-deploy.

## Status

- [x] Phase 0
- [x] Phase 1
- [x] Phase 2+3 (merged inline — trivial blast radius)
- [x] Step 1 — pagePlaid title
- [x] Step 2 — pagePlaid description (+ MB bug fix)
- [x] Step 3 — pageSalt title
- [x] Step 4 — pageSalt description
- [x] Validation (Phase 5)
- [x] Browser test (Phase 6)
- [x] Code review (Phase 7) — APPROVED round 1
- [x] PR (Phase 8) — [Dwilar/lita-ehousing#181](https://github.com/Dwilar/lita-ehousing/pull/181)
