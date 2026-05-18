# Summary: Auth Fixes — 2026-04-28

## PRs Merged: 3 (+ standalone commits)

## What Changed

- **Roles** (#84): Auth0 RBAC roles now fetched from Management API at login — previously roles were missing or stale
- **Org ID** (#69): Organisation ID passed through Next.js middleware and docker-compose so all requests carry correct org context
- **Action bugs** (#77): Archive, approve, deny actions fixed along with logo and dashboard nav cleanup
- **Windows path fix**: turbopack.root backslash normalised to prevent dev server misconfiguration on Windows

## Theme

Auth stability — correct role resolution and org context unblocked all downstream permission-gated features.

## References

- Detail: [context.md](context.md)
- Project overview: [../about.md](../about.md)
