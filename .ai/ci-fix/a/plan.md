# Plan: ci-fix / a

## Phase 1 — Rename workflow branding

Edit `.github/workflows/compile.yml`:
- `name: DWILAR | Compile` → `name: Lita`
- `run-name:` string: replace `[DWILAR | Compile]` → `[Lita]`

## Phase 2 — Fix frontend install step

Edit `.github/workflows/compile.yml` — in the `test` job, before the existing "Run frontend tests" step, add a "Set up Node" step:

```yaml
- name: Set up Node
  uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "npm"
    cache-dependency-path: frontend/package-lock.json
```

Then change the "Run frontend tests" step body from:
```
npm install --legacy-peer-deps
```
to:
```
npm ci --legacy-peer-deps
```

## Phase 3 — Commit to new-fix branch

Create branch `new-fix` off current HEAD and commit all changes.
