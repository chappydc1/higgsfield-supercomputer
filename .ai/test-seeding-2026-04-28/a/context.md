# Context: Test Data Seeding — 2026-04-28

## Task Description

Expand the test applicant seeder to support multi-country data (Japan + US), 50 applicants per country, with convenient one-command shell scripts for local and prod environments.

## PRs & Commits

| PR | Description |
|----|-------------|
| #80 | Expand test user seeder: multi-country (Japan + US), 50 applicants each, runnable shell scripts |

## Key Files

- `scripts/applicants-local.sh` — seeds 50 JP + 50 US applicants against local env
- `scripts/applicants-prod.sh` — seeds against prod (guarded)
- Python seeder — generates applicant records with country-specific fields

## Notes

- Shell scripts use `set -euo pipefail` per REVIEW.md rule 12.
- Separate local/prod scripts prevent accidental prod seeding.
- 50 applicants per country chosen for meaningful pagination and filter testing.

## Build Info

- No build step. Run scripts directly:
  - `bash scripts/applicants-local.sh`
  - `bash scripts/applicants-prod.sh`
