# Context: CI / DevOps — 2026-04-28

## Task Description

Wire Playwright E2E into PR and deploy workflows, publish Allure reports to GitHub Pages, add daily prod E2E with Slack notification, and automate PR labels and reviewer assignment.

## PRs & Commits

| PR | Description |
|----|-------------|
| #91 | Add daily prod E2E workflow with Allure report and Slack notification |
| #90 | Generate CI reports index with Lita logo and run metadata on each E2E deploy |
| #89 | Auto-apply correct labels from E2E results and PR reviews |
| #88 | Fix Playwright application flow tests + add Allure report to GitHub Pages |
| #87 | Add staff team to auto-assign reviewers on every PR |
| #85 | Add Playwright E2E to PR workflow; make prod E2E opt-in on deploy |
| #82 | Add Playwright recording requirement to PR templates |
| #81 | Add Playwright E2E job to deploy workflow (all browsers → ehousing.joinlita.com) |
| #78 | Fix PR workflow: trigger Slack notification on push to existing PRs |
| — | Initialize gh-pages branch for GitHub Pages |

## Key Files

- `.github/workflows/pr.yml` — PR Playwright job
- `.github/workflows/deploy.yml` — deploy-time E2E
- `.github/workflows/daily-e2e.yml` — scheduled daily prod run
- `.github/workflows/auto-label.yml` — label automation
- `.github/workflows/auto-assign.yml` — reviewer assignment
- `.github/pull_request_template.md` — Playwright recording requirement
- `gh-pages` branch — Allure HTML reports + CI index

## Secrets / Environment

- `QA_SLACK_WEBHOOK_URL` — Slack webhook for daily E2E results
- `GH_PAT` — token with team reviewer request permissions
- Job environment: `qa-webhook`

## Build Info

- Playwright: `npx playwright test`
- Allure: `allure generate` → push to `gh-pages`
