---
name: auto-research-auto-verify
description: Use for debugging, feature work, refactors, external-library changes, or unfamiliar code areas. Inspect repo context first, research analogous code paths, make a short plan, implement, validate, and summarize with minimal user interruption.
---

# Auto-Research + Auto-Verify

Use this skill when the task involves:

- debugging
- implementing features
- refactors
- external-library usage
- unfamiliar code areas

## Goals

- reduce avoidable back-and-forth
- research before changing code
- validate the smallest relevant surface first
- fix once before escalating

## Workflow

1. Inspect repo context first
   - identify backend/frontend area
   - infer framework, test runner, lint/build commands from the repo
   - read the files directly involved

2. Research analogous code paths
   - search for nearby implementations
   - search for similar tests
   - inspect relevant docs under `docs/`
   - browse the web only if the task needs unstable external facts or third-party documentation not present locally

3. Make a short plan
   - keep it compact
   - call out the smallest likely validation to run after the change

4. Implement
   - follow existing repo patterns
   - keep the change set narrow
   - avoid speculative cleanup unless it directly reduces risk

5. Validate
   - prefer this order:
     1. targeted test(s)
     2. targeted lint/typecheck/build
     3. broader validation only if needed
   - repo defaults:
     - backend broad validation: `powershell -ExecutionPolicy Bypass -File .\validate.ps1 -BackendOnly`
     - frontend broad validation: `powershell -ExecutionPolicy Bypass -File .\validate.ps1 -FrontendOnly`
     - full validation: `powershell -ExecutionPolicy Bypass -File .\validate.ps1`

6. Fix once if needed
   - if the failure looks caused by the current change, attempt one focused fix-and-rerun cycle before asking the user

7. Summarize
   - what changed
   - what was validated
   - what remains blocked by environment or credentials

## Approval Rules

Do not interrupt the user for routine local work.

Only interrupt when:

- network access is required and not already available
- writing outside the workspace is required
- a destructive action is required
- missing credentials or env vars block useful verification
- multiple product choices are equally plausible and cannot be inferred

## Repo-Specific Notes

- Backend tests may fail before execution if Google ADC credentials are missing.
- Frontend uses npm and Jest.
- The repo’s Windows-first verifier is `validate.ps1`.
