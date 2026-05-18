# Project: Playwright CI Reliability

This project defines a stable Playwright CI strategy across pull request, deploy, and scheduled production workflows. The workflow design scopes test execution to the appropriate environment-specific suites, produces Playwright and Allure artifacts, and reports clear results to Slack/GitHub Actions.

The Playwright configuration supports multiple browser projects and environment-driven base URLs, while workflow commands explicitly target environment-appropriate specs to avoid cross-environment false failures. The PR workflow verifies dev-oriented suites, and the daily production workflow validates production-safe E2E coverage.

The daily production workflow (`.github/workflows/daily-prod-e2e.yml`) auto-discovers every `*-prod-tests.spec.ts` file under `frontend/eHousing_Web/tests/testcases/` via a single shell-glob step, so any prod spec added later runs automatically with no workflow edit. The naming split — `*-dev-tests.spec.ts` for the PR workflow, `*-prod-tests.spec.ts` for the daily workflow — is the contract that keeps dev specs out of production runs. An empty-glob guard fails the step loudly rather than letting Playwright fall back to its `testMatch` config and silently sweep in dev specs.
