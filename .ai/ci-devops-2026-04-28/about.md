# Project: ci-devops-2026-04-28

## Project

CI/DevOps infrastructure shipped on 2026-04-28. Full Playwright E2E suite integrated into PR and deploy workflows, Allure HTML reports published to GitHub Pages, a daily prod E2E run added with Slack notification, and automation for PR labels and reviewer assignment.

## Architecture

GitHub Actions workflows under `.github/workflows/`. Playwright runs against the local dev server on PRs and against `ehousing.joinlita.com` on deploys. Allure report artifacts uploaded and published via `gh-pages` branch. Slack webhook notifies on daily prod E2E result. Label automation reads E2E outcomes and PR review states.

## Key Design Decisions

- PR Playwright tests run against local dev server (not remote URL) for isolation.
- Prod E2E is opt-in on deploy but mandatory on the daily scheduled run.
- Allure reports hosted on GitHub Pages under `gh-pages` branch initialised on 2026-04-28.
- `QA_SLACK_WEBHOOK_URL` secret used for daily E2E notification; `qa-webhook` job environment scopes the secret.
- Staff team + `kapil-dwilar` added to auto-assign reviewers on every PR via `GH_PAT`.
- PR templates updated to require a Playwright recording attachment.

## Relevant Codebase Areas

- `.github/workflows/` — all CI workflow files
- `playwright/` or `tests/e2e/` — Playwright test suites
- `gh-pages` branch — Allure report hosting
