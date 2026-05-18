# fix-applicant-load

Fix for the applicants page not loading in production. The `AuthProvider` was updated in commit 8a617074 to expose `isInitialized` in context rather than rendering null until initialized. The dashboard was updated to gate its login redirect on `authInitialized`, but `applicants/page.tsx` was not — causing an immediate redirect to `/login` on every page load before localStorage auth was read.

## Fix
Single-line change: `applicants/page.tsx` now reads `isInitialized` from `useAuth()` and guards the redirect effect with `if (!authInitialized) return`, matching the pattern in `dashboard/page.tsx`.
