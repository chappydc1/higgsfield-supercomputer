# Project: frontend-ui-2026-04-28

## Project

Frontend UI improvements shipped on 2026-04-28 for the lita-ehousing platform. Covers the dashboard, QA/CI reports page, and the applicants listing page. Changes focused on visual polish, font consistency, icon modernisation, and applicant data filtering.

## Architecture

Next.js frontend (`frontend/` or `apps/web/`). Pages live under `src/app/`. Phosphor icons library used for iconography. Inter font applied globally via universal selector. Applicants page extended with date range filter, permit number column, and CSV export.

## Key Design Decisions

- Phosphor arrow icons replace custom triangle trend indicators on the dashboard.
- Inter font set on `*` selector to guarantee inheritance across all elements.
- QA/CI reports page redesigned as horizontal list rows with vertical key-value metadata display.
- /applicants redesigned: Affluence column replaced by Permit No., filters added, Export CSV added.
- Beamer widget removed; action bar layout fixed; calendar week start corrected.

## Relevant Codebase Areas

- `frontend/src/app/` — page components
- `frontend/src/components/` — shared UI components
- Dashboard trend indicators
- QA/CI reports index page
- Applicants listing page
