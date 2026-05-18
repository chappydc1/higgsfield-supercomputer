# ci-fix

## Project Overview

The `compile.yml` GitHub Actions workflow is the PR gate for the lita-ehousing repository. It runs backend Python tests and frontend Jest tests on every pull request and push to `main`. The workflow is named **Lita** and its steps mirror what the local `./validate.sh` script does, so a passing `./validate.sh` guarantees a passing CI run.

## Architecture

### Workflow: `.github/workflows/compile.yml`

**Trigger:** `push` to `main`, `pull_request` targeting `main`.

**Jobs:**

- `test` — runs on `ubuntu-latest`:
  1. Checkout repository
  2. Set up Python 3.10
  3. Install backend deps (`pip install -r requirements.txt pytest httpx`)
  4. Run backend unit tests (`pytest tests/ -v`)
  5. Set up Node 20 with npm cache keyed on `frontend/package-lock.json`
  6. Install frontend deps (`npm ci --legacy-peer-deps` inside `frontend/`)
  7. Run frontend Jest tests (`npm test`)

- `finalize` — labels and comments on PRs with pass/fail result; fails the workflow if `test` failed.

### Local validate.sh alignment

`validate.sh` uses `npm ci --legacy-peer-deps --silent` for the frontend install step. The CI workflow uses exactly the same flags so a clean lockfile-based install is guaranteed and lifecycle scripts (e.g., `prepare: husky`) from stale installs cannot fire.
