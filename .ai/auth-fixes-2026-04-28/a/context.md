# Context: Auth Fixes — 2026-04-28

## Task Description

Fix Auth0 role resolution, organisation ID propagation, and downstream action bugs (archive, approve, deny) that depended on correct auth state.

## PRs & Commits

| PR | Description |
|----|-------------|
| #84 | Fix Auth0 roles: fetch RBAC roles via Management API on login |
| #69 | Fix Auth0 login: pass organization ID through middleware and docker-compose |
| #77 | Fix auth, archive/approve/deny actions, logo, and dashboard nav cleanup |
| — | Fix Windows backslash paths in turbopack.root calculation |

## Key Files

- `frontend/src/middleware.ts` — org ID injection
- `frontend/src/app/api/auth/[...auth0]/route.ts` — Management API role fetch
- `docker-compose.yml` — AUTH0_ORG_ID env var
- `next.config.js` — turbopack.root Windows path fix
- Backend route guards — role-gated endpoints

## Build Info

- Frontend: `next build`
- Backend: `powershell -ExecutionPolicy Bypass -File .\validate.ps1 -BackendOnly`
