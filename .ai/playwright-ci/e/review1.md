# Review 1 — Daily Prod E2E workflow refactor

**Verdict:** APPROVED

## Trust path

I walked through every concern in the brief and could not find a defect that warrants blocking. The change is small, self-contained to one workflow, and the safety properties hold:

1. **Glob safety.** `shopt -s nullglob` ensures an unmatched pattern expands to zero elements (not the literal `*-prod-tests.spec.ts` string, which Playwright would interpret as a non-existent path or — worse, depending on shell semantics — `bash` would pass the literal as one argument). The explicit `[ ${#SPECS[@]} -eq 0 ]` guard then `exit 1`s **before** `npx playwright test` is called. This closes the dangerous fall-through where calling `npx playwright test` with no args would resolve via `testMatch` (`frontend/playwright.config.ts:34`) and silently sweep in every `*-dev-tests.spec.ts` file (21 of them — see `frontend/eHousing_Web/tests/testcases/`).
2. **Quoting.** `"${SPECS[@]}"` correctly preserves each path as one argument, even with spaces (none currently exist). Standard bash idiom.
3. **Reporter behaviour.** `frontend/playwright.config.ts:28` registers the JSON reporter with `outputFile: 'test-results.json'`. Playwright writes one aggregate file for the whole run (across all spec args), not per-spec — so the new "Parse test results" step reading a single file is correct.
4. **`continue-on-error: true` + `exit 1`.** When the glob is empty and the step exits 1, GitHub Actions records `outcome=failure` and `conclusion=success` (because `continue-on-error` swallows it). Downstream `if: always()` steps still run. The Slack step then sees `OUTCOME_PROD=failure` and routes to the `:x:` "Some tests failed" branch, which is the right signal.
5. **Working directory.** `defaults.run.working-directory: frontend` (`.github/workflows/daily-prod-e2e.yml:18`) applies to every `run:`. The glob `eHousing_Web/tests/testcases/*-prod-tests.spec.ts` resolves correctly relative to `frontend/`, where the three current prod specs live (`applicants-prod-tests.spec.ts`, `application-prod-tests.spec.ts`, `application-signup-prod-tests.spec.ts`).
6. **Step IDs and outputs.** New step `id: pw_prod` (`.github/workflows/daily-prod-e2e.yml:59`) matches the Slack reference `steps.pw_prod.outcome` (`:133`). Verified.
7. **No orphaned references.** `grep -rnE "pw_app_flow|pw_signup|pw_applicants|e2e-results-app-flow|e2e-results-signup|e2e-results-applicants" .github scripts` returns no matches. Clean.
8. **YAML parses.** `python3 -c "import yaml; yaml.safe_load(open('.../daily-prod-e2e.yml'))"` succeeds. The 07:00 UTC cron will not silently break.
9. **Allure / Slack downstream independence.** Allure CLI generation reads `frontend/allure/allure-results/` (still produced by Playwright via the `allure-playwright` reporter at `frontend/playwright.config.ts:25`). The HTML report comes from `frontend/playwright-report/`. Neither depends on the old per-spec JSONs. Slack only consumes `steps.results.outputs.*` and `steps.pw_prod.outcome`.

The dev/prod naming convention is preserved: the glob `*-prod-tests.spec.ts` excludes every `*-dev-tests.spec.ts` file, and the empty-glob guard prevents the fallback that would have run them all.

## Blockers

None.

## Suggestions

None worth blocking on. (Optional polish noted below as nits.)

## Nits

- **`.github/workflows/daily-prod-e2e.yml:65-74`** — The run block doesn't enable `set -euo pipefail` like the Slack step does (`:139`). Today this is harmless because the only failure modes are the explicit `exit 1` and `npx playwright test` itself (whose non-zero exit naturally propagates as the step's exit code). If this script grows in the future, missing `set -e` could mask intermediate failures. Concrete fix: add `set -euo pipefail` as the first line of the `run:` block. Not worth a re-review.

- **`.github/workflows/daily-prod-e2e.yml:67`** — The `printf` listing the spec count and paths is helpful for log diagnostics, but the count line lacks a header tying it to the workflow context. Concrete fix (optional): change `'Running %d prod spec file(s):\n'` to `'Found %d *-prod-tests.spec.ts file(s) in eHousing_Web/tests/testcases/:\n'` so a future sleepy on-caller scanning logs immediately sees what was matched. Pure ergonomics.

- **Plan checklist.** `.ai/playwright-ci/e/plan.md` still lists all four phases as `[ ]`. Not part of this diff and not blocking, but worth ticking off when this lands so the artifact reflects reality.
