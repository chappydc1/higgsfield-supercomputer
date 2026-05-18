# Task e — Daily workflow runs all prod test files

## Goal
Make `.github/workflows/daily-prod-e2e.yml` execute every `*-prod-tests.spec.ts` file under `frontend/eHousing_Web/tests/testcases/`, instead of three hardcoded spec paths. New prod test files added later must be picked up automatically with no workflow edit.

## Current state (verified on disk, 2026-05-07)

`frontend/eHousing_Web/tests/testcases/` contains exactly three prod spec files:

- `applicants-prod-tests.spec.ts`
- `application-prod-tests.spec.ts`
- `application-signup-prod-tests.spec.ts`

`.github/workflows/daily-prod-e2e.yml` lines 58–86 invoke `npx playwright test <path>` three separate times — once per spec file — each `continue-on-error: true`, each writing its own results JSON (`e2e-results-app-flow.json`, `e2e-results-signup.json`, `e2e-results-applicants.json`). Lines 88–104 aggregate the three JSON files. Lines 145–158 fan three step outcomes (`pw_app_flow`, `pw_signup`, `pw_applicants`) into a single Slack outcome.

Coverage is correct **today** (3 of 3 prod specs). The risk is brittleness: a fourth `*-prod-tests.spec.ts` added next week will not run unless someone also edits this workflow. Tasks `c` and `d` previously narrowed the daily workflow to a hardcoded list; this task reverses that direction so every prod-named spec is included by default.

## Convention to preserve

Per `.ai/playwright-ci/about.md`, the daily workflow is reserved for production-safe coverage. The naming split — `*-dev-tests.spec.ts` for the PR workflow, `*-prod-tests.spec.ts` for the daily workflow — must remain intact. We must NOT pull dev specs into the daily run; that would hit production with development-only assertions/state.

## Approach

Collapse the three `Run Playwright E2E — *` steps into a single step that invokes Playwright with a shell glob:

```
npx playwright test eHousing_Web/tests/testcases/*-prod-tests.spec.ts
```

The workflow `defaults.run.working-directory: frontend` (line 17–18) means bash globs expand relative to `frontend/`, where the path resolves to all matching prod specs.

Single step → single `test-results.json` → single results aggregation → single Slack outcome. The Slack message template stays the same; the per-suite outcome variables collapse into one.

## Key files

- `.github/workflows/daily-prod-e2e.yml` — only file modified
- `frontend/playwright.config.ts` — read-only reference; `testMatch` is `['e2e/**/*.spec.ts', 'eHousing_Web/tests/**/*.spec.ts']`, JSON reporter writes `test-results.json` (line 28)
- `frontend/eHousing_Web/tests/testcases/*-prod-tests.spec.ts` — read-only; the targets

## Risks and mitigation

- **Glob expands to nothing**: If someone renamed every prod spec, `npx playwright test` would receive zero arguments and run *all* tests under `testMatch`, including dev specs. Mitigation: assert the glob expanded by adding a one-line guard before the playwright invocation (`compgen -G '...' >/dev/null || { echo 'no prod specs found'; exit 1; }`).
- **Loss of per-suite reporting**: Slack will no longer show which of the three suites failed in the message text. Mitigation: Allure/Playwright HTML reports still surface this; the Slack message keeps `Total/Passed/Failed/Skipped` counts. Acceptable trade-off given the ask.
- **GitHub Actions cron edits are deploy-sensitive**: The workflow runs on a schedule; a YAML syntax error would silently break the next 07:00 UTC run. Mitigation: validate YAML with a parser before committing; keep the diff minimal and reviewable.

## Out of scope

- Touching the PR workflow (`pr.yml`) — already runs dev specs separately.
- Renaming spec files.
- Changing the cron schedule, environment, or Slack/Allure reporting structure beyond aggregation.
