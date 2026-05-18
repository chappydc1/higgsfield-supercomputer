# perf-observability

## What this system delivers

A Lita eHousing engineer joining at 9:00 sees green Grafana dashboards for the
last 24h, opens the "Backend API" board and immediately knows which endpoint
is slowest, which Cloud SQL query is dominating wall-time, what the p95
front-end Largest Contentful Paint was for `/applicants` overnight, and how
the synthetic Playwright "Apply" flow trended last release. PRs that touch
hot paths get an automated comment with bundle size delta, Lighthouse scores,
and a k6 latency-regression verdict before review. Sentry continues to capture
errors and replays exactly as before, but the team now has a separate signal
plane for *performance*: distributed traces from browser → Caddy → FastAPI →
Cloud SQL Postgres / MySQL, plus structured JSON logs and RED + USE metrics
for every container. Pagers fire on SLO burn (per-endpoint latency p95, error
rate, saturation), not on raw thresholds. Every artefact (dashboard JSON, k6
script, Lighthouse budget, exporter compose) lives in this repo so a cold
re-deploy reproduces the entire observability plane.

## Architecture

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                       Browser                            │
                 │ Sentry Browser SDK · @vercel/otel · web-vitals reporter  │
                 └──────────────┬─────────────────────┬─────────────────────┘
                                │ traces+RUM (OTLP)   │ errors (Sentry DSN)
                                ▼                     ▼
                 ┌──────────────────────────┐  ┌───────────────────────┐
                 │  Caddy (ingress, TLS)    │  │   sentry.io ingest    │
                 │  /metrics scrape target  │  └───────────────────────┘
                 └─────────┬──────┬─────────┘
            HTTP /api/*    │      │ HTTP /
                           ▼      ▼
   ┌────────────────────────────────────┐    ┌──────────────────────────────┐
   │  FastAPI backend (uvicorn)         │    │  Next.js frontend (node)     │
   │  OTel SDK · FastAPIInstrumentor    │    │  registerOTel + Sentry SDK   │
   │  SQLAlchemyInstrumentor            │    │  prom-client /api/metrics    │
   │  RequestsInstrumentor              │    │  web-vitals → /api/rum        │
   │  prometheus-client /metrics        │    └──────────────┬───────────────┘
   └──────────┬──────────┬──────────────┘                   │
              │          │                                  │
       traces │  metrics │ db calls                         │
              │          │                                  │
              ▼          ▼                                  ▼
      ┌───────────────────────────────────────────────────────────────┐
      │             OpenTelemetry Collector (sidecar)                 │
      │  receivers: otlp/grpc, otlp/http, prometheus_scrape           │
      │  processors: batch, attributes, k8sattributes (n/a → vm),     │
      │              resourcedetection (gce), tail_sampling           │
      │  exporters: prometheusremotewrite, loki, otlp/tempo, sentry   │
      └────────┬────────────────┬────────────────┬─────────┬──────────┘
               │ metrics        │ logs           │ traces  │ errors
               ▼                ▼                ▼         ▼
        ┌────────────┐    ┌─────────┐     ┌─────────┐  ┌──────────┐
        │ Prometheus │    │  Loki   │     │  Tempo  │  │ sentry.io│
        └─────┬──────┘    └────┬────┘     └────┬────┘  └──────────┘
              │                │               │
              └────────────────┴───────┬───────┘
                                       ▼
                              ┌──────────────────┐
                              │     Grafana      │
                              │  8 dashboards    │
                              │  + alert rules   │
                              └────────┬─────────┘
                                       │ webhooks
                                       ▼
                          Slack #lita-perf-alerts / PagerDuty

   Sidecar exporters scraped by Prometheus:
     - postgres_exporter  → Cloud SQL Postgres (lita-ehousing instance)
     - mysqld_exporter    → Cloud SQL MySQL  (lita-mysql instance)
     - cAdvisor / node_exporter on the GCE VM
     - blackbox_exporter  → synthetic HTTPS probes (ehousing.joinlita.com)
     - process_exporter   → uvicorn / next-server CPU & memory
```

## Components

- **Frontend instrumentation**
  - `web-vitals` package emits LCP, INP, CLS, FCP, TTFB; reporter posts to
    `/api/rum` which forwards to the OTel collector via OTLP/HTTP.
  - Sentry Browser SDK retains `tracesSampleRate=0.1` (parameterised),
    `replaysOnErrorSampleRate=1`, `replaysSessionSampleRate=0`. Router
    transition spans named after pathname.
  - `@vercel/otel` `registerOTel({serviceName: "lita-frontend"})` exports
    server-side spans for App Router route handlers.
  - `@next/bundle-analyzer` runs in CI on every PR, outputs HTML report and
    a JSON delta posted as a PR comment.
  - Route-level timings captured via `performance.measure()` in
    `instrumentation-client.ts` and reported as custom metrics.
- **Backend instrumentation**
  - `opentelemetry-distro[otlp]` plus `opentelemetry-instrumentation-fastapi`,
    `-sqlalchemy`, `-requests`, `-logging`, `-pymysql`, `-pg8000`.
  - Auto-instrumented in `backend/src/main.py` after `app = FastAPI()` and
    before `app.add_middleware(CORSMiddleware,...)`.
  - `prometheus-client` exposes `/metrics` registered as the *first* router
    so it is unauthenticated and never matches the catch-all 500 handler.
  - `structlog` replaces stdlib formatting for backend logs; every log line
    carries `trace_id`, `span_id`, `request_id`, `route`, `status_code`.
  - A `RequestIdMiddleware` reads `X-Request-Id` (or generates a UUID) and
    propagates it in the response and in every log/span.
- **Postgres**
  - `pg_stat_statements` extension enabled on the `lita-ehousing` Cloud SQL
    Postgres instance. `track_io_timing=on`, `log_min_duration_statement=500`.
  - `postgres_exporter` runs as a `monitoring` Cloud SQL user with
    `pg_monitor` role only (separate from app's `lita-ehousing` user, so the
    app pool is unaffected).
  - A nightly `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` job over the top-20
    queries by total time uploads results to GCS for diff review.
- **MySQL**
  - Performance schema enabled on `lita-mysql` instance. `mysqld_exporter`
    runs with `PROCESS, REPLICATION CLIENT, SELECT` only; separate user.
  - Slow-query log shipped to Loki via Promtail.
- **ClickHouse / Redis**
  - **Not deployed today and not introduced by this work.** The system has no
    ClickHouse or Redis dependency. If/when added, plug-in points are
    documented in `context.md` so dashboards extend cleanly.
- **Load testing**
  - `tests/k6/` directory holds `apply-flow.js`, `dashboard-list.js`,
    `applicants-csv.js`, `auth-token.js`. `tests/k6/lib/sla.js` defines the
    p95 / error-rate thresholds. Each script outputs a summary JSON consumed
    by the regression gate.
  - Playwright perf flows under `frontend/eHousing_Web/tests/perf/` capture
    Largest Contentful Paint, Total Blocking Time, and CDP coverage on the
    seven highest-traffic routes.
- **CI**
  - `.github/workflows/perf-pr.yml` runs on every PR: bundle-analyzer,
    Lighthouse CI on `/`, `/login`, `/applicants`, `/dashboard`, `/wiki`,
    k6 smoke (5 VUs × 60s) against an ephemeral compose stack, posts a
    consolidated PR comment with deltas vs main.
  - `.github/workflows/perf-nightly.yml` runs full k6 + Lighthouse against
    production read-only endpoints, ships results to Grafana.
  - `bundle-size-guard.yml` blocks PRs that grow the JS payload of any of
    the budgeted routes by more than the documented threshold.
- **Local stack**
  - `platform/observability/docker-compose.yml` brings up Prometheus, Grafana
    (with provisioned dashboards), Tempo, Loki, OTel collector, Promtail,
    `postgres_exporter`, `mysqld_exporter`, `node_exporter`, `cadvisor`,
    `blackbox_exporter`. A single `make obs.up` (or `bash
    platform/observability/up.sh`) starts everything; `make obs.down` tears
    it down. The stack auto-detects `OTEL_EXPORTER_OTLP_ENDPOINT` and points
    backend + frontend at the local collector.
- **Dashboards** (8 Grafana JSON files under `platform/observability/grafana/dashboards/`)
  1. `01-frontend-rum.json` — Web Vitals per route (LCP/INP/CLS p75/p95),
     route-transition duration, JS error rate, Sentry issue counts.
  2. `02-backend-api.json` — RED metrics per FastAPI route, p50/p95/p99,
     in-flight requests, exception rate, top-10 slow routes.
  3. `03-postgres.json` — pg_stat_statements top queries, lock waits,
     connection pool utilisation, replication lag, IO timings.
  4. `04-mysql.json` — slow-query rate, InnoDB buffer pool ratio, threads,
     replica lag.
  5. `05-cache-cdn.json` — Caddy cache hit ratio, response status mix,
     upstream latency split by upstream (frontend vs backend).
  6. `06-external-apis.json` — Plaid / Salt Edge / Finverse / Auth0 /
     Resend / Vertex AI client latency and error rate.
  7. `07-infra.json` — VM CPU / memory / disk / network from
     `node_exporter`, container-level from cAdvisor, OOMs.
  8. `08-business-kpis.json` — applications submitted, applicants created,
     credit-score decisions, OTP send/verify success rate, AML hits.
- **Alerting** — Grafana alert rules in
  `platform/observability/grafana/alerts/` (provisioned), routed to
  `#lita-perf-alerts` Slack webhook for warnings, PagerDuty for SEV1.

## Performance budgets

| Surface                                  | Metric                          | Budget       |
|------------------------------------------|---------------------------------|--------------|
| Front-end LCP — `/applicants`            | p75                             | < 2.5 s      |
| Front-end LCP — `/applicants`            | p95                             | < 4.0 s      |
| Front-end INP — all primary routes       | p75                             | < 200 ms     |
| Front-end CLS — all primary routes       | p75                             | < 0.10       |
| Bundle JS — `/`                          | gzip transfer                   | ≤ 220 KB     |
| Bundle JS — `/applicants`                | gzip transfer                   | ≤ 320 KB     |
| Bundle JS — `/dashboard`                 | gzip transfer                   | ≤ 320 KB     |
| Backend `/health`                        | p99                             | < 50 ms      |
| Backend `/api/v1/applications` GET       | p95                             | < 400 ms     |
| Backend `/api/v1/applications` GET       | p99                             | < 900 ms     |
| Backend `/api/v1/applications` POST      | p95                             | < 800 ms     |
| Backend `/api/v1/applications/{id}`      | p95                             | < 350 ms     |
| Backend `/api/applicants` (CSV export)   | p95                             | < 2.5 s      |
| Backend `/api/auth/token`                | p95                             | < 250 ms     |
| Backend any endpoint                     | error-rate (5xx)                | < 0.5 %      |
| Cloud SQL Postgres                       | active connections              | < 60 % cap   |
| Cloud SQL MySQL                          | active connections              | < 60 % cap   |
| GCE VM `ehousing-credit-v2`              | sustained 5-min CPU             | < 70 %       |
| Backend container                        | RSS                             | < 700 MB     |
| Frontend container                       | RSS                             | < 800 MB     |
| Cold-start regression                    | startup +Δ vs baseline          | < 200 ms     |
| CI runtime regression                    | full pipeline +Δ vs baseline    | < 30 %       |

## How a developer uses this day-to-day

1. **Investigating a perf regression.** Open Grafana → `02-backend-api.json`,
   pick the 24-hour window, click the `p95` row that turned red. Grafana
   panel link drills into Tempo with the matching `service.name=lita-backend`
   and `http.target` filter. Pick a slow trace, jump from the Tempo span
   into the Loki log line via shared `trace_id`. If the slow span is a SQL
   query, click through to `03-postgres.json` for `pg_stat_statements`
   ranking; the query text is already redacted.
2. **Reading a PR perf comment.** The bot posts under "Perf Review":
   bundle delta per route, Lighthouse mobile score deltas, k6 p95 deltas,
   plus a verdict (✅ within budget / ⚠️ regression). Click a delta to
   open the artifact tab on the GH Actions run with the full HTML reports.
3. **Running k6 locally.** `cd tests/k6 && BACKEND_URL=http://localhost:8000
   k6 run apply-flow.js` — the script stops with non-zero exit if the SLA
   defined in `tests/k6/lib/sla.js` is breached, identical to the CI gate.
4. **Adding a traced span to a new code path.** In FastAPI, decorate the
   usecase with `@tracer.start_as_current_span("usecase.<name>")` (the
   `tracer` is from `src.infra.tracing`). In Next.js server actions, wrap
   the body with `await otel.tracer.startActiveSpan(...)` from
   `frontend/lib/tracing.ts`. Both places already log + propagate
   `trace_id`.
5. **Verifying a deploy didn't degrade anything.** The deploy workflow
   posts a Slack message including the post-deploy 15-minute SLO
   delta. The same data is one click away on the
   `02-backend-api.json` "Deploys" annotation track.

## SLOs and alerting

| Tier | Surface                          | SLO                     | Alert (warn)              | Alert (page)             |
|------|----------------------------------|-------------------------|---------------------------|--------------------------|
| T1   | `ehousing.joinlita.com` (HTTPS)  | 99.9 % availability     | Blackbox 1× failure / 5 m | Blackbox 3× failure /5 m |
| T1   | Backend `/health`                | 99.95 %, p99 < 50 ms    | p99 > 100 ms 5 m          | down 1 m                 |
| T1   | Backend `/api/v1/applications`   | p95 < 400 ms, err < 0.5%| p95 > 600 ms 10 m         | p95 > 1 s 5 m / err > 2 %|
| T2   | Backend `/api/v1/applications/*` | p95 < 800 ms            | p95 > 1.2 s 15 m          | err > 5 % 10 m           |
| T2   | `/api/auth/token`                | p95 < 250 ms, err < 1 % | err > 2 % 10 m            | err > 5 % 5 m            |
| T2   | Cloud SQL Postgres               | conn util < 60 %        | > 70 % 10 m               | > 90 % 5 m / replica lag |
| T2   | Cloud SQL MySQL                  | conn util < 60 %        | > 70 % 10 m               | > 90 % 5 m               |
| T3   | External APIs (Plaid, Salt Edge) | err < 5 %, p95 < 3 s    | err > 10 % 15 m           | err > 30 % 10 m          |
| T3   | Front-end LCP p75 (`/applicants`)| < 2.5 s                 | > 3.5 s 30 m              | > 5 s 30 m               |
| T3   | Bundle size                      | within budget           | PR-time only              | n/a                      |

Routing: warnings → `#lita-perf-alerts` (Slack webhook env
`PERF_SLACK_WEBHOOK_URL`); pages → PagerDuty service `lita-ehousing` via the
PagerDuty Grafana contact point. Alerts include a runbook link to the
relevant section of `docs/Deployment+Operations+and+Observability/`.
