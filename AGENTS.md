# Dw-Platform Agent Guide

This repository is a FastAPI backend plus Next.js frontend workspace. Agents working here should optimize for low-friction autonomous execution while still respecting safety and environment limits.

## Repo Inference First

Before making changes:

1. Inspect the repo to infer the active stack, package manager, test runner, typecheck/lint tools, and validation entrypoints.
2. Reuse the repo's actual commands instead of guessing. Current defaults are:
   - Backend: Python, FastAPI, SQLAlchemy, pytest
   - Frontend: Node.js, Next.js, Jest, npm
   - Broad validation: `validate.ps1` on Windows, `validate.sh` on Unix shells
3. Prefer reading existing implementation paths, tests, and docs before proposing architecture changes.

## Research Before Coding

For any non-trivial task, do a brief research phase first:

1. Inspect the relevant files directly.
2. Search for analogous code paths and tests already in the repo.
3. Check existing docs under `docs/` if the task touches an unfamiliar domain area.
4. Use web research only when the question depends on unstable external facts, third-party behavior, recent APIs, pricing, regulations, or documentation not already in the repo.

Keep the research phase short and practical. The goal is to reduce wrong turns, not delay implementation.

## Execution Style

- Default to making the change instead of stopping at analysis.
- Keep plans short unless the task is large or risky.
- Prefer the smallest safe change that fits existing repo patterns.
- Be execution-heavy and low-chatter: inspect, plan briefly, implement, validate, fix once, then report.

## Validation Policy

After every code change, automatically run the smallest relevant validation first, then expand only if needed.

Preferred order:

1. Targeted test(s)
2. Targeted lint/typecheck/build step for the touched area
3. Broader project validation only if required by the task or risk

Repo-specific examples:

- Backend targeted tests:
  - `backend\\.venv\\Scripts\\python.exe -m pytest backend\\tests\\interface\\test_credit_upload_endpoints.py -v`
  - or use the venv python discovered by `validate.ps1`
- Frontend targeted tests:
  - `npm test -- --runInBand <pattern>` when applicable
- Broad validation:
  - `powershell -ExecutionPolicy Bypass -File .\\validate.ps1`

If validation fails:

1. Diagnose the failure.
2. Attempt at least one fix-and-rerun cycle if the failure is plausibly caused by the current change.
3. Only escalate after that if blocked.

## Approval Policy

Do not interrupt the user for routine local work.

Only ask for approval if:

- network access is required and not already allowed
- a command would write outside the workspace
- a destructive action is needed
- secrets, credentials, or missing env vars block progress
- there are multiple legitimate product decisions that cannot be inferred

Examples that should not require user interruption when allowed by the environment:

- reading files
- searching code
- editing workspace files
- creating focused docs/skills/config
- running targeted local validation

Examples that should trigger escalation:

- dependency install requiring external network
- cloud/API verification blocked on missing credentials
- deleting or resetting user work
- pushing branches or creating PRs

## Reporting Format

Always end with:

- files changed
- commands run
- validation results
- remaining risks / assumptions

When useful, separate "what was verified" from "what is still blocked by environment".

## Repo Notes

- `validate.ps1` is the preferred Windows verifier and accepts `-PythonPath`, `-BackendOnly`, and `-FrontendOnly`.
- Backend validation may be blocked by missing Google ADC / Cloud SQL-related credentials in this repo.
- Frontend builds currently run through `next build`.
- Keep changes CRLF-safe on Windows when touching project text files.
- Observability: see `docs/observability/README.md` for runbooks, dashboards,
  alert thresholds, and rollback steps. Backend telemetry is gated behind
  `ENABLE_OBSERVABILITY=true`; frontend RUM behind `NEXT_PUBLIC_ENABLE_RUM=true`.
  Local sidecar stack: `bash platform/observability/up.sh`.
  Engineer dashboard portal: http://127.0.0.1:3001 (Grafana, dev only).
