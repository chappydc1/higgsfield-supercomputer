# Code Review — Round 1

## Verdict

NEEDS_CHANGES

The PR is impressively broad and the bones are good — flag-gating in `main.py`, dashboard JSON well-formed, runbooks present, k6 scripts produce JUnit + JSON, `withSentryConfig` correctly stays outer, host-port bindings on `127.0.0.1`. But several class-1 production correctness defects mean the alerting plane will be silently inert at 3am, the PR-time CI will pollute the prod database with fake applicants, and a few "this should be no-op when flag is off" claims in the plan don't survive contact with the actual code. None of these are speculative — each one is a reproducible mismatch between what is shipped and what the alert rule, dashboard query, runbook, or workflow says it does.

Below: blockers in priority order, plus follow-ups.

## Critical issues (blockers)

### C1 — Backend Prometheus alerts use a label name (`status`) the metrics never emit

`backend/src/infra/observability/metrics.py:31-36` — the `http_requests_total` Counter declares labels `(method, route, status_class)` and writes `status_class="5xx"` in `_status_class()`.

Every backend alert rule and dashboard panel queries the wrong label name:

- `platform/observability/prometheus/rules/backend.yml:75, 87, 107, 122, 137, 169` — all use `http_requests_total{..., status=~"5.."}`.
- `platform/observability/grafana/dashboards/02-backend-api.json:87` — panel "Error rate (5xx)" uses `status=~"5.."`.

`status` is not a label on this metric, so PromQL evaluates these series to the empty set. **All five backend error-rate alerts (`BackendApplicationsErrorRateCritical`, `BackendApplicationsByIdErrorCritical`, `BackendAuthTokenErrorWarn`, `BackendAuthTokenErrorCritical`, `BackendOverallErrorRateWarn`) will never fire in production**, regardless of how bad the 5xx rate gets. The dashboard "Error rate" stat will permanently show "No data".

**Fix:** Pick one. Either rename the label in `metrics.py` from `status_class` → `status` and emit values like `"5xx"`, or rewrite the rules and panels to use `status_class=~"5xx"`. The dashboard's `Top 10 slowest routes` panel needs a `by (route, le)` already present — keep it. `clamp_min(..., 1e-9)` in the rule denominators is fine. Add a unit test that imports `metrics.py`, ticks the counter once with status 500, and asserts the resulting label set, so this can never silently regress again.

### C2 — Frontend RUM never produces metrics, so all RUM alerts and the entire `01-frontend-rum.json` dashboard are dead

`frontend/app/api/rum/route.ts:142-163` posts the RUM payload as a synthetic OTLP **traces** payload (one span per metric) to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`. There is no metrics path: the OTel collector's `metrics` pipeline (`platform/observability/otel-collector/otel-collector-config.yaml:88-91`) only ingests metrics from receivers, and the collector has neither a `spanmetrics` connector nor a `transform` processor that converts these traces to histogram series like `web_vitals_lcp_seconds_bucket`.

Yet `platform/observability/prometheus/rules/frontend.yml` and `platform/observability/grafana/dashboards/01-frontend-rum.json:73, 88, …` both query `web_vitals_lcp_seconds_bucket`, `web_vitals_inp_seconds_bucket`, `web_vitals_cls_score_bucket`. **Every frontend RUM alert** (LCP warn/critical, INP, CLS) and the entire dashboard 01 will silently never produce data. The Tempo `metrics_generator` does emit `traces_spanmetrics_calls_total` for service-graph-style metrics, but that's not the histogram shape the rules expect, and dashboard 06 (External APIs) is the only place that uses it correctly.

**Fix:** Either (a) post real OTLP/HTTP metrics with histogram envelopes (`/v1/metrics`, OTLP `Sum`/`Histogram`) from `app/api/rum/route.ts` and add a `metrics: receivers: [otlp]` path in the collector — the traces forward can stay for trace-context correlation; or (b) add a `connector: spanmetrics` block in the collector and route traces → spanmetrics → Prometheus. Either way, validate end-to-end with one test request through Prometheus's `/api/v1/query?query=web_vitals_lcp_seconds_bucket` returning a non-empty vector before declaring done.

### C3 — Most alert `runbook_url` annotations resolve to a 404 on the runbook

The runbook has clean kebab-case anchors (`docs/observability/runbooks/alert-thresholds.md` lines 67+: `### backend-health`, `### backend-applications-latency`, `### vm-cpu`, `### oom-kill`, `### blackbox-homepage` …). The alert annotations point at smashed-together slugs (`#backendhealthdown`, `#backendapplications`, `#vmcpu`, `#containeroom`, `#blackboxprobe`, `#postgresconns`, `#mysqlconns`, …). I diffed the two sets — only ~5 of ~30 anchors line up.

Examples (pick any rule file):
- `backend.yml:19` `#backendhealthdown` vs anchor `#backend-health`
- `backend.yml:53, 70` `#backendapplications` vs anchor `#backend-applications-latency`
- `db.yml:24` `#postgresconns` vs anchor `#postgres-connections`
- `infra.yml:16` `#vmcpu` vs anchor `#vm-cpu`
- `infra.yml:76` `#containeroom` vs anchor `#oom-kill`
- `blackbox.yml:16, 28` `#blackboxprobe` vs anchors `#blackbox-homepage`/`#blackbox-health`/`#blackbox-ready`

3am consequence: on-call clicks the runbook link from the page, lands at the top of `alert-thresholds.md`, has to scroll to find the right section while the alert is still firing.

**Fix:** Settle on one slug convention (kebab-case is what the doc already has, and is closer to the rule filename style), then either rewrite every `runbook_url` to match or add the missing anchors as additional headings in `alert-thresholds.md`. A tiny CI lint that greps each `runbook_url` and confirms the fragment exists in the runbook would prevent regression — the prompt's blueprint asks for this explicitly.

### C4 — k6 perf-pr.yml writes to production: every PR creates fake applicant rows in the live DB

`tests/k6/apply-flow.js:64-74` does `http.post(BACKEND_URL/api/v1/applications, …)` in the default scenario; `.github/workflows/perf-pr.yml:175` sets `BACKEND_URL=https://ehousing.joinlita.com`; smoke is 5 VUs × 60 s. Every PR opened on this repo will fire several hundred POSTs at the production backend, each one (when auth succeeds — see C5) creating a real `housing_application` row keyed `k6+<vu>-<iter>-<ts>@example.invalid`. There is no DB cleanup hook, no `?dry_run=true` flag, no deletion job. The plan flags an "ephemeral compose stack" as a known gap but the implementer's chosen middle path — point at prod read-only — was not actually executed read-only.

The same script runs in soak mode against prod nightly via `perf-nightly.yml:48` (50 VUs × 5 m), which would create thousands of fake rows per night.

**Fix (any of):**
1. Stand up an ephemeral compose target (sqlite + minimal seed) for the perf-pr workflow and only target prod for nightly read-only paths.
2. Restrict `apply-flow.js` to GET-only when `BACKEND_URL` matches a production host; expose a separate `apply-flow-write.js` that only runs against ephemeral stacks.
3. Have the backend accept an opt-in `X-Test-Synthetic: 1` header (gated on a server env) that short-circuits persistence — and assert the header is set in the script when targeting prod.

Whichever option, fix BEFORE the workflow runs against prod even once. Same reasoning applies to `auth-token.js:49` (10 VUs × 60 s × 600+ failed-login attempts will trip rate-limit alerting).

### C5 — Middleware order is inverted vs the plan

`backend/src/main.py:51-56` adds `RequestIdMiddleware` before `MetricsMiddleware`, and the plan claims the resulting order is "RequestId → /metrics mount → init_tracing → CORS → routers → region headers". But FastAPI/Starlette `add_middleware` semantics are LIFO: the **last-added** middleware is the **outermost**. So the actual stack from outside-in becomes:

1. `attach_region_headers` (added last via `@app.middleware("http")`)
2. `CORSMiddleware`
3. `MetricsMiddleware`
4. `RequestIdMiddleware` ← INNER, runs nearly last
5. app routing

Result: the `request_id` contextvar is **not yet set** when MetricsMiddleware runs, so any structlog log emitted during metrics processing has no `request_id` — and CORS preflights bypass RequestId entirely. The plan's stated invariant ("every downstream log line / span / response carries the id") is violated.

**Fix:** flip the order — `RequestIdMiddleware` must be the **last** `add_middleware` call (or at least later than CORS and `attach_region_headers`). Easiest path: do the `RequestIdMiddleware` registration in the same flag-on block but AFTER the existing `app.add_middleware(CORSMiddleware, …)` block. Add a unit test that issues a request and asserts the `X-Request-Id` response header is present and unique.

### C6 — `ENABLE_OBSERVABILITY=false` is no longer byte-equivalent to today's behaviour

The plan says heavy imports stay inside the flag-on branch, and the prompt requires byte-identical flag-off. Two breaks:

1. `backend/src/infra/retry.py:34-42` — the new `_resolve_logger()` runs at module-import time, `import structlog` succeeds (it's now in `requirements.txt`), and `logger = structlog.stdlib.get_logger(__name__)` is bound. With `configure_logging()` NOT called (flag off), structlog uses its **default** processors, which produce key=value text rather than the previous `logging.getLogger(__name__).warning("…")` formatting. This is a behaviour change every retry.
2. `backend/src/infra/external_apis/{plaid_client,plaid_bank_gateway,saltedge_client,saltedge_partners_client,finverse_client}.py` — each file does `_tracer = _get_tracer()` at module-load, which executes `from opentelemetry import trace; _trace.get_tracer(...)`. opentelemetry-api now imports on every backend cold start regardless of the flag. The cold-start budget (≤ +200 ms vs baseline) was justified on the basis that none of this happens with the flag off — that justification no longer holds.

These also break the related "External API span wrapping degrades to nullcontext() when the global tracer provider is the no-op default" claim from the prompt: `_get_tracer()` returns a real proxy tracer, never `None`, so the `if _tracer is None: return nullcontext()` branch is dead code in every wrapper. With no provider installed the proxy still produces no-op spans, but that's not what the file-level guard says it does.

**Fix:**
- `retry.py`: revert to `logger = logging.getLogger(__name__)`. Wrap the optional structlog binding inside the calls that actually need trace fields (or get them from `LoggingInstrumentor`'s logging integration when the flag is on). Don't import structlog at module-load.
- External-API wrappers: lazily resolve the tracer **inside** the span helper (`_finverse_span`/`_plaid_span`/etc.), and gate on `os.getenv("ENABLE_OBSERVABILITY", "false").lower() == "true"` before importing `opentelemetry`. Or move all the wrapping into a single helper in `src.infra.observability.tracing` that `init_tracing` swaps in when the flag is on.
- After the fix, run `python -X importtime -c 'import src.main' 2>&1 | grep -iE 'opentelemetry|structlog|prometheus_client'` with the flag off and prove the count is zero.

## Non-critical observations

- **(suggestion) `MetricsMiddleware._route_label`** reads `scope["route"]` to get a templated path. Starlette only populates `scope["route"]` *after* the routing layer matches, but ASGI middlewares run *before* routing. With `MetricsMiddleware` at its current position (around the FastAPI app), `scope["route"]` is None, so the function falls back to `scope["path"]` — which means high-cardinality dynamic segments (`/api/v1/applications/12345`) all become unique label values. Cardinality explosion is what the doc string warns against. Use `request.scope["route"]` only if you can place the middleware INSIDE the FastAPI router (use a `Depends` or hook into FastAPI's exception handler chain), or template paths manually with a regex like `re.sub(r'/\d+', '/{id}', path)` for the known dynamic segments.

- **(suggestion) `/api/rum` has no body-size cap.** `request.json()` will happily parse a 100 MB payload before the zod schema even runs, which is a small DOS surface against the Next.js Node runtime. Add an explicit `Content-Length` check (reject > 16 KB) or a manual stream-and-cap before `request.json()`. Also consider rate-limiting per-IP or per-session — RUM has no auth and the endpoint is public.

- **(question) Prometheus `external_labels.env: ${DEPLOY_ENV:-local}`** in `prometheus/prometheus.yml:14`. Prometheus does not expand shell-style `${VAR:-default}` by default; you'd need `--enable-feature=expand-external-labels` (Prometheus 2.51+) on the command line. As written, the literal string `${DEPLOY_ENV:-local}` ends up on every series — which then makes the `env` template variable in every dashboard pick that string as the only choice. Add the feature flag or replace with a Compose-time substitution (`envsubst < prometheus.yml.tpl > prometheus.yml`).

- **(suggestion) OTel collector `attributes/strip_pii` processor is misconfigured.** `otel-collector-config.yaml:28-32` declares `action: hash` with `from_attribute: http.target`. The contrib attributes processor's `hash` action takes only `key:` — `from_attribute:` is for `insert`. Either the config errors out at collector startup, or it silently no-ops the redaction. Replace with `actions: [{ key: http.target, action: hash }]`.

- **(suggestion) `MYSQL_EXPORTER` grants SELECT on `*.*`.** `platform/database/grant-monitoring-mysql.sql:45` grants `PROCESS, REPLICATION CLIENT, SELECT ON *.*` — this is the canonical mysqld-exporter minimum, but `about.md §Constraints` explicitly calls "no SELECT on app tables" as a privilege concern. Consider scoping `SELECT` to `performance_schema.*, information_schema.*, mysql.*` only — mysqld-exporter v0.15 with the v0.15 collectors needs little more, and the small-grant pattern is what the upstream repo recommends as "least-privilege".

- **(nit)** `platform/observability/grafana/dashboards/02-backend-api.json:121` references `http_exceptions_total` — that metric is not declared anywhere in `metrics.py`. Either add the counter (incremented from a FastAPI exception_handler) or remove the panel.

- **(nit)** `perf-nightly.yml:91-98` — the documented dashboards (`02-frontend-web-vitals`, `03-backend-http`, `05-backend-celery`, etc.) don't match the actual filenames (`01-frontend-rum`, `02-backend-api`, `05-cache-cdn`, `08-business-kpis`). The placeholder text is fine but the names should match what's checked in.

- **(nit)** `frontend/app/layout.tsx` mounts `RumProvider` **before** `Auth0AppProvider`. RumProvider calls `useEffect(() => initRum(), [])`, which calls `import("web-vitals")` — fine, but if RUM ever needs to know the Auth0 user, it'll be calling into a not-yet-initialised provider. Today's reporter doesn't read Auth0 state, so this is just future-proofing.

- **(nit)** `tests/k6/realtime.js:70` checks `r.status === 200 || r.status === 502` for `/api/health`. 502 is "no upstream" which is fine for a smoke run, but during a soak run a 502 should NOT be considered a passing health probe — it's exactly the failure mode the realtime smoke is supposed to surface. Tighten to `200` only when `K6_MODE === 'soak'`.

- **(question) `perf-baseline.yml` k6 step writes to prod with `K6_BEARER` from secrets.** Same C4 concern applies: every manual baseline refresh creates fake applicants. Once C4 is resolved this fix follows automatically.

- **(suggestion)** `docs/observability/README.md` and the runbooks lean heavily on "see `.ai/perf-observability/a/plan.md`". `.ai/` is intentionally agent-state and probably won't survive long-term. Inline the rollback commands and the SLO table directly into the runbook so an on-call doesn't have to dig into agent metadata at 3am.

- **(suggestion)** `_route_label` aside (above), there's no `up{job="lita-frontend"}` because the frontend doesn't expose `/api/metrics`. The Prometheus scrape job (`prometheus.yml:40-45`) targets `host.docker.internal:3000/api/metrics`, which 404s. Either remove the scrape job or land the matching `app/api/metrics/route.ts`. As-is, dashboard `service` template variables that filter by `service=lita-frontend` will never have data.

- **(nit)** `prometheus/rules/backend.yml:53, 87` etc. — the `BackendApplicationsByIdP95Warn` regex `route=~"/api/v1/applications/.+"` will also match `/api/v1/applications/stream` (the SSE endpoint) and any other deeper path under `/api/v1/applications/`. That's likely what you want, but document it or tighten to `/api/v1/applications/[0-9]+`.

## Strengths

- `frontend/next.config.mjs:104` — `withSentryConfig(withBundleAnalyzer(nextConfig), {...})` keeps Sentry as the OUTER wrapper, exactly as the constraint requires. Good.
- Module-load gating in `backend/src/main.py:34-39` is structurally correct — flag check at the top, heavy imports inside the branch. The two leaks in C6 are the fix targets, not a fundamental rewrite.
- All eight Grafana dashboards are valid JSON, schemaVersion 39, and use consistent datasource UIDs (`prometheus`, `tempo`, `loki`).
- `127.0.0.1:` host bindings on every service in `platform/observability/docker-compose.yml`. `/metrics` is not publicly reachable. Good.
- `lita_monitoring` Postgres role: `pg_monitor` only, `CONNECTION LIMIT 5`, separate from app user. Idempotent SQL (`DO $$` blocks). Renaming from `pg_monitoring` to `lita_monitoring` because of the `pg_*` reservation is the right call and is documented inline.
- `scripts/grant-monitoring-db-permissions.sh` is `set -euo pipefail`, never echoes passwords (uses `MYSQL_PWD` env, `--init-command` for the exporter password), and has an idempotent `--revoke` path.
- `scripts/perf/compare-perf.js` is pure-stdlib Node (no `npm install` required), has documented thresholds, and emits `verdict.json` + a Markdown table on the first line of which the post-perf-comment action keys its sentinel.
- `frontend/lib/rum.ts` correctly uses `navigator.sendBeacon` with a fetch fallback, strips URL search and hash for PII, swallows errors so RUM can never throw into the application, and the `process.env.NEXT_PUBLIC_ENABLE_RUM !== "true"` early return is at the top so dead-code-elim removes the body when the static env is false.
- Composite action `index.js` reads `verdict.json`, marks comments with `<!-- perf-observability:perf-pr -->` on the first line, paginates through PR comments to find the marker, and falls back to a synthesised table if `verdict.table` is missing. Solid.
- All five k6 scripts implement `handleSummary` writing both `summary-<n>.json` and `junit-<n>.xml`. The shared `lib/sla.js` and `lib/auth.js` keep the SLA table DRY.

## Risks accepted

- **OTel package pins at `0.50b0`** — not the latest. The plan called this out as a risk; current PyPI is fine; will revisit on the next backend dep bump.
- **k6 `realtime.js` is best-effort polling** — no SSE/WebSocket protocol module in OSS k6. Documented in the README. Acceptable as long as on-call understands they're getting jitter, not real publish-deliver latency.
- **`tracesToMetrics` in datasources.yml** uses `$__tags` macro. Grafana 11.3 supports this; if it ever drops, the trace→metrics jump is degraded but the trace view itself still works. Low risk.
- **`platform/observability/.env.example`** ships with `GF_SECURITY_ADMIN_PASSWORD=admin`. This is dev-only and `127.0.0.1`-bound, but it's the kind of default that gets copy-pasted into prod. Worth a TODO in the runbook to rotate before prod rollout, but not a blocker for the local stack.
- **k6 soak in `perf-nightly.yml` runs against prod** — once C4 is resolved (read-only mode against prod or ephemeral stack), the nightly schedule itself is fine. The current cron `0 8 * * *` correctly avoids the daily-prod-e2e (07:00 UTC) runner contention window.
- **`auto-discover-databases` on postgres-exporter** scans every DB the `lita_monitoring` role can see. With `CONNECTION LIMIT 5` and `pg_monitor` only, blast radius is bounded. Worth keeping.

```
PHASE_RESULT
status: NEEDS_CHANGES
artifacts:
  - .ai/perf-observability/a/review1.md
files_touched: 1
notes: 6 blockers — wrong status label name, RUM never produces metrics, anchor mismatches, k6 writes to prod, inverted middleware order, flag-off no longer byte-equivalent.
```
