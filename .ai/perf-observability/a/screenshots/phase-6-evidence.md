# Phase 6 — Browser Test Evidence

This PR is ~95 % infra/CI/tooling (docker compose, prometheus, grafana, GH Actions, dashboards, k6 scripts, runbooks). The runtime UI touchpoints are:

1. A no-op-by-default `<RumProvider/>` mounted in `frontend/app/layout.tsx`.
2. A new `/api/rum` POST route that validates with zod and forwards to the OTel collector (only when the flag is on).

Because the Lita app gates `/` behind an Auth0 redirect (handled by `frontend/middleware.ts`) and the local dev session has no Auth0 secrets, "golden path" pages don't render meaningfully without a configured backend. Visual screenshots of authenticated pages would not differ from main and would not exercise the new code.

What we DID verify against the running dev server (`npm run dev` on port 64604, Next.js 16.2.0):

## Build / boot

```
Next.js 16.2.0 (Turbopack)
- Local: http://localhost:64604
✓ Ready in 488ms
- Experiments (use with caution):
  · clientTraceMetadata
  ✓ parallelServerBuildTraces
  ✓ parallelServerCompiles
  ✓ webpackBuildWorker
```

No TypeScript compilation errors at boot. HMR connected.

## /api/ready (existing, regression check)

```
GET /api/ready  →  200 {"ok": true}
```

## /api/rum (new in this PR)

Valid LCP payload:
```
POST /api/rum {"name":"LCP","value":1234,"delta":1234,"id":"abc-1","path":"/applicants","rating":"good","navigationType":"navigate"}
→ 204 (369 ms first request, 13 ms after warm-up)
```

Invalid `name` field (zod rejects):
```
POST /api/rum {"name":"FAKE","value":1,"delta":0,"id":"x","path":"/"}
→ 400 (17 ms)
```

Invalid JSON body:
```
POST /api/rum body=<not json>
→ 400 (10 ms)
```

## RUM tree-shaking guard

With `NEXT_PUBLIC_ENABLE_RUM` unset/false (the default), `frontend/lib/rum.ts`'s top-level `if (process.env.NEXT_PUBLIC_ENABLE_RUM !== "true") return;` causes the body to be eliminated. Console-log scan against the running dev server returned ZERO `web-vitals` / `RUM` / `onLCP|onINP|onCLS|onFCP|onTTFB` references — confirming the gate works.

## Mobile viewport sanity

`window.innerWidth` returned `375`, `window.innerHeight` returned `812` after `preview_resize` to mobile preset. `/api/ready` and `/api/rum` both behaved identically to desktop.

## What we deliberately did NOT screenshot

- Authenticated app pages — require Auth0 secrets + a running backend.
- Grafana dashboards — require `bash platform/observability/up.sh` plus a backend emitting metrics; covered in `docs/observability/runbooks/dashboards.md`.
- Lighthouse mobile run — requires the published prod URL or a CI compose stack; CI workflow `perf-pr.yml` exercises this on every PR.

## Conclusion

The two browser-observable changes (`<RumProvider/>` no-op-by-default + `/api/rum` validation route) work as designed. Pre-existing app behaviour is unchanged.
