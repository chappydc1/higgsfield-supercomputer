# Task b Context — Make Playwright + Allure work across workflows

## Request
Ensure Playwright Allure reporting works with the GitHub workflows.

## Findings
- `deploy.yml` and `daily-prod-e2e.yml` already install Allure CLI, generate HTML from `allure/allure-results`, and publish/upload results.
- `pr.yml` runs Playwright and uploads `playwright-report`, but it does not generate/upload Allure HTML output.
- Playwright config writes Allure results into `frontend/allure/allure-results`, so the PR workflow can generate the same HTML report without path changes.

## Scope
- Update `.github/workflows/pr.yml` only.
