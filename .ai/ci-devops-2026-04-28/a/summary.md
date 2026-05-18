# Summary: CI / DevOps — 2026-04-28

## PRs Merged: 10 (+ standalone commits)

## What Changed

- **Playwright in PRs** (#85): E2E tests now run on every PR against local dev server
- **Playwright in deploys** (#81): E2E runs on every deploy against `ehousing.joinlita.com`
- **Daily prod E2E** (#91): Scheduled daily run with Allure report + Slack notification via `QA_SLACK_WEBHOOK_URL`
- **Allure on GitHub Pages** (#88, #90): Reports published to `gh-pages` branch with Lita-branded index
- **Auto-label** (#89): Labels auto-applied based on E2E results and PR review states
- **Auto-assign** (#87): Staff team + `kapil-dwilar` auto-assigned as reviewers on every PR
- **Slack on PR push** (#78): Slack notification triggers on push to existing PRs (not just new ones)
- **PR template** (#82): Playwright recording attachment now required in PR template

## Theme

Full E2E observability pipeline — every PR, deploy, and daily run now produces a linked Allure report and triggers Slack alerts.

## References

- Detail: [context.md](context.md)
- Project overview: [../about.md](../about.md)
