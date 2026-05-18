# Context: ci-fix / a

## Task

Align `compile.yml` with `validate.sh` so a passing local script guarantees a passing CI run, and rename the workflow branding from "DWILAR | Compile" to "Lita".

## Problem

The CI `test` job used `npm install --legacy-peer-deps` to install frontend dependencies. `npm install` (unlike `npm ci`) resolves package versions at run time and executes lifecycle scripts including `prepare`. When a package's `prepare` script calls `husky` (which is not installed as a dependency), the install fails with exit code 127 (`husky: not found`). `validate.sh` uses `npm ci --legacy-peer-deps`, which is a clean, lockfile-based install and does not exhibit this failure.

Additionally, the CI did not set up a Node.js environment with caching before the frontend step, while `deploy.yml` does so correctly.

## Files Changed

- `.github/workflows/compile.yml` — two edits:
  1. Add a "Set up Node" step (Node 20, npm cache on `frontend/package-lock.json`) before the frontend test step.
  2. Replace `npm install --legacy-peer-deps` with `npm ci --legacy-peer-deps`.
  3. Rename `name:` field and `run-name:` references from `DWILAR | Compile` to `Lita`.

## Key References

- `validate.sh` lines 113–120: frontend npm ci + npm test
- `.github/workflows/deploy.yml` lines 56–62: Node 20 setup + npm ci pattern (already working)
- `.github/workflows/compile.yml` lines 41–45: broken `npm install` step (target of fix)
