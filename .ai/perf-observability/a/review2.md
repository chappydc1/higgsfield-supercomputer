# Code Review — Round 2

## Verdict

APPROVED

All six Round 1 blockers (C1..C6) are fixed cleanly. Each fix was verified against the live source by reading the changed file and cross-checking the consumer (alert rule, dashboard, workflow, importtime probe). No fix was skipped and no new regressions were introduced in the touched files.

## Blockers from Round 1 — verified

### C1 — `status` label name

`backend/src/infra/observability/metrics.py:35-46` now declares `labelnames=("method", "route", "status")` for both `http_requests_total` and `http_request_duration_seconds`. The bucket-string emitter `_status_class()` is unchanged (`"5xx"` / `"4xx"` / etc.), so `status=~"5.."` regex matches the canonical 5xx bucket. The `MetricsMiddleware` increment path (lines 132-139) now writes `.labels(method=..., route=..., status=status_label).inc()`. All five backend error-rate alert queries in `platform/observability/prometheus/rules/backend.yml` (lines 75, 107, 122, 137, 169) now reference the existing label, and the dashboard "Error rate" panel in `platform/observability/grafana/dashboards/02-backend-api.json:87` uses `status=~"5.."`. Verified the only remaining `status_class` mention is the internal classifier helper (which is fine — its name describes what it computes, not what it emits).

### C2 — RUM emits OTLP metrics

`frontend/app/api/rum/route.ts:271-298` now POSTs to both `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics` (with histogram envelopes) and `/v1/traces` (kept for trace-context correlation), running both in `Promise.all` with 2 s timeouts. `METRIC_SPECS` (lines 60-66) maps each web-vital to a histogram metric matching what the rules and dashboard query: `web_vitals_lcp_seconds`, `web_vitals_inp_seconds`, `web_vitals_cls_score`, `web_vitals_fcp_seconds`, `web_vitals_ttfb_seconds`. Bucket boundaries are sensible: `[0.5, 1, 2, 2.5, 4, 6, 10]` for LCP/FCP/TTFB (seconds), `[0.05, 0.1, 0.2, 0.5, 1, 2]` for INP, `[0.05, 0.1, 0.15, 0.25, 0.5]` for CLS. Time-based metrics get `scale: 1/1000` to convert ms→s before bucket placement. The route attribute on every datapoint is `payload.path` so PromQL filters by `route="/applicants"` resolve. Cross-checked against `platform/observability/prometheus/rules/frontend.yml` (lines 13, 30, 47, 64) and `platform/observability/grafana/dashboards/01-frontend-rum.json` — every queried metric name matches an emitted name.

### C3 — Runbook anchors aligned

Used the exact recipe in the prompt:

```
$ grep -hoE 'runbook_url:.*$' platform/observability/prometheus/rules/*.yml \
    | sed 's|.*alert-thresholds.md#||' | sort -u   # 28 used anchors
$ grep -E '^### ' docs/observability/runbooks/alert-thresholds.md \
    | sed 's/### //' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 -]//g; s/ /-/g' | sort -u
                                                    # 31 declared anchors
$ comm -23 used declared
                                                    # empty — every used fragment exists
```

The three declared-but-unused anchors (`blackbox-health`, `blackbox-ready`, `frontend-bundle`) are reserved for future rules and are not regressions. Stub headings added to `docs/observability/runbooks/alert-thresholds.md` (`backend-overall-error`, `postgres-exporter-down`, `mysql-buffer-pool`, `mysqld-exporter-down`, `vm-memory`, `vm-disk`, `otel-queue`, `blackbox-probe-slow`, `blackbox-cert`) all resolve.

### C4 — k6 read-only against prod

`tests/k6/apply-flow.js:30-33` and `tests/k6/auth-token.js:24-27` define `PROD_HOSTS = ['ehousing.joinlita.com', 'joinlita.com']`, `IS_PROD = PROD_HOSTS.some((h) => BACKEND_URL.includes(h))`, `ALLOW_WRITES = (__ENV.K6_ALLOW_WRITES || 'false').toLowerCase() === 'true'`, and `READ_ONLY = IS_PROD && !ALLOW_WRITES`. In `apply-flow.js:80-99` the create-POST is replaced with a `GET /api/v1/applications?limit=20&page=1` when `READ_ONLY`. In `auth-token.js:57-69` the password-grant POST is replaced with `GET /api/health`. All three workflows (`.github/workflows/perf-pr.yml:180`, `perf-nightly.yml:53`, `perf-baseline.yml:149`) export `K6_ALLOW_WRITES=false`. `tests/k6/README.md:40, 66, 69` documents the env var and the production-safety contract.

### C5 — Middleware order LIFO-correct

`backend/src/main.py` now calls `add_middleware` in this order (flag on):

1. line 57 — `MetricsMiddleware`
2. line 103 — `CORSMiddleware`
3. line 127 — `@app.middleware("http")` decorator on `attach_region_headers` (which calls `add_middleware(BaseHTTPMiddleware, ...)` internally)
4. line 145 — `RequestIdMiddleware` (last, inside the second `if OBS_ENABLED:` block)

Starlette LIFO semantics make the runtime outside-in stack: `RequestId → attach_region_headers → CORS → MetricsMiddleware → app routing`. The `request_id` contextvar is therefore set before any other middleware, log line, or span observes the request. Comments at lines 52-56 and 138-144 explicitly document the LIFO invariant and why the second `add_middleware` call appears below the decorator.

### C6 — Flag-off byte-equivalence restored

`backend/src/infra/retry.py:24` is back to a plain `logger = logging.getLogger(__name__)`. No structlog import, no `_resolve_logger()`. Confirmed the entire file (179 lines) contains zero `structlog` references.

Each external API client lazily imports OpenTelemetry inside its span helper. Verified across all five files:

```
backend/src/infra/external_apis/plaid_client.py:55, 70, 74
backend/src/infra/external_apis/plaid_bank_gateway.py:24, 36, 40
backend/src/infra/external_apis/saltedge_client.py:17, 30, 34
backend/src/infra/external_apis/saltedge_partners_client.py:33, 45, 49
backend/src/infra/external_apis/finverse_client.py:8, 20, 24
```

Each declares `_OBS_ENABLED = os.getenv("ENABLE_OBSERVABILITY", "false").strip().lower() == "true"` at module load, the span helper short-circuits to `nullcontext()` when the flag is off, and `from opentelemetry import trace as _trace` happens only inside the helper after the flag check. The dead `_get_tracer()` and module-level `_tracer` bindings are gone.

Importtime probes with the flag off — all clean:

```
$ env -u ENABLE_OBSERVABILITY python3 -X importtime -c \
    "import sys; sys.path.insert(0,'.'); import src.infra.external_apis.plaid_client" \
    2>&1 | grep -iE 'opentelemetry|structlog|prometheus_client'
                                                    # empty
$ env -u ENABLE_OBSERVABILITY python3 -X importtime -c \
    "import sys; sys.path.insert(0,'.'); import src.infra.retry" \
    2>&1 | grep -iE 'opentelemetry|structlog|prometheus_client'
                                                    # empty
$ env -u ENABLE_OBSERVABILITY python3 -X importtime -c \
    "import sys; sys.path.insert(0,'.'); import src.main" \
    2>&1 | grep -iE 'opentelemetry|structlog|prometheus_client'
                                                    # empty
```

Same result for `plaid_bank_gateway`, `saltedge_client`, `saltedge_partners_client`, `finverse_client`. Cold-start cost is back to the pre-Phase-7 baseline when the flag is off.

## New issues introduced in Round 1 fixes

None. The progress log claims of "only the listed files were touched" was confirmed via `git status --short` — the changed files match the 22 listed in `phase-7b-fix-1.progress.md` exactly, no surprise drift.

## Remaining non-critical observations from Round 1

These are NOT blockers; they were carried over from Round 1's "Non-critical observations" section because they are still open after the Round 2 fixes. None affect the verdict.

- `MetricsMiddleware._route_label` reads `scope["route"]`, which is None at the ASGI middleware layer (routing hasn't run yet). Falls back to `scope["path"]`, so dynamic segments (e.g. `/api/v1/applications/12345`) become unique label values — cardinality-explosion risk. Consider templating with a regex for known dynamic segments, or moving the metric increment into a FastAPI dependency / exception-handler chain.
- `/api/rum` has no body-size cap. `request.json()` will parse arbitrary-size payloads before zod runs. Add a `Content-Length` reject (≥ 16 KB) and consider per-IP rate limiting since the endpoint is public.
- Prometheus `external_labels.env: ${DEPLOY_ENV:-local}` in `prometheus.yml:14` requires `--enable-feature=expand-external-labels` (Prometheus 2.51+) on the command line, otherwise the literal string lands on every series.
- OTel collector `attributes/strip_pii` processor uses `action: hash` with `from_attribute:`, which is the wrong key for the `hash` action — should be `actions: [{ key: http.target, action: hash }]`.
- `MYSQL_EXPORTER` grants `SELECT ON *.*` — least-privilege would scope to `performance_schema.*, information_schema.*, mysql.*`.
- `02-backend-api.json:121` references `http_exceptions_total`, which is not declared in `metrics.py`. Add the counter from a FastAPI exception_handler or remove the panel.
- `perf-nightly.yml:91-98` — placeholder dashboard names don't match the checked-in filenames.
- `app/layout.tsx` mounts `RumProvider` before `Auth0AppProvider` — fine today but limits future RUM enrichment with auth state.
- `tests/k6/realtime.js:70` accepts `502` for `/api/health` even in soak mode. Tighten to `200`-only when `K6_MODE === 'soak'`.
- Prometheus scrape job for `lita-frontend` targets `host.docker.internal:3000/api/metrics` — that endpoint doesn't exist, so `up{job="lita-frontend"}` will always be 0. Either remove the job or add `app/api/metrics/route.ts`.
- `BackendApplicationsByIdP95Warn` regex `/api/v1/applications/.+` will also match `/api/v1/applications/stream` and other deeper paths. Likely intended, but worth tightening or documenting.
- Documentation for runbooks still references `.ai/perf-observability/a/plan.md` (agent state). Inline the runbook commands and SLO table directly.

```
PHASE_RESULT
status: APPROVED
artifacts:
  - .ai/perf-observability/a/review2.md
files_touched: 1
notes: All 6 Round 1 blockers (C1..C6) verified fixed; importtime probes confirm flag-off byte-equivalence; only the listed 22 files were touched.
```
