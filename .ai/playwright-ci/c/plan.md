# Task c Plan

1. Modify `daily-prod-e2e.yml` Playwright run step to execute only `applicants-prod-tests.spec.ts` and `application-prod-tests.spec.ts`.
2. Run a command-level verification (`playwright test --list`) with the same spec arguments to ensure only prod tests are selected.
3. Record review notes and remaining validation risks (browser/proxy limits in this environment).
