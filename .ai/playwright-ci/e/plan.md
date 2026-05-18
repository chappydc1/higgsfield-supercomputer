# Task e Plan — Daily workflow runs all prod specs

## Status
Phases: 4
- [x] Phase 1: Replace three hardcoded run steps with a single glob-driven step
- [x] Phase 2: Collapse results aggregation to one JSON
- [x] Phase 3: Collapse Slack outcome handling
- [x] Phase 4: Validate (YAML parse + bash glob + orphan-reference grep; `playwright test --list` skipped — node_modules absent in worktree, see logs/phase-5.result.md)

## Rollback plan
Revert the single commit on `chore/playwright-ci-daily-all-tests`. The workflow change is self-contained to `.github/workflows/daily-prod-e2e.yml`. No data, no migrations, no other workflows affected.

## Phase 1 — Single glob step
Replace lines 58–86 of `.github/workflows/daily-prod-e2e.yml` with one step:

```yaml
- name: Run Playwright E2E — all prod specs
  id: pw_prod
  continue-on-error: true
  env:
    PLAYWRIGHT_BASE_URL: https://ehousing.joinlita.com
    CI: "true"
  shell: bash
  run: |
    shopt -s nullglob
    SPECS=(eHousing_Web/tests/testcases/*-prod-tests.spec.ts)
    if [ ${#SPECS[@]} -eq 0 ]; then
      echo "No *-prod-tests.spec.ts files found under eHousing_Web/tests/testcases/"
      exit 1
    fi
    printf 'Running %d prod spec(s):\n' "${#SPECS[@]}"
    printf '  %s\n' "${SPECS[@]}"
    npx playwright test "${SPECS[@]}"
```

`shopt -s nullglob` ensures an unmatched glob expands to an empty array (rather than the literal pattern), which the explicit guard then rejects.

## Phase 2 — Results aggregation
Replace lines 88–104 with a single-file aggregation reading `test-results.json` (the JSON reporter target from `playwright.config.ts:28`):

```yaml
- name: Parse test results
  if: always()
  id: results
  shell: bash
  run: |
    if [ -f test-results.json ]; then
      PASSED=$(jq '(.stats.expected // 0) + (.stats.flaky // 0)' test-results.json)
      FAILED=$(jq '.stats.unexpected // 0' test-results.json)
      SKIPPED=$(jq '.stats.skipped  // 0' test-results.json)
      TOTAL=$((PASSED + FAILED + SKIPPED))
    else
      TOTAL=0; PASSED=0; FAILED=0; SKIPPED=0
    fi
    echo "total=$TOTAL"     >> "$GITHUB_OUTPUT"
    echo "passed=$PASSED"   >> "$GITHUB_OUTPUT"
    echo "failed=$FAILED"   >> "$GITHUB_OUTPUT"
    echo "skipped=$SKIPPED" >> "$GITHUB_OUTPUT"
```

## Phase 3 — Slack notification
Replace the three `OUTCOME_*` env vars (lines 145–147) with one:

```yaml
OUTCOME_PROD: ${{ steps.pw_prod.outcome }}
```

Replace the `if/elif` block at lines 156–158 with:

```bash
PLAYWRIGHT_OUTCOME="$OUTCOME_PROD"
```

The rest of the Slack block stays identical — same emoji, same buttons, same Allure/run URLs.

## Phase 4 — Validation
1. Parse the modified YAML with Python's `yaml.safe_load` to confirm syntax is valid.
2. Run `npx playwright test --list eHousing_Web/tests/testcases/*-prod-tests.spec.ts` from `frontend/` to confirm Playwright discovers 3+ test cases across the 3 specs (skip if Playwright isn't installable in this sandbox; record reason).
3. Diff-only check — confirm no other workflow file changed.

## Verification artifacts
- `.ai/playwright-ci/e/logs/phase-4.result.md` — YAML parse output, list output (or skip reason)
- `.ai/playwright-ci/e/logs/phase-7.result.md` — self-review notes
