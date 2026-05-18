# Project: test-seeding-2026-04-28

## Project

Test data seeder expansion shipped on 2026-04-28. Supports multi-country applicant generation (Japan and US), 50 applicants per country, with one-command shell scripts for local and prod environments.

## Architecture

Seeder scripts under `scripts/` (or `backend/tests/`). Shell scripts wrap the Python seeder for easy CLI invocation. Applicant data includes country-specific fields to exercise the platform's multi-market logic.

## Key Design Decisions

- 50 applicants per country to provide statistically meaningful test data.
- Separate scripts for local (`applicants-local`) and prod (`applicants-prod`) to prevent accidental prod seeding.
- Shell scripts follow `set -euo pipefail` as required by REVIEW.md rule 12.

## Relevant Codebase Areas

- `scripts/applicants-local.sh` / `scripts/applicants-prod.sh`
- Backend seeder (Python) — generates applicant records per country
