# Task c Context — Fix Daily Prod Playwright failures

## User request
Fix Playwright tests so the failing GitHub Actions run passes.

## Observations
- Daily prod workflow runs `npm run All`, which maps to `playwright test` and executes both `*-dev-tests.spec.ts` and `*-prod-tests.spec.ts` because `playwright.config.ts` uses broad `testMatch`.
- The linked failing run reports 45 total tests (9 tests × 5 browser projects), indicating both DEV and PROD suites ran in a production workflow.
- The workflow intent is production validation (`PLAYWRIGHT_BASE_URL=https://ehousing.joinlita.com`), so DEV suites are out-of-scope and can create systematic failures.
- A similar prod-only command already exists in `.github/workflows/deploy.yml` and targets only `applicants-prod-tests.spec.ts` and `application-prod-tests.spec.ts`.

## Change scope
- Update only `.github/workflows/daily-prod-e2e.yml` so prod workflow executes prod specs explicitly.
