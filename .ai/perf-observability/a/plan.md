# perf-observability — Implementation Plan

Phases: 7
Assessed: yes

## Status

- [x] Phase 4a — Backend telemetry foundation (Python)
- [x] Phase 4b — Frontend RUM + bundle analysis (Next.js / TS)
- [x] Phase 4c — Local observability stack (Docker Compose + dashboards)
- [x] Phase 4d — Database & cache instrumentation (Postgres / MySQL exporters + grants)
- [x] Phase 4e — Load testing (k6 + Playwright perf)
- [x] Phase 4f — CI workflows (perf-pr / perf-nightly / perf-baseline)
- [x] Phase 4g — Documentation, runbooks, AGENTS notes

## Rollout strategy

Land all seven units in a single PR per `about.md §Rollout strategy`. All
runtime code paths ship behind feature flags that default to **off**:
`ENABLE_OBSERVABILITY=false` (backend) and `NEXT_PUBLIC_ENABLE_RUM=false`
(frontend). After merge, the operator brings up
`platform/observability/docker-compose.yml` on the GCE VM
`ehousing-credit-v2` as a sibling stack on its own Docker network (no shared
networks with the live `prod` compose at first), validates with synthetic
probes, then flips `ENABLE_OBSERVABILITY=true` for one day and watches the
existing Sentry baseline. Next day flip `NEXT_PUBLIC_ENABLE_RUM=true` and
watch bundle delta + LCP. The `perf-pr.yml` GitHub check stays advisory for
seven days of green CI before being promoted to a required check in branch
protection. CI runtime delta is bounded by `≤ +30 %` and backend cold-start
delta by `≤ +200 ms` per the budgets below.

## Rollback plan

Each unit is independently reversible without redeploy. In priority order
for an on-call engineer at 3am:

1. **Backend telemetry blast radius:** SSH to `ehousing-credit-v2`, edit
   `/opt/lita/ehousing/.env` (or the env file the prod compose loads), set
   `ENABLE_OBSERVABILITY=false`, then
   `cd /opt/lita/ehousing && docker compose -f platform/deployment/prod/docker-compose.yml restart backend`.
   Backend reverts to today's behaviour. No image rebuild required because
   the flag is read at process start.
2. **Frontend RUM blast radius:** same `.env`, set
   `NEXT_PUBLIC_ENABLE_RUM=false`, then
   `docker compose -f platform/deployment/prod/docker-compose.yml restart frontend`.
   Bundle analyzer remains as a dev-only tool; it does not run at runtime.
3. **Observability sidecar stack:**
   `docker compose -f platform/observability/docker-compose.yml down -v` —
   removes Prometheus / Grafana / Tempo / Loki / OTel collector / exporters
   along with their volumes. The sibling stack is on its own Docker network,
   so this has zero impact on customer traffic.
4. **DB monitoring user:**
   `psql "$DB_URL" -c 'DROP USER pg_monitoring;'` on Cloud SQL Postgres,
   `mysql -e 'DROP USER mysql_exporter@\"%\";'` on the prod MySQL container.
   Re-running `bash scripts/grant-monitoring-db-permissions.sh --revoke`
   does the same idempotently.
5. **CI gate:** if `perf-pr.yml` wedges PRs, disable the required check in
   GitHub branch protection (Settings → Branches → main → uncheck
   `perf-pr / verdict`). The workflow file itself can be reverted with
   `git revert <SHA> -- .github/workflows/perf-pr.yml` and a follow-up PR.
6. **Full revert:** `git revert -m 1 <merge-SHA>` on `main` then redeploy.
   This is the nuclear option; steps 1–5 should be tried first.

## Observability budgets

- Backend cold-start delta: ≤ +200 ms
- CI wall-clock delta: ≤ +30 %
- Frontend bundle delta: ≤ +5 % gzip on largest route
- New /metrics scrape cost: ≤ 20 KB/s per replica

## Phase 4 implementation units

### 4a — Backend telemetry foundation

- **Owner subagent type:** general-purpose (model: opus)
- **Scope:** Add structured JSON logging via `structlog`, a request-ID ASGI
  middleware, OpenTelemetry SDK init with FastAPI / SQLAlchemy / requests /
  logging auto-instrumentation, and a `prometheus_client` `/metrics` ASGI
  mount. All wiring is gated behind a single `ENABLE_OBSERVABILITY=true`
  env var. Existing retry decorator gets trace-aware log fields; outbound
  external-API clients (Plaid, Salt Edge, Salt Edge Partners, Finverse,
  Plaid bank gateway) get a tiny wrapper span with redacted target host as
  an attribute. No behavioural change when the flag is off.
- **Disjoint write set (NEW unless marked existing):**
  - `backend/requirements.txt` *(existing)*
  - `backend/src/main.py` *(existing — middleware order edits + flag-gated init)*
  - `backend/src/infra/retry.py` *(existing — add trace_id field to log records, no behaviour change)*
  - `backend/src/infra/observability/__init__.py` *(NEW)*
  - `backend/src/infra/observability/logging_config.py` *(NEW)*
  - `backend/src/infra/observability/request_id.py` *(NEW)*
  - `backend/src/infra/observability/telemetry.py` *(NEW — OTel SDK init + auto-instrumentors)*
  - `backend/src/infra/observability/metrics.py` *(NEW — prometheus_client ASGI app + RED counters)*
  - `backend/src/infra/observability/exporters.py` *(NEW — OTLP exporter wiring keyed off OTEL_EXPORTER_OTLP_ENDPOINT)*
  - `backend/src/infra/external_apis/plaid_client.py` *(existing — span attribute hooks only; no logic change)*
  - `backend/src/infra/external_apis/saltedge_client.py` *(existing — same)*
  - `backend/src/infra/external_apis/saltedge_partners_client.py` *(existing — same)*
  - `backend/src/infra/external_apis/finverse_client.py` *(existing — same)*
  - `backend/src/infra/external_apis/plaid_bank_gateway.py` *(existing — same)*
- **Reads (no writes):**
  - `backend/src/config/database.py` (engine references for SQLAlchemy instrumentation)
  - `backend/src/api/auth.py`, `backend/src/interface/*.py` (route taxonomy for span attributes)
  - `backend/Dockerfile` (verify python:3.10-slim baseline)
  - `platform/deployment/prod/docker-compose.yml` (backend env block reference)
  - `.ai/perf-observability/a/about.md`, `.ai/perf-observability/a/context.md`
- **Steps:**
  1. Add to `backend/requirements.txt`:
     `opentelemetry-distro[otlp]==0.50b0`,
     `opentelemetry-instrumentation-fastapi==0.50b0`,
     `opentelemetry-instrumentation-sqlalchemy==0.50b0`,
     `opentelemetry-instrumentation-requests==0.50b0`,
     `opentelemetry-instrumentation-logging==0.50b0`,
     `opentelemetry-instrumentation-pymysql==0.50b0`,
     `prometheus-client==0.20.0`,
     `structlog==24.4.0`. Pin to 3.10-compatible versions.
  2. Create `backend/src/infra/observability/logging_config.py`: configure
     `structlog` with JSON renderer, ISO timestamps, log level from
     `LOG_LEVEL` env, processors that pull `trace_id` / `span_id` /
     `request_id` from contextvars, and reroute stdlib logging
     (`uvicorn.error`, `uvicorn.access`, `sqlalchemy.engine`) through
     `structlog.stdlib.ProcessorFormatter`.
  3. Create `backend/src/infra/observability/request_id.py`: ASGI
     middleware that reads `X-Request-Id`, falls back to `uuid.uuid4().hex`,
     binds to `contextvars`, and writes the header back on the response.
  4. Create `backend/src/infra/observability/telemetry.py`: builds a
     `TracerProvider` with `Resource(service.name=lita-backend,
     deployment.environment=$DEPLOY_ENV, service.version=$GIT_SHA)`,
     attaches a `BatchSpanProcessor` from `exporters.py`, calls
     `FastAPIInstrumentor.instrument_app(app)`,
     `SQLAlchemyInstrumentor().instrument(engine=engine, tracer_provider=tp)`
     for each engine, `RequestsInstrumentor().instrument()`,
     `LoggingInstrumentor().instrument(set_logging_format=False)`,
     `PyMySQLInstrumentor().instrument()`. Sets a
     `ParentBased(TraceIdRatioBased(0.1))` sampler with
     `sampler_arg_overrides={"error": 1.0}` via a custom sampler.
  5. Create `backend/src/infra/observability/metrics.py`: build a
     `prometheus_client` `Registry`, declare RED counters / histograms
     (`http_requests_total`, `http_request_duration_seconds`,
     `http_in_flight`), expose `make_asgi_app(registry)` and a small ASGI
     adapter for FastAPI's `/metrics` mount.
  6. Create `backend/src/infra/observability/exporters.py`: returns an
     `OTLPSpanExporter` (HTTP) keyed off `OTEL_EXPORTER_OTLP_ENDPOINT`
     (default `http://otel-collector:4318`); falls back to a no-op exporter
     if the env is missing, so the flag-on / endpoint-missing case logs a
     warning instead of crashing.
  7. Edit `backend/src/main.py`. Two gating sites apply, both keyed off
     `OBS_ENABLED = os.getenv("ENABLE_OBSERVABILITY", "false").lower() == "true"`:
     - **Module-load (top of file):** when `OBS_ENABLED` is true, do
       `from src.infra.observability.logging_config import configure_logging; configure_logging()`.
       When false, skip — leaves stdlib logging untouched. Heavy
       observability packages (`opentelemetry.*`, `prometheus_client`,
       `structlog`) are imported only inside this branch so cold-start
       cost stays at today's baseline when the flag is off.
     - **Post-`app = FastAPI()` block:** keep the existing
       `app = FastAPI()` line where it is (module-level, always
       executed). Immediately after it, when `OBS_ENABLED` is true, run
       in this exact order:
       a. `app.add_middleware(RequestIdMiddleware)` (must precede every
          other middleware).
       b. `app.mount("/metrics", make_metrics_app())` (before any router
          include so it cannot be shadowed by a catch-all and is not
          decorated by `attach_region_headers`).
       c. `from src.infra.observability.telemetry import init_tracing; init_tracing(app, engine, tx_engine)`.
     - The existing `app.add_middleware(CORSMiddleware, ...)`, the
       existing router includes, and the existing
       `@app.middleware("http") attach_region_headers` stay where they
       are today. Effective final order with the flag on is:
       RequestId → /metrics mount → init_tracing → CORS → routers →
       region headers. With the flag off the order is byte-for-byte
       today's order.
  8. Edit `backend/src/infra/retry.py`: replace any `print` / bare `logger.warning` calls with `logger = structlog.get_logger(__name__); logger.warning("retry.attempt", attempt=n, ...)`. Existing retry behaviour MUST be unchanged. No new public API.
  9. Edit `backend/src/infra/external_apis/{plaid_client,saltedge_client,saltedge_partners_client,finverse_client,plaid_bank_gateway}.py`: import a shared `tracer = trace.get_tracer("lita.backend.external")` (resolved lazily to the global provider) and wrap each public network call with `with tracer.start_as_current_span("external.<provider>.<op>") as span: span.set_attribute("peer.service", "<provider>"); span.set_attribute("http.target", "<redacted-path>")`. Behaviour unchanged when tracer provider is the no-op default.
  10. **Do NOT edit `platform/deployment/prod/docker-compose.yml` from this unit.** The env-block additions
      (`ENABLE_OBSERVABILITY`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
      `NEXT_PUBLIC_ENABLE_RUM`) are owned exclusively by 4c (see 4c
      step 17) so the write-set stays disjoint. 4a's flag-off path
      reads the env at runtime — if the env is unset the flag defaults
      to `false`, which is the safe today's-behaviour path, so 4a does
      not require 4c to land first.
  11. Run `cd backend && python -m pip install -r requirements.txt && python -c 'import src.main'` to assert no import-time failures with the flag off.
  12. Run `ENABLE_OBSERVABILITY=true python -c 'import src.main'` to assert flag-on import path is clean.
- **Exit criteria:**
  - All NEW files listed above exist on disk.
  - `cd backend && python -m pyflakes src/infra/observability/ src/main.py` exits 0.
  - `cd backend && python -m pytest tests/ -q -x` passes (no behaviour regression with flag off).
  - `cd backend && ENABLE_OBSERVABILITY=true python -c 'import src.main; print("ok")'` prints `ok` and writes a structured JSON log line.
  - `cd backend && python -m uvicorn src.main:app --port 8001 &` then `curl http://localhost:8001/health` returns `{"status":"ok"}` and `curl http://localhost:8001/metrics` returns Prometheus exposition format with at least `http_requests_total`.
  - `git diff --stat backend/` shows non-empty diff covering the listed paths only.
- **Rollback:**
  - `git revert <unit-4a-SHA>` is sufficient.
  - At runtime: `unset ENABLE_OBSERVABILITY` (or set to `false`) in the VM `.env`, then `docker compose -f platform/deployment/prod/docker-compose.yml restart backend`. The flag-off path is byte-for-byte equivalent to today's behaviour because every new import inside the new `observability/` package is gated.
- **Parallel-safe with:** 4b, 4c, 4e, 4f, 4g
- **Sequential after:** none

### 4b — Frontend RUM + bundle analysis

- **Owner subagent type:** general-purpose (model: opus)
- **Scope:** Install `web-vitals` and `@next/bundle-analyzer`. Add a small
  `frontend/lib/rum.ts` reporter that subscribes to LCP / INP / CLS / FCP /
  TTFB and posts to a new `frontend/app/api/rum/route.ts` route handler
  which forwards via `fetch` to the OTel collector
  (`process.env.OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces`). A new client
  component `frontend/components/rum-provider.tsx` mounts the reporter and
  is registered from `frontend/app/layout.tsx`. All runtime behaviour gates
  on `NEXT_PUBLIC_ENABLE_RUM === "true"`. Wrap `next.config.mjs` with
  bundle analyzer **inside** the existing `withSentryConfig` so Sentry's
  webpack plugin still wraps. Add `analyze` script to `package.json`. Add
  `frontend/.lighthouserc.json` and `frontend/lighthouse-budgets.json` for
  4f to consume.
- **Disjoint write set:**
  - `frontend/package.json` *(existing — add deps + scripts)*
  - `frontend/package-lock.json` *(existing — regenerated)*
  - `frontend/next.config.mjs` *(existing — wrap with bundle analyzer)*
  - `frontend/lib/rum.ts` *(NEW)*
  - `frontend/components/rum-provider.tsx` *(NEW)*
  - `frontend/app/api/rum/route.ts` *(NEW)*
  - `frontend/app/layout.tsx` *(existing — add `<RumProvider/>` inside `<ThemeProvider/>`)*
  - `frontend/.lighthouserc.json` *(NEW)*
  - `frontend/lighthouse-budgets.json` *(NEW)*
  - `frontend/.env.local.example` *(existing — add `NEXT_PUBLIC_ENABLE_RUM`)*
- **Reads (no writes):**
  - `frontend/sentry.server.config.ts`, `frontend/sentry.edge.config.ts`,
    `frontend/instrumentation-client.ts`, `frontend/instrumentation.ts`
  - `frontend/middleware.ts`
  - `frontend/eHousing_Web/tests/` (read-only, for path conventions)
  - `.ai/perf-observability/a/about.md`, `.ai/perf-observability/a/context.md`
- **Steps:**
  1. `cd frontend && npm install --legacy-peer-deps --save web-vitals@4.2.4 && npm install --legacy-peer-deps --save-dev @next/bundle-analyzer@15.0.0`. Pin majors to ones compatible with Next.js `^16.2.0`.
  2. Add to `frontend/package.json` `scripts`: `"analyze": "ANALYZE=true next build"`.
  3. Create `frontend/lib/rum.ts`: exports `initRum()` that calls
     `onLCP, onINP, onCLS, onFCP, onTTFB` from `web-vitals` and posts each
     metric as JSON to `/api/rum` via `navigator.sendBeacon`, falling back
     to `fetch(..., { keepalive: true })`. Gates on
     `process.env.NEXT_PUBLIC_ENABLE_RUM === "true"`. Strips PII (URL search
     params, hash) before sending.
  4. Create `frontend/components/rum-provider.tsx`: a `"use client"`
     component that calls `useEffect(() => { initRum() }, [])` and renders
     `null`. Importable from `app/layout.tsx`.
  5. Create `frontend/app/api/rum/route.ts`: `POST` handler that reads the
     JSON body, validates with a small zod schema (metric name in
     `["LCP","INP","CLS","FCP","TTFB"]`, value finite number, route string),
     and forwards to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` as an OTLP
     log/span payload. Returns `204` on success, `400` on schema fail.
     Logs to stdout only (no Sentry call).
  6. Edit `frontend/app/layout.tsx`: import `RumProvider` and place it
     inside `<ThemeProvider>` wrapper, after `<AmplitudeClient/>`. The file
     stays `force-dynamic`.
  7. Edit `frontend/next.config.mjs`: at the top
     `import bundleAnalyzer from "@next/bundle-analyzer";
     const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });`.
     The default export changes from `withSentryConfig(nextConfig, ...)` to
     `withSentryConfig(withBundleAnalyzer(nextConfig), ...)` — `withSentryConfig`
     stays the OUTER wrapper exactly as `context.md` constraints require.
  8. Add `frontend/.lighthouserc.json` configured for assertions: LCP < 2500
     ms (mobile), CLS < 0.1, TBT < 300 ms, with collect URLs `/`, `/login`,
     `/applicants`, `/dashboard`, `/wiki`. Use the `lighthouse-budgets.json`
     as the budgets file.
  9. Add `frontend/lighthouse-budgets.json` mirroring the per-route gzip
     budgets from `about.md §Performance budgets` (220 KB for `/`, 320 KB
     for `/applicants`, 320 KB for `/dashboard`).
  10. Add `NEXT_PUBLIC_ENABLE_RUM=false` to `frontend/.env.local.example`.
- **Exit criteria:**
  - `web-vitals` and `@next/bundle-analyzer` appear in `frontend/package.json`.
  - `cd frontend && npm install --legacy-peer-deps && npm run build` exits 0.
  - `cd frontend && ANALYZE=true npm run build` produces an analyzer HTML report under `.next/analyze/`.
  - `cd frontend && NEXT_PUBLIC_ENABLE_RUM=false npm run build` succeeds and emits **no** RUM-related code in the client bundle (verified by grepping `.next/static/chunks/*.js` for `web-vitals` ≥ 0 occurrences only inside the gated branch — implementation may rely on a top-level `if` so dead-code-elim removes it; document this in `frontend/lib/rum.ts`).
  - `git diff --stat frontend/` shows the listed paths only.
- **Rollback:**
  - `git revert <unit-4b-SHA>`.
  - At runtime: set `NEXT_PUBLIC_ENABLE_RUM=false` and rebuild. The
    `/api/rum` route is a no-op when no client posts to it; bundle
    analyzer is dev-only and never runs at runtime. `withSentryConfig`
    remains the outer wrapper, so reverting only the analyzer wrap is
    safe.
- **Parallel-safe with:** 4a, 4c, 4d, 4e, 4g
- **Sequential after:** none

### 4c — Local observability stack (Docker Compose + dashboards)

- **Owner subagent type:** general-purpose (model: opus)
- **Scope:** Create the entire `platform/observability/` directory tree:
  Docker Compose for Prometheus / Grafana / Tempo / Loki / OTel collector /
  Promtail / blackbox / cAdvisor / node-exporter, all provisioning files
  (datasources, dashboards), the eight Grafana dashboards, alert rules,
  Prometheus scrape config, blackbox config, and the prod overlay
  `platform/deployment/prod/docker-compose.observability.yml`. Also adds
  the env-block changes in `platform/deployment/prod/docker-compose.yml`
  required by 4a (`ENABLE_OBSERVABILITY`,
  `OTEL_EXPORTER_OTLP_ENDPOINT`).
- **Disjoint write set (NEW unless marked existing):**
  - `platform/observability/docker-compose.yml` *(NEW)*
  - `platform/observability/.env.example` *(NEW)*
  - `platform/observability/up.sh` *(NEW)*
  - `platform/observability/down.sh` *(NEW)*
  - `platform/observability/prometheus/prometheus.yml` *(NEW)*
  - `platform/observability/prometheus/rules/backend.yml` *(NEW)*
  - `platform/observability/prometheus/rules/frontend.yml` *(NEW)*
  - `platform/observability/prometheus/rules/infra.yml` *(NEW)*
  - `platform/observability/prometheus/rules/db.yml` *(NEW)*
  - `platform/observability/prometheus/rules/blackbox.yml` *(NEW)*
  - `platform/observability/tempo/tempo.yaml` *(NEW)*
  - `platform/observability/loki/loki-config.yaml` *(NEW)*
  - `platform/observability/loki/promtail-config.yaml` *(NEW)*
  - `platform/observability/otel-collector/otel-collector-config.yaml` *(NEW)*
  - `platform/observability/grafana/provisioning/datasources/datasources.yml` *(NEW)*
  - `platform/observability/grafana/provisioning/dashboards/dashboards.yml` *(NEW)*
  - `platform/observability/grafana/provisioning/alerting/contact-points.yml` *(NEW)*
  - `platform/observability/grafana/provisioning/alerting/notification-policies.yml` *(NEW)*
  - `platform/observability/grafana/dashboards/01-frontend-rum.json` *(NEW)*
  - `platform/observability/grafana/dashboards/02-backend-api.json` *(NEW)*
  - `platform/observability/grafana/dashboards/03-postgres.json` *(NEW)*
  - `platform/observability/grafana/dashboards/04-mysql.json` *(NEW)*
  - `platform/observability/grafana/dashboards/05-cache-cdn.json` *(NEW)*
  - `platform/observability/grafana/dashboards/06-external-apis.json` *(NEW)*
  - `platform/observability/grafana/dashboards/07-infra.json` *(NEW)*
  - `platform/observability/grafana/dashboards/08-business-kpis.json` *(NEW)*
  - `platform/observability/blackbox/blackbox.yml` *(NEW)*
  - `platform/observability/postgres-exporter/queries.yaml` *(NEW)*
  - `platform/deployment/prod/docker-compose.observability.yml` *(NEW)*
  - `platform/deployment/prod/docker-compose.yml` *(existing — append
    `ENABLE_OBSERVABILITY` and `OTEL_EXPORTER_OTLP_ENDPOINT` env keys to
    the `backend` and `frontend` service env blocks; no other change)*
- **Reads (no writes):**
  - `platform/deployment/prod/Caddyfile` (verify admin :2019 binding plan)
  - `platform/deployment/local/docker-compose.yml`
  - `backend/Dockerfile`, `frontend/Dockerfile`
  - `.ai/perf-observability/a/about.md` (dashboard inventory + SLO table)
- **Steps:**
  1. Scaffold the `platform/observability/` directory.
  2. `docker-compose.yml`: services `prometheus` (`prom/prometheus:v2.55.1`),
     `grafana` (`grafana/grafana:11.3.1`), `tempo` (`grafana/tempo:2.6.1`),
     `loki` (`grafana/loki:3.2.1`), `promtail`
     (`grafana/promtail:3.2.1`), `otel-collector`
     (`otel/opentelemetry-collector-contrib:0.111.0`), `blackbox-exporter`
     (`prom/blackbox-exporter:v0.25.0`), `node-exporter`
     (`prom/node-exporter:v1.8.2`), `cadvisor`
     (`gcr.io/cadvisor/cadvisor:v0.49.1`). Defines its own `obs` Docker
     network. Bind host ports only on `127.0.0.1` (Grafana 3001,
     Prometheus 9090, Tempo 3200, Loki 3100, OTel collector 4318/4317).
  3. `prometheus/prometheus.yml`: scrape jobs `lita-backend`
     (target `host.docker.internal:8000` locally; in prod,
     `backend:8000`), `caddy` (admin :2019), `node-exporter`,
     `cadvisor`, `blackbox` (probe HTTPS targets via `relabel_configs`),
     `lita-frontend` (`/api/metrics` if present, otherwise omit), plus
     **placeholder scrape jobs for `postgres-exporter`,
     `mysqld-exporter`, `redis-exporter`, `clickhouse-exporter`** with
     `static_configs: []` (so 4d's `docker-compose.exporters.yml` can
     bring up the exporters and Prometheus auto-discovers them via
     file-based service discovery in the same job). Each placeholder
     job has the right `job` name and label set so 4d's recording
     rules match without 4d having to edit `prometheus.yml`.
     `external_labels: {cluster: "lita-ehousing", env: "$DEPLOY_ENV"}`.
     Remote write disabled by default (Tempo / Loki receive via OTLP
     collector).
  4. `prometheus/rules/*.yml`: encode the SLO alerts from `about.md §SLOs
     and alerting`. `backend.yml` covers `/health`, `/api/v1/applications`,
     `/api/auth/token`, `/api/applicants` p95 / err thresholds.
     `db.yml` covers Postgres conn util and `pg_stat_statements` top-1
     mean_time. `infra.yml` covers VM CPU < 70 %, container RSS < 700 MB.
     `blackbox.yml` covers HTTPS probe failures.
  5. `tempo/tempo.yaml`: receivers `otlp/grpc` and `otlp/http`, storage
     local on a named volume `tempo-data`. Retention 14 days. Tail
     sampling deferred to OTel collector.
  6. `loki/loki-config.yaml`: filesystem store, retention 14 days,
     ingestion_burst_size 16M.
  7. `loki/promtail-config.yaml`: scrape Docker container stdout via
     `docker_sd_configs`; relabel `container_name` → `service`. Pick up
     backend / frontend / mysql / caddy.
  8. `otel-collector/otel-collector-config.yaml`: receivers
     `otlp{grpc,http}`, processors `batch` + `tail_sampling`
     (`policies: [{name: errors, type: status_code, status_code: {status_codes: [ERROR]}}, {name: random_10pct, type: probabilistic, probabilistic: {sampling_percentage: 10}}]`),
     exporters `prometheusremotewrite` (`endpoint: http://prometheus:9090/api/v1/write`),
     `otlp/tempo` (`endpoint: tempo:4317`, tls: insecure),
     `loki` (`endpoint: http://loki:3100/loki/api/v1/push`).
  9. `grafana/provisioning/datasources/datasources.yml`: Prometheus, Loki,
     Tempo. Set Tempo `tracesToLogsV2` to Loki and `tracesToMetrics` to
     Prometheus, keyed on `trace_id`.
  10. `grafana/provisioning/dashboards/dashboards.yml`: provider that
      auto-loads `/var/lib/grafana/dashboards/*.json`.
  11. `grafana/provisioning/alerting/contact-points.yml` +
      `notification-policies.yml`: Slack contact point pointing at env
      `${PERF_SLACK_WEBHOOK_URL}`, PagerDuty contact point pointing at env
      `${PAGERDUTY_INTEGRATION_KEY}`. Routing tree: severity=warn → Slack;
      severity=critical → PagerDuty.
  12. Eight dashboards under `grafana/dashboards/01..08-*.json`. Each is a
      hand-written Grafana JSON model (schemaVersion 39) with the panels
      enumerated in `about.md §Components → Dashboards`. Use template
      variables `$service`, `$route`, `$env`. Each dashboard declares its
      datasource by UID (`prometheus`, `tempo`, `loki`).
  13. `blackbox/blackbox.yml`: modules `http_2xx`, `http_post_2xx`,
      `tcp_connect`. Probe targets configured in
      `prometheus/prometheus.yml` blackbox job:
      `https://ehousing.joinlita.com/`,
      `https://ehousing.joinlita.com/api/health`,
      `https://ehousing.joinlita.com/api/ready`.
  14. `postgres-exporter/queries.yaml`: include the canonical
      pg_stat_statements + pg_stat_user_tables + pg_locks queries shipped
      with `prometheus-community/postgres_exporter` v0.15+.
  15. `platform/deployment/prod/docker-compose.observability.yml`: a
      sibling overlay that loads from the same
      `platform/observability/docker-compose.yml` but on the prod VM, with
      production-tuned volumes and host-binding rules. **Does not** join
      the prod `internal` Docker network at first; once validated, a
      follow-up adds `caddy_internal` as an external net so blackbox can
      reach the backend `:8000` directly.
  16. `up.sh` / `down.sh`: thin wrappers for
      `docker compose -f platform/observability/docker-compose.yml up -d` /
      `... down -v`. Add `set -euo pipefail` and a `--prod` flag that
      additionally loads `platform/deployment/prod/docker-compose.observability.yml`.
  17. Edit `platform/deployment/prod/docker-compose.yml`: append
      `ENABLE_OBSERVABILITY=${ENABLE_OBSERVABILITY:-false}` and
      `OTEL_EXPORTER_OTLP_ENDPOINT=${OTEL_EXPORTER_OTLP_ENDPOINT:-}` to
      the `backend` `environment:` block and
      `NEXT_PUBLIC_ENABLE_RUM=${NEXT_PUBLIC_ENABLE_RUM:-false}` to the
      `frontend` `environment:` block. **No other changes.**
- **Exit criteria:**
  - `docker compose -f platform/observability/docker-compose.yml config` exits 0.
  - `bash platform/observability/up.sh` brings up all services and `docker compose ps` reports `healthy` (or `running` where no healthcheck) for all 9 services.
  - `curl -s http://127.0.0.1:9090/-/ready` returns `Prometheus Server is Ready.`.
  - `curl -s http://127.0.0.1:3001/api/health` returns `{"database":"ok",...}`.
  - All 8 dashboards visible at `/api/search?type=dash-db` after Grafana boot.
  - `bash platform/observability/down.sh` cleans up volumes and reports zero stranded containers.
  - `git diff --stat platform/` shows non-empty diff in the listed paths only.
- **Rollback:**
  - `bash platform/observability/down.sh` (or
    `docker compose -f platform/observability/docker-compose.yml down -v`)
    removes the entire stack with no impact on the production app —
    confirmed by `docker network ls` showing the `obs` net dropped while
    `prod_internal` and `prod_web` remain.
  - `git revert <unit-4c-SHA>`.
  - The two-line env append in `platform/deployment/prod/docker-compose.yml`
    is reverted by running
    `docker compose -f platform/deployment/prod/docker-compose.yml restart backend frontend`
    after the env file no longer sets the new vars (the defaults are
    `false` / empty, so the prod path stays today's behaviour).
- **Parallel-safe with:** 4a, 4b, 4e, 4f, 4g
- **Sequential after:** none

### 4d — Database & cache instrumentation

- **Owner subagent type:** general-purpose (model: opus)
- **Scope:** Provision a least-privilege Postgres `pg_monitoring` user
  with `pg_monitor` only (separate from the app's `lita-ehousing` user),
  ensure `pg_stat_statements` is loaded, and a least-privilege MySQL
  `mysql_exporter` user with `PROCESS, REPLICATION CLIENT, SELECT` only.
  Wire `postgres_exporter`, `mysqld_exporter`, plus a `redis_exporter`
  and a `clickhouse_exporter` (both kept disabled via Docker Compose
  `profiles: ["future"]` because Redis/ClickHouse are not provisioned).
  Add an `EXPLAIN ANALYZE` helper at `backend/scripts/explain_top_queries.py`
  that reads the top-20 `pg_stat_statements` entries and emits JSON.
- **Disjoint write set (NEW unless marked existing):**
  - `platform/database/grant-monitoring.sql` *(NEW — Postgres)*
  - `platform/database/grant-monitoring-mysql.sql` *(NEW — MySQL)*
  - `scripts/grant-monitoring-db-permissions.sh` *(NEW — applies both)*
  - `backend/scripts/explain_top_queries.py` *(NEW)*
  - `platform/observability/docker-compose.exporters.yml` *(NEW — overlay loaded by 4c's compose; this keeps 4d's write-set strictly disjoint from 4c's `docker-compose.yml`)*
  - `platform/observability/postgres-exporter/.env.example` *(NEW)*
  - `platform/observability/mysqld-exporter/.my.cnf.example` *(NEW)*
  - `platform/observability/redis-exporter/.env.example` *(NEW — disabled profile)*
  - `platform/observability/clickhouse-exporter/.env.example` *(NEW — disabled profile)*
- **Reads (no writes):**
  - `platform/deployment/prod/docker-compose.yml` (mysql service env)
  - `backend/src/config/database.py` (engine URL shape)
  - `platform/observability/docker-compose.yml` (network names from 4c)
  - `platform/observability/prometheus/prometheus.yml` (scrape job names from 4c)
  - `.ai/perf-observability/a/about.md`, `.ai/perf-observability/a/context.md`
- **Steps:**
  1. `platform/database/grant-monitoring.sql`:
     `CREATE USER pg_monitoring WITH ENCRYPTED PASSWORD :'pg_monitoring_password';`
     `GRANT pg_monitor TO pg_monitoring;`
     `ALTER USER pg_monitoring WITH CONNECTION LIMIT 5;`
     `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`
     `ALTER SYSTEM SET track_io_timing = on;`
     `ALTER SYSTEM SET log_min_duration_statement = 500;`
     `SELECT pg_reload_conf();` — wrap each statement in `DO $$ ... $$` so
     re-running is idempotent.
  2. `platform/database/grant-monitoring-mysql.sql`:
     `CREATE USER IF NOT EXISTS 'mysql_exporter'@'%' IDENTIFIED BY :'mysql_exporter_password' WITH MAX_USER_CONNECTIONS 5;`
     `GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'mysql_exporter'@'%';`
     `FLUSH PRIVILEGES;`.
  3. `scripts/grant-monitoring-db-permissions.sh`: applies both SQL files.
     Reads `PG_MONITORING_PASSWORD` and `MYSQL_EXPORTER_PASSWORD` from the
     environment (does not echo them). Supports `--revoke` flag that runs
     `DROP USER pg_monitoring;` / `DROP USER 'mysql_exporter'@'%';` so an
     on-call engineer can yank the credentials in seconds. Bash with
     `set -euo pipefail`.
  4. `backend/scripts/explain_top_queries.py`: reads top-20 by
     `total_exec_time` from `pg_stat_statements`, runs `EXPLAIN
     (ANALYZE, BUFFERS, FORMAT JSON)` on each, writes
     `explain_top_queries_<utc-iso>.json` to stdout (or to a path passed
     via `--out`). Uses the `pg_monitoring` credentials, never the app
     user. Pure-Python, uses `psycopg2-binary` already in
     `requirements.txt`.
  5. `platform/observability/docker-compose.exporters.yml`: services
     `postgres-exporter` (`prometheuscommunity/postgres-exporter:v0.15.0`,
     `DATA_SOURCE_NAME` from `.env`), `mysqld-exporter`
     (`prom/mysqld-exporter:v0.15.1`, `--config.my-cnf=/cfg/.my.cnf`),
     `redis-exporter` (`oliver006/redis_exporter:v1.62.0`,
     `profiles: ["future"]`), `clickhouse-exporter`
     (`f1yegor/clickhouse-exporter:latest`, `profiles: ["future"]`). All
     four join the `obs` network from 4c. Postgres exporter binds only
     on `127.0.0.1:9187`; mysqld exporter binds only on
     `127.0.0.1:9104`. **No host port for redis/clickhouse exporters.**
  6. Update `platform/observability/prometheus/prometheus.yml` — wait,
     this file is in 4c's write-set. Instead, 4d ships
     `platform/observability/prometheus/rules/db-exporters.yml` *(NEW —
     in 4d's write-set)* containing only recording rules; the scrape job
     entries for postgres-exporter, mysqld-exporter, redis-exporter, and
     clickhouse-exporter live in 4c's `prometheus.yml`. **Sequential
     after:** 4d depends on 4c shipping placeholder scrape blocks for
     these jobs (with `enabled: false` style relabel — see 4c step 3).
  7. `.env.example` files for each exporter document the env vars
     required (`POSTGRES_EXPORTER_DATA_SOURCE_NAME`,
     `MYSQL_EXPORTER_PASSWORD`, etc.).
- **Exit criteria:**
  - `psql "$DB_URL_AS_SUPERUSER" -f platform/database/grant-monitoring.sql` exits 0 against a sandbox Postgres 14+.
  - `mysql -u root -p"$ROOT_PW" < platform/database/grant-monitoring-mysql.sql` exits 0 against the prod MySQL 8 image.
  - `bash scripts/grant-monitoring-db-permissions.sh --revoke` then re-run without `--revoke` is idempotent.
  - `docker compose -f platform/observability/docker-compose.yml -f platform/observability/docker-compose.exporters.yml up -d postgres-exporter mysqld-exporter` brings both up `healthy`.
  - `curl -s http://127.0.0.1:9187/metrics | grep pg_up` reports `pg_up 1`.
  - `curl -s http://127.0.0.1:9104/metrics | grep mysql_up` reports `mysql_up 1`.
  - `python backend/scripts/explain_top_queries.py --out /tmp/explain.json` exits 0 and produces valid JSON.
  - `git diff --stat platform/ scripts/ backend/scripts/` shows the listed paths only.
- **Rollback:**
  - `bash scripts/grant-monitoring-db-permissions.sh --revoke` drops both monitoring users in under 10 s.
  - `docker compose -f platform/observability/docker-compose.exporters.yml down` removes exporters; the main stack from 4c is unaffected.
  - `git revert <unit-4d-SHA>` removes all NEW files.
  - The `pg_stat_statements` extension can be left enabled (low-risk, supported by Cloud SQL); to fully revert, run `DROP EXTENSION pg_stat_statements;` and `ALTER SYSTEM RESET track_io_timing; ALTER SYSTEM RESET log_min_duration_statement; SELECT pg_reload_conf();`.
- **Parallel-safe with:** 4a, 4b, 4e, 4f, 4g
- **Sequential after:** **4c** (4c authors `platform/observability/docker-compose.yml` + `prometheus.yml` which 4d's overlay extends). 4d's overlay file references service names defined in 4c's compose. 4d also writes scrape *rules* but NOT the scrape jobs themselves; the jobs live in 4c.

### 4e — Load testing (k6 + Playwright perf)

- **Owner subagent type:** general-purpose (model: opus)
- **Scope:** Author k6 scripts for the four flagship flows
  (`apply-flow`, `dashboard-list`, `applicants-csv`, `auth-token`),
  along with `realtime.js` (websocket / SSE smoke if applicable, else a
  polling smoke), and a shared SLA helper. Add a Playwright perf project
  under `frontend/eHousing_Web/tests/perf/` that measures TTFB and route
  transition timing. Output JUnit + JSON summaries that 4f's CI consumes.
- **Disjoint write set (NEW):**
  - `tests/k6/README.md` *(NEW)*
  - `tests/k6/lib/sla.js` *(NEW)*
  - `tests/k6/lib/auth.js` *(NEW — token helper used by the others)*
  - `tests/k6/auth-token.js` *(NEW)*
  - `tests/k6/apply-flow.js` *(NEW)*
  - `tests/k6/dashboard-list.js` *(NEW)*
  - `tests/k6/applicants-csv.js` *(NEW)*
  - `tests/k6/realtime.js` *(NEW)*
  - `tests/k6/.gitignore` *(NEW — `summary*.json`, `junit*.xml`)*
  - `frontend/eHousing_Web/tests/perf/perf.config.ts` *(NEW)*
  - `frontend/eHousing_Web/tests/perf/route-transition.spec.ts` *(NEW)*
  - `frontend/eHousing_Web/tests/perf/ttfb.spec.ts` *(NEW)*
  - `frontend/eHousing_Web/tests/perf/lcp.spec.ts` *(NEW)*
- **Reads (no writes):**
  - `frontend/playwright.config.ts` (project conventions)
  - `frontend/eHousing_Web/tests/pages/`,
    `frontend/eHousing_Web/tests/testcases/`,
    `frontend/eHousing_Web/tests/testdata/`
  - `scripts/synthetic_load_test.py` (existing baseline thresholds)
  - `.ai/perf-observability/a/about.md`, `.ai/perf-observability/a/context.md`
- **Steps:**
  1. `tests/k6/lib/sla.js`: exports the budget thresholds from `about.md
     §Performance budgets` keyed by route; consumed by every script via
     `import { ROUTE_SLA } from './lib/sla.js'`.
  2. `tests/k6/lib/auth.js`: helper that hits `/api/auth/token` once per
     VU iteration (with a small cache) and returns a Bearer token. Reads
     `K6_TEST_USER` / `K6_TEST_PW` from env.
  3. `tests/k6/auth-token.js`: 10 VUs × 60 s, asserts p95 < 250 ms and
     err < 1 %.
  4. `tests/k6/apply-flow.js`: scenario chain `POST /api/v1/applications` →
     `GET /api/v1/applications/{id}` → `GET /api/v1/applications` → idle.
     5 VUs × 60 s in smoke mode (env `K6_MODE=smoke`); 50 VUs × 5 m in
     soak mode. Asserts SLA per `about.md`.
  5. `tests/k6/dashboard-list.js`: 10 VUs × 60 s, hits `/api/v1/applications` paginated.
  6. `tests/k6/applicants-csv.js`: 2 VUs × 5 iterations on `/api/applicants?format=csv`, asserts p95 < 2.5 s.
  7. `tests/k6/realtime.js`: best-effort SSE/WS smoke; if neither is
     present today, the script polls `/api/health` 1 Hz × 60 s and
     records jitter. Documented as such in `tests/k6/README.md`.
  8. Each k6 script ends with `handleSummary` exporting both
     `summary-<name>.json` and `junit-<name>.xml` so 4f can ingest both.
  9. `tests/k6/README.md` documents `BACKEND_URL`, `K6_TEST_USER`,
     `K6_TEST_PW`, modes, and how to interpret summaries.
  10. `frontend/eHousing_Web/tests/perf/perf.config.ts`: a Playwright
      project config (extends from the root `playwright.config.ts`) that
      adds a `perf` project with no retries, single worker, and a longer
      timeout. Adds `outputDir: 'playwright-perf-results'`.
  11. `frontend/eHousing_Web/tests/perf/route-transition.spec.ts`:
      visits `/`, `/login`, `/applicants`, `/dashboard`, `/wiki`,
      records `performance.timing` deltas via
      `page.evaluate(() => JSON.stringify(performance.toJSON()))`, asserts
      navigation timing < budget.
  12. `frontend/eHousing_Web/tests/perf/ttfb.spec.ts`: uses CDP via
      `page.context().newCDPSession(page)` to record `Network.responseReceived`
      timings; asserts TTFB < 600 ms for `/api/health`.
  13. `frontend/eHousing_Web/tests/perf/lcp.spec.ts`: injects the
      `web-vitals` script directly (not relying on 4b's runtime gate)
      via `page.addInitScript`, captures LCP, asserts route budgets.
- **Exit criteria:**
  - `cd tests/k6 && k6 run --quiet auth-token.js` exits 0 against a local backend (or with documented expected failures when the server isn't up).
  - `cd tests/k6 && K6_MODE=smoke BACKEND_URL=http://localhost:8000 k6 run apply-flow.js` produces `summary-apply-flow.json` and `junit-apply-flow.xml`.
  - `cd frontend && npx playwright test --project=perf` exits 0 (or 1 with documented expected failures if the budgets are too tight on a developer laptop — the README must call this out).
  - `git diff --stat tests/ frontend/eHousing_Web/tests/perf/` shows the listed paths only.
- **Rollback:**
  - `git revert <unit-4e-SHA>`.
  - The new tests are additive — no production code paths reference them.
  - If a k6 script wedges CI in 4f, set `if: false` on the k6 step in
    `.github/workflows/perf-pr.yml` (a 30-second branch-protection-tolerated
    edit) until the k6 script is fixed.
- **Parallel-safe with:** 4a, 4b, 4c, 4d, 4g
- **Sequential after:** none

### 4f — CI workflows (perf-pr / perf-nightly / perf-baseline)

- **Owner subagent type:** general-purpose (model: opus)
- **Scope:** Three new GitHub Actions workflows plus a reusable composite
  action and a Node helper. `perf-pr.yml` runs Lighthouse CI + bundle-size
  + k6 smoke + posts a PR comment with the verdict. `perf-nightly.yml`
  runs the full k6 suite + dashboards screenshot job. `perf-baseline.yml`
  is `workflow_dispatch`-only; it recomputes the baseline JSON stashed
  on a `perf-baselines` branch.
- **Disjoint write set (NEW):**
  - `.github/workflows/perf-pr.yml` *(NEW)*
  - `.github/workflows/perf-nightly.yml` *(NEW)*
  - `.github/workflows/perf-baseline.yml` *(NEW)*
  - `.github/actions/post-perf-comment/action.yml` *(NEW)*
  - `.github/actions/post-perf-comment/index.js` *(NEW)*
  - `scripts/perf/compare-perf.js` *(NEW)*
  - `scripts/perf/extract-bundle-sizes.js` *(NEW)*
  - `scripts/perf/README.md` *(NEW)*
- **Reads (no writes):**
  - `frontend/.lighthouserc.json`, `frontend/lighthouse-budgets.json` *(authored by 4b)*
  - `tests/k6/*.js` *(authored by 4e)*
  - `frontend/eHousing_Web/tests/perf/*.spec.ts` *(authored by 4e)*
  - `.github/workflows/compile.yml`, `.github/workflows/deploy.yml` *(existing — for cache-key reuse)*
  - `.ai/perf-observability/a/about.md`, `.ai/perf-observability/a/context.md`
- **Steps:**
  1. `.github/workflows/perf-pr.yml`: triggered on `pull_request` for
     paths under `frontend/`, `backend/`, `tests/k6/`, and the workflow
     itself. Jobs:
     a. `bundle-size` — `cd frontend && npm ci --legacy-peer-deps && ANALYZE=true npm run build`, then `node ../scripts/perf/extract-bundle-sizes.js .next > bundle.json`.
     b. `lighthouse` — `npx @lhci/cli@0.14 autorun --config=frontend/.lighthouserc.json` against an ephemeral compose stack.
     c. `k6-smoke` — `docker run --rm -i grafana/k6:0.54.0 run -` with `tests/k6/apply-flow.js` in smoke mode against the same ephemeral stack.
     d. `verdict` — depends on the previous three; uses `scripts/perf/compare-perf.js` to compare against the baseline branch and emits a verdict JSON.
     e. `comment` — uses `.github/actions/post-perf-comment` to upsert one PR comment with the consolidated table.
     The workflow is **advisory only for the first 7 days**; the `verdict`
     job uses `continue-on-error: true` initially. After the 7-day soak,
     a follow-up PR removes that flag and the operator marks it required
     in branch protection.
  2. `.github/workflows/perf-nightly.yml`: cron `0 8 * * *` (one hour
     after `daily-prod-e2e.yml` to avoid runner contention). Runs the
     full k6 suite (`apply-flow`, `dashboard-list`, `applicants-csv`,
     `auth-token`, `realtime`) at soak parameters against the prod
     read-only endpoints, captures Grafana dashboard screenshots via
     `grafana/scenes-app/.../grafana-image-renderer` (or fallback
     headless Playwright), and uploads artifacts. Posts a Slack message
     to `#lita-perf-alerts` with the summary.
  3. `.github/workflows/perf-baseline.yml`: `workflow_dispatch` only.
     Runs the same jobs as `perf-pr.yml` against `main`, then commits
     the resulting `bundle-baseline.json` and `lighthouse-baseline.json`
     to the `perf-baselines` orphan branch via a deploy key. Single
     concurrency group `perf-baseline` to prevent races.
  4. `.github/actions/post-perf-comment/action.yml` + `index.js`: a Node
     20 composite action that takes `verdict-path` + `pr-number` inputs,
     reads the verdict JSON, formats a Markdown table (bundle-delta,
     Lighthouse mobile score deltas, k6 p95 deltas, verdict), and uses
     `actions/github-script` semantics (`@actions/github` + `@actions/core`
     bundled into `index.js` via `ncc` checked-in). Upserts the comment
     by matching a hidden HTML marker.
  5. `scripts/perf/compare-perf.js`: pure Node script (no deps beyond
     stdlib) that ingests the current run's `bundle.json` /
     `lighthouse.json` / `k6-summary.json` and the baseline-branch
     equivalents, computes deltas, and writes `verdict.json` with a
     pass/warn/fail per surface. Exit code is always 0 in advisory mode;
     after promotion, it is non-zero on `fail` to fail the workflow.
  6. `scripts/perf/extract-bundle-sizes.js`: reads
     `.next/build-manifest.json` + the gzip-encoded chunk sizes and
     emits a flat JSON `{ "/": 219000, "/applicants": 312000, ... }`.
  7. `scripts/perf/README.md`: documents how to run the comparator
     locally and how to bump baselines.
- **Exit criteria:**
  - `gh workflow list` shows `perf-pr.yml`, `perf-nightly.yml`,
    `perf-baseline.yml` after merge.
  - `act -W .github/workflows/perf-pr.yml -j bundle-size` runs cleanly
    locally (or, where `act` is impractical, a dry-run via
    `gh workflow run perf-pr.yml --ref <branch>` is documented).
  - `node scripts/perf/compare-perf.js --current=fixtures/current.json --baseline=fixtures/baseline.json` exits 0 and writes a valid `verdict.json`.
  - The composite action's `index.js` is a single bundled file (no `node_modules` checked in).
  - `git diff --stat .github/ scripts/perf/` shows the listed paths only.
- **Rollback:**
  - Disable the workflow via the GitHub UI (Settings → Actions →
    Workflows → toggle off) — takes 5 seconds, no PR required.
  - `gh api -X PUT repos/:owner/:repo/branches/main/protection -f ...`
    removes the required check (documented in
    `docs/observability/runbooks/incident-response.md`).
  - `git revert <unit-4f-SHA>` removes the workflow files. The
    `perf-baselines` branch can be deleted via `git push origin --delete perf-baselines`.
- **Parallel-safe with:** 4a, 4c, 4d, 4e, 4g
- **Sequential after:** **4b** (the workflow consumes
  `frontend/.lighthouserc.json` + `frontend/lighthouse-budgets.json` +
  the `analyze` npm script that 4b authors). **4e** (the workflow
  invokes `tests/k6/*.js` and `frontend/eHousing_Web/tests/perf/*.spec.ts`
  authored by 4e).

### 4g — Documentation, runbooks, AGENTS notes

- **Owner subagent type:** general-purpose (model: opus)
- **Scope:** Add `docs/observability/` with a top README and six
  runbooks (incident-response, slo-policy, dashboards, adding-spans,
  alert-thresholds, deploy-mute-window), and update `AGENTS.md` and
  the top-level `README.md` with short pointers. Append an entry to
  `workspace/CHANGELOG.md` (the existing source-of-truth for the
  `changelog.yml` workflow). **Do not** create files under
  `docs/changelog/` — that directory holds the GitHub Pages build
  output (`favicon.ico`, `index.html`); writing a new `.md` there is
  ignored by the changelog workflow and clobbered on the next Pages
  publish.
- **Disjoint write set (NEW unless marked existing):**
  - `docs/observability/README.md` *(NEW)*
  - `docs/observability/runbooks/incident-response.md` *(NEW)*
  - `docs/observability/runbooks/slo-policy.md` *(NEW)*
  - `docs/observability/runbooks/dashboards.md` *(NEW)*
  - `docs/observability/runbooks/adding-spans.md` *(NEW)*
  - `docs/observability/runbooks/alert-thresholds.md` *(NEW)*
  - `docs/observability/runbooks/deploy-mute-window.md` *(NEW — covers the alert-silencing window around `deploy.yml` rollouts; see step 7)*
  - `AGENTS.md` *(existing — append a 5-line "Observability" bullet at the end of the file; AGENTS.md has no "Operational pointers" section, so just append at the bottom)*
  - `README.md` *(existing — extend the existing top-level `## Frontend Observability` section, or add a new `## Observability` section right after it, with a 6-line pointer to `docs/observability/README.md`)*
  - `workspace/CHANGELOG.md` *(existing — append a new entry at the top using the project's existing `## [YYYY-MM-DD] – <title>` format with `**Type:** feature`, `**Areas:** infra, backend, frontend, ops`)*
- **Reads (no writes):**
  - `.ai/perf-observability/a/about.md`, `.ai/perf-observability/a/context.md`
  - The deliverables from 4a–4f (paths only — 4g does not need to read source files because the units publish their interfaces in this plan)
- **Steps:**
  1. `docs/observability/README.md`: top-level orientation. Sections:
     "What this stack delivers" (paraphrase from `about.md` — keep < 150
     words), "How to run locally" (one-liner pointing at
     `platform/observability/up.sh`), "How to add a span" (link to
     `runbooks/adding-spans.md`), "Where alerts go" (table of severity
     → channel), "Rollback" (point at this plan's §Rollback plan).
  2. `runbooks/incident-response.md`: condensed procedure — page receives
     alert → runbook link → on-call's first 5 minutes (acknowledge,
     check Grafana board, check Sentry, decide rollback). Include the
     three-line "kill switch" commands from §Rollback plan.
  3. `runbooks/slo-policy.md`: enumerates the SLOs from `about.md §SLOs
     and alerting`, error-budget burn calculations, freeze-deploy
     thresholds.
  4. `runbooks/dashboards.md`: one paragraph per dashboard
     (01..08-*.json) describing the panels, intended audience, and links
     between dashboards (e.g., trace → log).
  5. `runbooks/adding-spans.md`: copy-paste recipes for FastAPI usecase,
     SQLAlchemy session, Next.js server action, Next.js client
     component. Each recipe is a 6-line code block.
  6. `runbooks/alert-thresholds.md`: tabulates each Prometheus rule
     (file:rule), warn / page thresholds, and the runbook URL stuffed
     into the alert annotation.
  7. `runbooks/deploy-mute-window.md`: documents the alert-mute window
     around `deploy.yml` rollouts. Specifies the silence command
     (`amtool silence add deploy=true --duration=15m --comment="release <SHA>"`),
     the mute label `deploy=true` that Grafana / Alertmanager honours,
     and the deploy workflow change (out-of-scope for this plan, but
     called out here so a follow-up PR adds the silence-create /
     silence-expire calls to `deploy.yml`).
  8. Edit `AGENTS.md`: append at the very end of the file (AGENTS.md
     has no "Operational pointers" section today) a one-line bullet:
     `- Observability: see docs/observability/README.md for runbooks,
     dashboards, and rollback steps.`
  9. Edit top-level `README.md`: extend the existing `## Frontend
     Observability` section (or insert a sibling `## Observability`
     section directly below it) with six lines max linking to
     `docs/observability/README.md`. Do not displace existing content.
  10. Edit `workspace/CHANGELOG.md`: insert a new entry at the top
      (above the most recent `## [YYYY-MM-DD]` block) using the
      project's existing format. `Type: feature`, `Areas: infra,
      backend, frontend, ops`. Body summarises the unit list and
      points readers at `docs/observability/README.md`.
- **Exit criteria:**
  - All NEW markdown files exist under `docs/observability/`.
  - **No** new file under `docs/changelog/` (that directory is the
    Pages build artefact — verifiable with `git status docs/changelog/`
    showing zero new files).
  - `python scripts/generate_changelog_html.py` exits 0 against the
    edited `workspace/CHANGELOG.md` (the changelog generator is the
    source-of-truth parser; if the new entry violates the format the
    script throws).
  - Pragmatic link check: `grep -rE '\]\([^)]+\.md' docs/observability/`
    and verify each target exists (or is an external URL).
  - `git diff --stat docs/observability/ AGENTS.md README.md workspace/CHANGELOG.md` shows the listed paths only.
- **Rollback:**
  - `git revert <unit-4g-SHA>`.
  - Documentation changes are runtime-inert — no production impact at any time.
- **Parallel-safe with:** 4a, 4b, 4c, 4d, 4e, 4f
- **Sequential after:** none

## Sequencing summary (encoded above)

- 4a, 4b, 4c, 4e, 4g: no prerequisites; can run in parallel from t=0.
- 4d: starts after 4c lands `platform/observability/docker-compose.yml` and `prometheus.yml`.
- 4f: starts after 4b (Lighthouse config) and 4e (k6 + Playwright perf
  specs).
- All units land in a single PR per `about.md §Rollout strategy`. The
  parallelism above governs the **Phase 4 subagent spawn order** within
  the PR's authoring; it is not a multi-PR sequence.

## Standard Progress Contract

Heartbeat appended to the **current phase's** progress log under
`.ai/perf-observability/a/logs/phase-<N>.progress.md` after each
section. (Phase 2 wrote `phase-2.progress.md`; Phase 3 wrote
`phase-3.progress.md`; Phase 4 spawn-leader will write
`phase-4.progress.md`; the per-unit subagents append to the same
file.)

## Assessment notes

- (4a step 7) Rewrote the `main.py` init recipe: the original step nested `app = FastAPI()` inside an `ENABLE_OBSERVABILITY` branch, which is wrong because `app` is a module-level binding consumed by `uvicorn` regardless of flag state. Now: heavy imports + `configure_logging()` are gated at module-load; `app` stays unconditional; runtime middleware/mount/init lines are gated post-`app` creation.
- (4a step 10) Removed the comment that 4a "opens a PR comment" with the env-block diff. 4a does not write `platform/deployment/prod/docker-compose.yml`; that file is fully owned by 4c step 17. The flag-off default keeps today's behaviour even without the env-block change, so 4a needs no sequence dependency.
- (4c step 3) Added explicit placeholder scrape jobs for `postgres-exporter`, `mysqld-exporter`, `redis-exporter`, `clickhouse-exporter` to `prometheus.yml`. The original 4d → 4c "Sequential after" arrow referenced these jobs but 4c step 3 didn't list them, so 4d would have hit a missing-target wall.
- (4g write-set) Removed `docs/changelog/perf-observability.md`. That directory is the published Pages artefact (`favicon.ico`, `index.html` only — verified on disk). The `changelog.yml` workflow generates HTML from `workspace/CHANGELOG.md` only, so a new `.md` under `docs/changelog/` would be ignored at best and clobbered at worst. All changelog text now lands in `workspace/CHANGELOG.md` in the existing `## [YYYY-MM-DD]` format.
- (4g step 8) Fixed the AGENTS.md edit recipe — there is no "Operational pointers" section in `AGENTS.md` today (verified). The new bullet now appends at the bottom of the file.
- (4g step 9) Loosened the README edit instructions — `README.md` already has a `## Frontend Observability` section at the bottom, so the new pointer slots next to it instead of being inserted "between an existing pair of sections" (which over-constrained the writer).
- (4g step 7 + write-set) Added a `runbooks/deploy-mute-window.md` to address the phase-3 prompt's "alert mute window for deploys" operational gap.
- (Heartbeat path) Fixed the trailing reference to `phase-2.progress.md` so each phase writes to its own log file.
- (Risk left in place — package version pin) `opentelemetry-distro[otlp]==0.50b0` and the matching instrumentation packages are pinned to `0.50b0`. The current OTel Python release is `1.30.x` SDK / `0.51b0`+ instrumentation (verifiable on PyPI). `0.50b0` exists on PyPI and is Python 3.10-compatible, so I left the pins as-is — but called out here as a "consider bumping at implementation time" risk; the implementer should re-check against PyPI's latest at the moment of `pip install`.
- (Risk left in place — `opentelemetry-instrumentation-pg8000`) The plan's external-dep list omits `opentelemetry-instrumentation-pg8000` (only `-pymysql` is listed). SQLAlchemyInstrumentor wraps both engines through the DBAPI so the omission is *acceptable* for span coverage; flagged here as something to revisit only if pg8000-specific spans turn out to be needed.
- (Risk left in place — perf-pr.yml ephemeral compose) 4f step 1 mentions an "ephemeral compose stack" for Lighthouse / k6 to hit, but does not pin `which` compose file or how the backend gets a working DB. The existing `validate.sh` doesn't bring up compose, and `platform/deployment/local/docker-compose.yml` still requires Cloud SQL credentials. I did not add a new compose file; the implementer of 4f must either (a) author a `platform/deployment/perf-ci/docker-compose.yml` with a sqlite or in-VM mysql backend, or (b) point Lighthouse / k6 at the production read-only endpoints with a tight VU budget. Calling out as a known gap for the 4f implementer.
- (Risk left in place — Cloud SQL public-IP exposure) Postgres exporter in 4d binds only on `127.0.0.1:9187` and uses a separate `pg_monitoring` user with `pg_monitor` only and `CONNECTION LIMIT 5`. Constraint-compliant per `context.md §Constraints`. Left unchanged.
- (Risk left in place — bundle-size budgets in `lighthouse-budgets.json`) The budgets in 4b step 9 mirror `about.md §Performance budgets`. Numbers are aggressive vs typical Next.js 16 builds; CI will likely red-flag them on day one. The 7-day advisory window in 4f handles this. Left unchanged.
