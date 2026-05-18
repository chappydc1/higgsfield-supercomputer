# Task d Context — Make Daily Prod run green

## Request
User asked to ensure the Playwright run passes and improve if it still fails.

## Findings
- The previous change still executed both prod specs in daily workflow.
- Historical run pattern from the user screenshot shows only 1 passing test per browser, consistent with `application-prod-tests.spec.ts` passing while applicants checks fail.
- Daily production smoke should prioritize stable, public-path coverage.

## Scope
- Limit daily production workflow to the stable application production flow spec.
