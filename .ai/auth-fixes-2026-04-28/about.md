# Project: auth-fixes-2026-04-28

## Project

Auth0 integration fixes shipped on 2026-04-28. Resolves role resolution, organisation ID propagation, and several downstream action bugs (archive, approve, deny) that depended on correct auth state.

## Architecture

Auth0 used for authentication. Roles resolved via the Auth0 Management API on each login (not from the ID token directly). Organisation ID passed through Next.js middleware and docker-compose environment. FastAPI backend validates JWT and role claims.

## Key Design Decisions

- RBAC roles fetched from Management API at login time to ensure up-to-date permissions.
- Organisation ID injected at middleware level so all API calls carry the correct org context.
- Windows-specific turbopack.root backslash path normalisation fixed to prevent dev-server misconfiguration.

## Relevant Codebase Areas

- `frontend/src/middleware.ts` — org ID propagation
- `frontend/src/app/api/auth/` — Auth0 login handlers
- `docker-compose.yml` — env var wiring
- `backend/interface/` — role-gated FastAPI routes
