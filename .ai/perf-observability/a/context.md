# perf-observability — Codebase Context

> All paths in this document are absolute roots starting from the repo root
> `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/frosty-tereshkova-3dee01/`.
> Relative paths below are written without the prefix; every one was verified to exist.

## Repo layout (verified)

```
AGENTS.md                                   ← agent operating rules (canonical)
CLAUDE.md                                   ← pointer to AGENTS.md
README.md                                   ← top-level project blurb
REVIEW.md                                   ← review style guide
validate.sh                                 ← bash validation entry (backend pytest + frontend test/build + docker build)
validate.ps1                                ← Windows equivalent (referenced from AGENTS.md, not read in phase 1)
.env_template                               ← keys for top-level .env
.github/
  workflows/
    auto-assign.yml                         ← assigns reviewers
    cache-clearing-workflow.yaml            ← weekly GH Actions cache wipe (Fri 16:00 UTC)
    changelog.yml                           ← publish changelog HTML to gh-pages
    check-secrets.yml                       ← validates 51 repo secrets (manual dispatch)
    compile.yml                             ← "Lita" workflow: backend pytest + frontend npm test + label
    daily-prod-e2e.yml                      ← cron 07:00 UTC, runs *-prod-tests.spec.ts on prod, posts Slack + Allure
    delete-failed-runs.yml                  ← cron 03:00 UTC daily, deletes failed/cancelled runs
    delete-stale-branches.yml               ← cleanup
    deploy.yml                              ← test → build-push (GAR) → SSH-deploy to GCE VM → verify+Slack
    label-on-review.yml                     ← reactive PR review labels
    pr.yml                                  ← Slack PR notifier
    pull-requests-workflow.yaml             ← (further PR helpers)
    qa-index.yml                            ← QA index page deploy on Pages after daily-prod-e2e
    sync-lita-tasks.yml                     ← cron 07:50 UTC, regenerate lita_task_sheet_snapshot.md
  CODEOWNERS, ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATES/, pull_request_template.md
backend/
  Dockerfile                                ← python:3.10-slim → uvicorn :8000
  cloudbuild.yaml                           ← legacy Cloud Run path (NOT active; deploy goes via SSH+compose)
  README.md, MIGRATION_PLAN.md, CREDIT_SCORE_PIPELINE_GUIDE.md
  conftest.py
  requirements.txt                          ← FastAPI ≥0.115, uvicorn[standard] ≥0.23, sqlalchemy ≥2.0.36, plaid 39, pydantic ≥2, pymysql 1.1, psycopg2-binary 2.9.9, pg8000, cloud-sql-python-connector[pg8000] 1.7.0, google-cloud-storage 2.16, gcsfs, exa-py, pandas, scikit-learn, joblib, numpy, pytest 7.4.4, httpx 0.27
  run_migration.py
  contracts/, data/, static/, scripts/{build_open_banking_csvs.py, sweep_bank_data_snapshots.py}
  migrations/                               ← 12 numbered SQL files (000..012) + postgres/ subdir
  tests/                                    ← pytest layout (interface/, infra/, usecase/, domain/, ml/, services/)
  test_plaid_*.py                           ← top-level integration smokes (5 files)
  src/
    __init__.py
    main.py                                 ← FastAPI app, CORS, region middleware, /health, exception handlers
    api/__init__.py
    api/auth.py                             ← AuthError, JWT helpers
    api/endpoints/                          ← (api-side endpoint helpers)
    config/__init__.py
    config/database.py                      ← engine + tx_engine factories (Cloud SQL connector for prod)
    domain/                                 ← pure entities/value objects
    usecase/                                 ← use-case orchestrators (housing_application, credit_scoring, kyc, …)
    interface/
      __init__.py
      application_events.py
      auth_endpoints.py                     ← 3 routes
      bank_endpoints.py                     ← (currently not registered in main.py)
      billing_endpoints.py                  ← 7 routes
      customer_auth.py
      http_endpoints.py                     ← 51 routes (largest module, 4714 LOC)
      lita_endpoints.py                     ← 6 routes
      open_banking_endpoints.py             ← 11 routes (incl. /health, /health/{provider})
      saltedge_endpoints.py                 ← 12 routes
      schemas.py, schemas/
      transunion_batch_endpoints.py         ← 1 route
      webhook_endpoints.py                  ← 2 routes
    infra/
      external_apis/                        ← finverse_client, plaid_client (+ products/webhook_verifier), saltedge_client (+ partners + signing)
      importers/
      mysql/                                ← SQLAlchemy models + repositories (Base on engine)
        database.py, models.py, schema.py, *_repository.py (8 repos)
      postgres/                             ← TxBase + canonical-data repos (housing_application_repository, canonical_repository, …)
      postgresql/                           ← scoring_result_repository (separate engine wrapper)
      region.py                             ← country/locale resolution from request
      retry.py                              ← @with_retry decorator + RetryConfig (logging-only, no metrics)
    services/                               ← billing_service, customer_service, normalization_service, ingestion_service, scoring_job_queue_service, provider_health_service, etc. (13 files)
    ml/                                     ← model loading utilities
    models/                                 ← (cross-package model classes)
    scripts/                                ← admin scripts (in-source)
    credit-score-pipeline/                  ← dir name with hyphen; pipeline entry-points
frontend/
  Dockerfile                                ← multi-stage node:20-alpine builder + runner :3000
  Dockerfile.local                          ← single-stage `npm run dev`
  package.json                              ← see "Frontend stack today"
  package-lock.json
  next.config.mjs                           ← Sentry-wrapped; cacheComponents=false; turbopack root; webpackBuildWorker; redirect /sentry-example-page → /
  middleware.ts                             ← Auth0 redirect + region/locale headers; matcher excludes _next/static, _next/image, favicon.ico
  instrumentation.ts                        ← `registerOTel({serviceName})`, then loads sentry.server / sentry.edge
  instrumentation-client.ts                 ← Sentry browser init, replays, beforeSend filter, captureRouterTransitionStart
  sentry.server.config.ts                   ← tracesSampleRate=1, enableLogs=true, sendDefaultPii=true, hardcoded DSN
  sentry.edge.config.ts                     ← tracesSampleRate=1, enableLogs=true, hardcoded DSN
  jest.config.js                            ← next/jest, testEnvironment=node, ignores e2e/eHousing_*
  jest.setup.js
  playwright.config.ts                      ← 5 projects (Chrome/Firefox/Safari/Mobile Chrome/Mobile Safari), allure + junit + json + html reporters, baseURL from env, retries=3 in CI, 5 workers locally
  tailwind.config.js                        ← darkMode:class, scans pages/components/app/src
  postcss.config.mjs
  tsconfig.json
  eslint.config.mjs
  components.json                           ← shadcn config
  nginx.conf                                ← (legacy)
  test-results.xml                          ← committed (latest run output)
  styles/, hooks/, public/, worker/, countries-list/
  scripts/generate-allure-report.sh
  app/                                      ← App Router; see "Routes inventory"
  components/, lib/, eHousing_Common/, eHousing_Web/
  .env.local.example                        ← Auth0, Sentry (DSN, sample rates, ORG, PROJECT, AUTH_TOKEN), Amplitude, OTEL_*
platform/
  database/{1_create_database.sql, 2_add_otp_verifications.sql, apply_schema.sh, migrations/}
  deployment/
    local/{Caddyfile, docker-compose.yml}    ← dev: caddy + frontend(Dockerfile.local) + backend(Dockerfile)
    prod/{Caddyfile, docker-compose.yml, post-deploy-cleanup.sh, initdb/}
                                             ← prod compose has caddy + frontend + backend + mysql; backend health check via http://localhost:8000/health
  housing-label-service/                    ← (separate sidecar service stub)
services/
  consent-service/                          ← Node TS service (jest)
  scoring-orchestrator/                     ← Node TS service
  token-service/                            ← Go service
  us-data-gateway/                          ← Go service
  us-api/                                   ← TS Fastify + Prisma microservice (separate prod surface)
    Dockerfile, Dockerfile.local, docker-compose.yml, jest.config.cjs, prisma/, migrations/, postman/, secrets/
scripts/                                    ← 36 helper scripts; key perf ones:
  synthetic_load_test.py                    ← thread-pool fan-out over /openapi.json saltedge|plaid GETs; envs LOAD_TEST_CONCURRENCY (6) / REQUESTS_PER_ROUTE (12) / TIMEOUT (6 s); fails on non-allowlisted status
  check_service_cpu_anomalies.py            ← reads scripts/service_cpu_baselines.json, ps-snapshot, alerts when CPU ≥ baseline (warn at 80 %)
  service_cpu_baselines.json                ← uvicorn 40, us-api/scoring-orchestrator/housing-label-service 35
  ensure_cloud_db_schema.sh                 ← bootstrap Cloud SQL schema via proxy/SSH/TCP; loads .env
  prelaunch_deployment_health_check.sh, prelaunch_frontend_smoke_test.sh
  monitor_cpu_and_retries.sh, test_cpu_and_retry_prevention.py
  generate_changelog_html.py
  applicants-{dev,local,prod,prod-seed}.{sh,ps1}
  lita_smoke_test.sh, us-api-smoke-test.sh, us-api-prisma-migrate-deploy.sh
  upload_env_to_github_secrets.sh
  push_dashboard_test_account.py
  sync_lita_tasks.py                        ← regenerates lita_task_sheet_snapshot.md
  validate_frontend_backend_contract.py
  test_application_workflow_with_ocr.sh
  generate_partner_api_key.sh, create_auth0_user.sh, create_customer.py
  canary_deployment.sh, kill-all-java.sh
  logs-local-{backend,frontend}.sh, run-local.{sh,ps1}, test-users-local.{sh,ps1}
docs/
  Architecture+and+Repository+Orientation/  ← directory of `+`-named markdown wiki files
  Authentication+and+Authorization+DOMAIN/  ← (etc., 11 such "+ DOMAIN" directories)
  changelog/, db-schema.md, deployment-gcp.md
db/migrations/20250101090000_create_us_consent_tables.sql
data/applications.sample.json
document_ai_ocr/, openapi/us-api.yaml
.ai/                                        ← prior agent artifacts (perf-observability/, playwright-ci/, …)
.codex/, .agents/, .claude/                 ← agent-stack metadata
.gitignore, .git (worktree pointer)
```

## Frontend stack today

- **Next.js**: `^16.2.0` (frontend/package.json#64)
- **React**: `^19` with React DOM `^19`
- **Router**: App Router only (`frontend/app/` exists, no `frontend/pages/`)
- **TypeScript**: `^5`; `next.config.mjs` sets `typescript.ignoreBuildErrors: true`
- **Styling**: TailwindCSS `^3.4.17`, `tailwindcss-animate`, PostCSS, Inter font from `next/font/google`, shadcn-style Radix UI primitives (~30 `@radix-ui/*` deps)
- **State / data**: MobX `^6.13.7`, react-hook-form `^7.54.1`, zod `^3.24.1`. **No** Redux, Zustand, React Query, or SWR.
- **Auth**: `@auth0/auth0-react ^2.8.0`
- **Analytics**: `@amplitude/analytics-browser ^2.11.0` (initialised in `frontend/components/amplitude-client.tsx`, fires `page_view` on every pathname change via `usePathname`)
- **Email**: `resend ^4.0.0`
- **Plaid**: `react-plaid-link ^4.1.1`
- **Charts**: `recharts 2.15.0`
- **Existing observability deps**:
  - `@sentry/nextjs ^10.45.0`
  - `@vercel/otel ^2.1.1`
  - `@opentelemetry/api-logs ^0.205.0`
  - `@opentelemetry/instrumentation ^0.205.0`
  - `@opentelemetry/sdk-logs ^0.205.0`
- **NOT installed**: `web-vitals`, `@next/bundle-analyzer`, `lighthouse`, `lhci`, any k6 or Locust deps. No Prometheus client.
- **Existing Sentry config (verified file paths)**:
  - `frontend/sentry.server.config.ts` — `dsn` hardcoded `https://709624c186f2ea7ac44156eefea9ddaf@o4511072041369600.ingest.us.sentry.io/4511072045694976`, `tracesSampleRate: 1`, `enableLogs: true`, `sendDefaultPii: true`, `beforeSend` filter via `lib/sentry-filter.ts`.
  - `frontend/sentry.edge.config.ts` — same DSN + same settings, but it is the edge-runtime variant.
  - `frontend/instrumentation-client.ts` — DSN from `NEXT_PUBLIC_SENTRY_DSN || SENTRY_DSN`, env from `NEXT_PUBLIC_SENTRY_ENVIRONMENT || NODE_ENV`, `tracesSampleRate=Number(NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.1)`, `replaysSessionSampleRate=0`, `replaysOnErrorSampleRate=1`, `integrations: [Sentry.replayIntegration()]`, `debug = NODE_ENV === 'development'`. Exports `onRouterTransitionStart = Sentry.captureRouterTransitionStart`.
  - `frontend/instrumentation.ts` — calls `registerOTel({serviceName: process.env.OTEL_SERVICE_NAME || "lita-frontend"})`, then conditionally imports server / edge sentry.
  - `frontend/next.config.mjs` — wraps with `withSentryConfig`; sets `org: "lita-lh"`, `project: "javascript-nextjs"`, `silent: !CI`, `widenClientFileUpload: true`, `reactComponentAnnotation.enabled: true`, `tunnelRoute: "/monitoring"`, `disableLogger: true`, `automaticVercelMonitors: true`, `webpack.treeshake.removeDebugLogging: true`. Also defines redirect `/sentry-example-page → /`.
  - `frontend/lib/sentry-filter.ts` — `isAbortedRequestError` drops noisy aborted-fetch errors before send.
- **Bundle / perf tooling today**: none. No `@next/bundle-analyzer`, no Lighthouse CI, no bundle-size guard.
- **Webpack overrides**: only the Sentry plugin's `treeshake.removeDebugLogging` and `automaticVercelMonitors` (in `next.config.mjs`'s `webpack` Sentry option); no custom `webpack(config) { … }` function.
- **Other key Next config**: `cacheComponents: false` (intentional, comment cites `force-dynamic` routes), `turbopack.root` resolves to repo root, `experimental.webpackBuildWorker = true`, `experimental.parallelServerBuildTraces = true`, `experimental.parallelServerCompiles = true`, `images.formats = ["image/avif","image/webp"]`, four `images.remotePatterns` allow-listed hosts.
- **Global behaviour**:
  - `frontend/app/layout.tsx` is `force-dynamic` and renders `<AmplitudeClient/>`, `<Auth0AppProvider/>`, `<AuthProvider/>` inside `<ThemeProvider/>`. Inter font preloaded.
  - `frontend/middleware.ts` runs on every non-static request, redirects `/login` to Auth0, sets `X-App-Country` and `X-App-Locale` response headers, sets a `PROFILE_LOCALE_KEY` cookie if absent.
- **Dynamic-rendering markers**: `frontend/app/layout.tsx` (root), `frontend/app/applications/page.tsx`, `frontend/app/login/page.tsx` all set `export const dynamic = 'force-dynamic'`. No `generateStaticParams` or `revalidate` usages — the app is effectively pure SSR for top-level pages today.

### Routes inventory (top level only)

App Router pages (`frontend/app/`):
`aml`, `api`, `applicants`, `application`, `applications`, `auth`, `connect-accounts`, `corporate-overview`, `dashboard`, `forgot-password`, `kyc`, `login`, `mission-control`, `phone-application`, `register`, `sentry-example-page`, `wiki`, `wiki-api`. Top-level files: `layout.tsx`, `page.tsx`, `globals.css`, `global-error.tsx`.

Next.js API route handlers (`frontend/app/api/`):
`applications`, `auth`, `bank-logos`, `dashboard`, `health`, `kyc`, `levels-fyi`, `payments`, `ready`, `saltedge`, `sentry-example-api`, `user`, `v1`, `wiki`.

Health-style endpoints already present:
- `frontend/app/api/health/route.ts` — proxies `GET ${BACKEND_API_URL}/health`, returns 502 on backend unreachable, 500 if env not set.
- `frontend/app/api/ready/route.ts` — returns `{ok:true}` for GET and 200 for HEAD; pure liveness.
- Backend `/health` in `backend/src/main.py:95` (`{"status":"ok"}`).
- Backend `/health` and `/health/{provider}` for provider health (`backend/src/interface/open_banking_endpoints.py:552, :587`).

## Backend stack today

- **Python**: 3.10 (Dockerfile `python:3.10-slim`; `validate.sh` accepts ≤3.11 and rejects newer for Pydantic compat)
- **FastAPI**: `>=0.115.0`; uvicorn `>=0.23.2` with `[standard]` extras
- **ASGI entry point**: `backend/src/main.py` (Dockerfile `CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]`)
- **DB drivers and ORM**:
  - SQLAlchemy `>=2.0.36`, sync engine via `sqlalchemy.create_engine` (no async).
  - **MySQL** (primary auth/consent/billing surface): `pymysql 1.1.0` directly + `cloud-sql-python-connector[pg8000] 1.7.0` for prod.
  - **Postgres** (applications + canonical bank-data): `psycopg2-binary 2.9.9` plus `pg8000>=1.29.6` (used through Cloud SQL connector).
  - Cloud SQL connector instantiated lazily; uses `NullPool` (no app-side pool) and `pool_pre_ping=True`. See `backend/src/config/database.py`.
  - Two engines exist: `engine` / `SessionLocal` (MySQL) and `tx_engine` / `TxSessionLocal` (Postgres). A third `postgresql` package (`backend/src/infra/postgresql/`) wraps the scoring-result Postgres database separately.
- **Async**: not used. All endpoints are sync (`def`), with sync repositories.
- **Middleware order** (`backend/src/main.py`):
  1. `app = FastAPI()`
  2. `@app.on_event("startup") ensure_database_schema()` — registers SQLAlchemy metadata, runs `Base.metadata.create_all`, then runs three column-ensure helpers, then attempts Postgres `ensure_postgres_applications_relaxed`.
  3. `app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])`.
  4. Routers included in this order: `saltedge_router` (first by design for path priority), `endpoints_router`, `auth_router`, `transunion_router`, `open_banking_router`, `lita_router`, `test_router`, `billing_router`, `webhook_router`. (`bank_router` is commented out.)
  5. Custom `@app.middleware("http") attach_region_headers` — sets `X-App-Country` / `X-App-Locale` on every response (also reads from request).
  6. `@app.get("/health")` → `{"status":"ok"}`.
  7. Exception handlers: `RequestValidationError` (422 with logger.error), `AuthError` (401 with `WWW-Authenticate: Bearer`), generic `Exception` (500 with redacted `error_id` correlation token; preserves Starlette HTTP exceptions).
- **Logging setup**:
  - **Stdlib `logging` only.** Every logger is obtained via `logging.getLogger(__name__)`. No `logging.basicConfig`, no JSON formatter, no `dictConfig`. No `structlog`. No request-ID injection. The "correlation token" only appears in 500 responses (random 12-hex `error_id`).
  - Container logs are written to stdout/stderr; Docker-compose limits each service log to `10m × 3 files` (`platform/deployment/prod/docker-compose.yml`).
- **Existing instrumentation imports**: **none.** No `sentry_sdk`, no `opentelemetry`, no `prometheus_client`, no `statsd`, no `datadog` import in `backend/src/`. The only "perf-adjacent" infra is `backend/src/infra/retry.py` (logging-driven retry decorator) and the two `scripts/` synthetic checks.
- **Queue / worker**:
  - **No Celery, no RQ, no FastAPI BackgroundTasks** in registered routers (greps return zero hits in `backend/src/`).
  - `services/scoring-orchestrator/` is a Node service that orchestrates scoring jobs, and `backend/src/services/scoring_job_queue_service.py` is a DB-backed job queue (table-driven, no broker).
- **Cache**: no Redis client present (`grep redis` is empty). Caching is in-process / DB-driven only.
- **ClickHouse**: not used.
- **External API integrations** (`backend/src/infra/external_apis/`):
  - Plaid (`plaid_client.py`, `plaid_products.py`, `plaid_webhook_verifier.py`, `plaid_bank_gateway.py`)
  - Salt Edge core + partners (`saltedge_client.py`, `saltedge_partners_client.py`, `saltedge_signing.py`)
  - Finverse (`finverse_client.py`)
  - Auth0 (frontend-side via `@auth0/auth0-react` + token-issue path on backend `/api/auth/token`)
  - Resend (email; consumed by frontend Next.js routes and possibly by backend)
  - Vertex AI (credit scoring; referenced in docs/deployment-gcp.md and the `credit-score-pipeline/` directory)
  - Document AI (`document_ai_ocr/`)
  - Exa (`exa-py 1.0.11` in requirements.txt)

## Infrastructure today

- **Local dev**:
  - `platform/deployment/local/docker-compose.yml` runs Caddy + frontend (`Dockerfile.local`, `npm run dev`) + backend (`Dockerfile`, `uvicorn`). No local MySQL/Postgres container — it expects `CLOUD_SQL_CONNECTION_NAME` or remote DB envs.
  - `validate.sh` compiles backend in a venv, runs pytest, then `npm install --legacy-peer-deps && npm test && npm run build`, then a backend `docker build`. No frontend image build, no compose start.
  - Several alternate dev scripts under `scripts/`: `run-local.sh`, `applicants-local.sh`, `logs-local-backend.sh`, `logs-local-frontend.sh`.
- **CI workflows** (one-line summaries):
  - `auto-assign.yml` — auto-assigns reviewers via config.
  - `cache-clearing-workflow.yaml` — `gh cache delete --all` weekly Friday 16:00 UTC.
  - `changelog.yml` — generates HTML and publishes to GitHub Pages (`docs` artifact).
  - `check-secrets.yml` — `workflow_dispatch` validation that all 51 named secrets are populated.
  - `compile.yml` — push-to-main: backend pytest, frontend `npm test`, then a finalize-and-label step (PR label `build-success` / `build-failure` / `review`, status comment, job summary).
  - `daily-prod-e2e.yml` — daily 07:00 UTC: Playwright on `https://ehousing.joinlita.com`, results to Allure on `gh-pages`, Slack notify, `qa-webhook` environment.
  - `delete-failed-runs.yml` — cron 03:00 UTC daily, deletes failed/cancelled runs.
  - `delete-stale-branches.yml` — cleanup.
  - `deploy.yml` — main push: `test` → `build-and-push` (Docker Buildx → Artifact Registry `us-central1-docker.pkg.dev/.../ehousing/{backend,frontend}:<SHA>`) → `deploy` (SSH into GCE VM, `git fetch`, `sed` `.env`, `docker-compose pull && up -d`, `grant-db-permissions.sh`) → `verify` (curl `/`, Slack message).
  - `label-on-review.yml` — reactive labels on review state changes.
  - `pr.yml` — Slack notification on PR open/sync.
  - `pull-requests-workflow.yaml` — additional PR helpers.
  - `qa-index.yml` — after daily-prod-e2e, deploys a static QA index page to GitHub Pages.
  - `sync-lita-tasks.yml` — daily 07:50 UTC, runs `python scripts/sync_lita_tasks.py`, commits the snapshot back if changed.
- **Production deploy target**: **Google Cloud Compute Engine VM**, not Cloud Run. The `backend/cloudbuild.yaml` is legacy and *not* the active path (confirmed in `docs/deployment-gcp.md`).
  - VM: `ehousing-credit-v2`, zone `us-central1-f`, GCP project `elemental-day-443510-e0`.
  - Docker images: `us-central1-docker.pkg.dev/elemental-day-443510-e0/ehousing/{backend,frontend}:<SHA>`.
  - Reverse proxy: Caddy (`platform/deployment/prod/Caddyfile`) — TLS via Let's Encrypt, CORS preflight handler, route split between frontend (Next.js) and backend (FastAPI).
  - Compose: `platform/deployment/prod/docker-compose.yml` — services `caddy`, `frontend`, `backend`, `mysql`. Backend healthcheck: `python -c "urllib.request.urlopen('http://localhost:8000/health')"` every 10 s.
  - Logging: docker-compose `json-file` driver `max-size=10m, max-file=3`. No log forwarder.
- **Postgres** (per docs/deployment-gcp.md):
  - Cloud SQL instance `elemental-day-443510-e0:us-central1:lita-ehousing` — public IP `34.27.204.140`, port 5432, database/user both `lita-ehousing`.
  - Backend connects directly via public IP (`DB_HOST` set on VM `.env`), *not* via Cloud SQL Auth Proxy.
  - `grant-db-permissions.sh` re-applies `ALL PRIVILEGES` on `public` schema after every deploy (idempotent).
  - A second Cloud SQL instance is referenced in `backend/cloudbuild.yaml`: MySQL `elemental-day-443510-e0:us-central1:lita-mysql` (env `CLOUD_SQL_CONNECTION_NAME`). The deploy `--set-env-vars` and `--set-secrets` lines in `cloudbuild.yaml` confirm the dual-DB layout.
- **MySQL**: in production today the prod compose runs **MySQL 8.0.31 inside the same VM as a container** (`mysql` service in `platform/deployment/prod/docker-compose.yml`), with `MYSQL_DATABASE/USER/PASSWORD` env-driven. The legacy Cloud Run path (`backend/cloudbuild.yaml`) referenced a Cloud SQL `lita-mysql` instance, which may still exist but is not on the active code path.
- **ClickHouse**: not provisioned, not referenced anywhere.
- **Redis**: not provisioned, not referenced anywhere.
- **External alerting today**:
  - Sentry — frontend errors and traces to `o4511072041369600.ingest.us.sentry.io` (DSN hardcoded in two files).
  - Slack webhooks — deploy success (`SLACK_WEBHOOK_URL`), PR open (`PR_SLACK_BOT_TOKEN`), daily prod E2E (`QA_SLACK_WEBHOOK_URL`).
  - PagerDuty — not configured today.
  - Cloud Monitoring / Cloud Trace / GCP-native observability — not configured for the eHousing app (Vertex AI side may have its own).
  - Grafana / Loki / Tempo / Prometheus — none today.
  - The only "metrics-like" automation in-repo is `scripts/check_service_cpu_anomalies.py` (per-process CPU vs JSON baseline) and `scripts/synthetic_load_test.py` (concurrent GETs over saltedge/plaid OpenAPI routes, latency average + non-allowlisted-status fail).

## Integration points (where to plug in observability)

| New component                              | Touchpoint (verified path)                                                                                                                                                                                                                  | Notes                                                                                                                                                              |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| OpenTelemetry SDK (backend)                | `backend/requirements.txt` (add `opentelemetry-distro[otlp]`, `-instrumentation-fastapi`, `-instrumentation-sqlalchemy`, `-instrumentation-requests`, `-instrumentation-logging`); init in `backend/src/main.py` immediately after `app = FastAPI()` and before `app.add_middleware(CORSMiddleware,...)`. | Sync engines + `pymysql`/`pg8000` are supported; the cloud-sql-connector wraps DBAPI so SQLAlchemyInstrumentor still sees spans.                                   |
| Prometheus FastAPI exporter                | New file `backend/src/infra/metrics.py` + register in `backend/src/main.py` *before* the `attach_region_headers` middleware (so `/metrics` isn't decorated with region headers if undesired). | `/metrics` must come before any auth-mandatory router; `prometheus_client.make_asgi_app()` is the cleanest plug.                                                  |
| Backend structured logging                 | New `backend/src/infra/logging_config.py` invoked from the top of `backend/src/main.py`; replace stdlib formatter with structlog JSON. Also touch `backend/src/infra/retry.py` so retry warnings carry trace_id. | Watch out for FastAPI's own `uvicorn.access` logger — must be reconfigured separately or it stays text.                                                            |
| Request-ID middleware                       | New `backend/src/infra/request_id.py` registered as ASGI middleware in `backend/src/main.py` *before* any router include and before `attach_region_headers`. | Read `X-Request-Id`, fallback to UUID4; bind to logger via contextvars; emit on response header.                                                                  |
| Frontend OTel server-spans                  | Already partially wired via `frontend/instrumentation.ts` (`registerOTel`). Add OTLP exporter env (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` already documented in `frontend/.env.local.example`). | Pair with collector receiving OTLP/HTTP on `/v1/traces`.                                                                                                          |
| Frontend web-vitals                         | New `frontend/lib/rum.ts` registered from `frontend/app/layout.tsx` (client component) — wraps `web-vitals/onLCP|onINP|onCLS|onFCP|onTTFB`, posts to a new `frontend/app/api/rum/route.ts` which forwards via `fetch` to the OTel collector. | Layout already runs `force-dynamic`, so the wrapper component is safe.                                                                                            |
| Bundle analyzer                              | `frontend/next.config.mjs` — wrap with `@next/bundle-analyzer` *inside* the existing `withSentryConfig(...)` factory so the Sentry plugin still wraps. New script `npm run analyze` in `frontend/package.json`. | Sentry config already extends webpack — order matters; analyzer must wrap, not replace.                                                                            |
| Lighthouse CI                                | New `.github/workflows/perf-pr.yml`, plus `frontend/.lighthouserc.json` and `frontend/lighthouse-budgets.json` next to `playwright.config.ts`. | Reuses existing node 20 GH Actions cache.                                                                                                                          |
| k6 load testing                              | New top-level `tests/k6/{apply-flow.js, dashboard-list.js, applicants-csv.js, auth-token.js, lib/sla.js}` — *not* under `backend/tests/` to avoid pytest discovery. CI invocation in `perf-pr.yml` and `perf-nightly.yml`. | Replaces `scripts/synthetic_load_test.py` for human-scale flows; the existing script is kept as a smoke gate.                                                      |
| Postgres exporter                            | Add to `platform/observability/docker-compose.yml` (new file). Exporter user provisioned via a new `platform/database/grant-monitoring.sql` and applied through `grant-db-permissions.sh` extension. | Must use a *separate* Cloud SQL user with `pg_monitor`. Public-IP allowlist on Cloud SQL must accept the GCE VM IP.                                              |
| MySQL exporter                               | Same compose; user provisioned with `PROCESS, REPLICATION CLIENT, SELECT` only. The MySQL container in `platform/deployment/prod/docker-compose.yml` is reachable as `mysql:3306` on the `internal` network — exporter joins `internal`. | Be careful not to expose the exporter port outside the VM.                                                                                                         |
| Caddy metrics                                | Caddy emits `/metrics` natively when `admin` API is enabled. Update `platform/deployment/prod/Caddyfile` to add a `:2019` admin block bound to the `internal` network only. | Already-present `log { output stdout format console }` will be supplemented by structured JSON via a Caddy `transform` directive.                                  |
| Grafana / Loki / Tempo / Prometheus / OTel collector | New directory `platform/observability/` with `docker-compose.yml`, `grafana/`, `prometheus/`, `tempo/`, `loki/`, `otel-collector/`. Reused on the GCE VM via a sibling compose file: `platform/deployment/prod/docker-compose.observability.yml` (extends the same `web`/`internal` networks). | Requires opening only Grafana :3001 → Caddy reverse-proxy with Auth0 OIDC for engineer access.                                                                     |
| Synthetic blackbox probes                    | New `platform/observability/blackbox/blackbox.yml`, scraped by Prometheus. Probes: `https://ehousing.joinlita.com/`, `/api/health`, `/api/ready`, plus the backend `/health` via internal Caddy address. | Hooks into the existing health endpoints described above; no app changes needed.                                                                                  |
| Cloud Monitoring (optional)                  | Already-installed Google Cloud SDK on the VM. A `google-cloud-ops-agent` install script could ship VM metrics to GCP. | Not required for in-repo Grafana stack but listed because GCP project boundaries already exist.                                                                  |

## Constraints / risks

- **Must not break existing Sentry.** Hardcoded DSN in `frontend/sentry.{server,edge}.config.ts` is shared with the live project `lita-lh / javascript-nextjs`; keep `withSentryConfig` wrapping outside of any new wrappers (e.g., `@next/bundle-analyzer` must wrap *inside* not *replace*).
- **Backend cold-start budget.** Production VM uses `restart: always` so cold starts happen on every deploy. OTel auto-instrumentation can add 100-300 ms; gate to `ENABLE_OTEL=true` and validate startup time stays below baseline + 200 ms.
- **CI runtime budget.** `compile.yml` and `deploy.yml` already run backend pytest + frontend test/build. Lighthouse + k6 + bundle-analyzer must run in parallel jobs and total wall-clock must stay within +30 % of the current pipeline.
- **Cloud SQL connection pool already constrained.** `backend/src/config/database.py` uses `NullPool` and `pool_pre_ping=True` — every request opens a connection. Postgres exporter must use a *separate user* with `pg_monitor` only and a small max-connections cap, otherwise it amplifies pool pressure.
- **Cloud SQL public-IP exposure.** Backend talks directly over public IP `34.27.204.140`. Adding a postgres_exporter that opens its own connections increases the surface area; must be bound only to the VM's private network (no host port mapping).
- **MySQL inside the VM (prod compose) vs Cloud SQL MySQL (legacy cloudbuild).** Verify which path is current before wiring `mysqld_exporter`. Today's active prod path uses the in-VM container, so the exporter joins the `internal` Docker network.
- **Production GCP project boundaries**: `elemental-day-443510-e0` is the only project referenced; the GCE VM and both Cloud SQL instances live there. Service account JSON is mounted at `/app/service-account-key.json`. Any GCP-native add-on must reuse this SA or get a scoped sibling.
- **No async backend.** SQLAlchemy is sync. Don't introduce `asyncpg` or async OTel instrumentation that requires async context — stick with sync instrumentations.
- **Pydantic v2 / Python 3.10–3.11 only.** `validate.sh` rejects 3.12+. New dependencies must support 3.10.
- **Hardcoded secrets in two Sentry files.** `dsn` is a literal string in `frontend/sentry.server.config.ts` and `sentry.edge.config.ts` — flagging here so any "secrets must come from env" sweep does not silently break production Sentry.
- **GitHub Pages already used** by `changelog.yml` and `daily-prod-e2e.yml` (Allure) and `qa-index.yml`. A new perf dashboard cannot collide on the `gh-pages` branch root path.
- **`force-dynamic` everywhere.** Comment in `next.config.mjs` says `cacheComponents: false` is intentional because routes use `force-dynamic`. Any caching/perf optimisation that flips this back will break the application.

## Deployment safety flag

**Decision:** **medium-risk**

**Rationale:**
- Touches the prod docker-compose surface (new sidecars on the same Docker host as the live app) → impacts the same VM that serves customer traffic.
- Adds ~7 new dependencies to the backend wheel, ~6 to the frontend bundle (web-vitals + analyzer + collector libs) → bundle-size impact.
- Modifies `backend/src/main.py` middleware order — a regression here breaks every request.
- Adds a new GH Actions workflow that runs on every PR — measurable CI cost, but isolated.
- Database changes are *additive only* (new monitoring user + `pg_stat_statements`). No schema migrations on app tables.
- No customer data flows out of the existing perimeter; OTel collector is local on the VM.

**Rollout strategy:**
1. Land non-runtime artifacts first (CI workflows, docker-compose for the observability stack, dashboards JSON) behind `workflow_dispatch` triggers.
2. Land backend changes behind an `ENABLE_OBSERVABILITY=true` env flag wired through `backend/src/main.py`. Default off in prod.
3. Land frontend `web-vitals` + bundle analyzer behind `NEXT_PUBLIC_ENABLE_RUM=true`. Default off in prod.
4. Bring up `platform/observability/docker-compose.yml` on the VM as a sibling stack (no shared networks at first), validate with synthetic traffic.
5. Flip `ENABLE_OBSERVABILITY=true` for one day, watch the existing Sentry dashboard for regressions.
6. Flip `NEXT_PUBLIC_ENABLE_RUM=true`, watch Sentry session-replay rate, bundle size, LCP delta vs synthetic baseline.
7. Document rollback: `unset ENABLE_OBSERVABILITY` + `docker-compose restart backend` reverts to today's behaviour without redeploy.
8. Add the perf gates to required PR checks only after one full week of green CI runs without false-positive blocks.

## Production observability plan

For each new endpoint / handler / process this work introduces:

| Component                                 | What it logs                                                                 | What it traces                                                                  | Alerts (warn / page)                                                           |
|-------------------------------------------|------------------------------------------------------------------------------|---------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| Backend OTel auto-instrumentation         | Every request: method, path, status, duration_ms, request_id, trace_id, user_id (if known). Errors keep the existing `error_id`. | Span tree per request with FastAPI route, SQLAlchemy SQL spans, outbound `requests` calls (Plaid/SaltEdge/Finverse/Auth0). Tail-sampled at 10 %, 100 % retained on errors. | per-route p95 > 600 ms 10 m → warn; > 1 s 5 m → page. Backend 5xx > 0.5 % 5 m → warn; > 2 % 5 m → page. |
| Backend `/metrics` (prometheus_client)    | n/a (no log per scrape; Prometheus scrapes every 15 s)                       | n/a                                                                             | scrape failure 3× consecutive → warn.                                          |
| Backend `RequestIdMiddleware`             | Mints `request_id` if missing; logs `event=request.start` and `event=request.end` with status + duration. | Adds `request.id` attribute to the active span.                                  | none.                                                                          |
| Frontend `web-vitals` reporter (`/api/rum`) | Logs forwarded RUM payload (no PII; only metric name, value, route, navigation type, browser type) at info. | Creates a span per RUM event and forwards as OTLP/HTTP to the collector.         | LCP p75 / `/applicants` > 3.5 s 30 m → warn; > 5 s 30 m → page.                |
| Frontend bundle-size guard (CI only)      | n/a                                                                          | n/a                                                                             | Gate: PR fails when route gzip JS exceeds documented budget.                   |
| OTel collector                             | Internal log on misconfiguration / queue overflow.                          | Fan-out to Tempo (traces), Prometheus remote-write (metrics), Loki (logs).      | Collector queue depth > 80 % 5 m → page (paging means traces are being dropped).|
| Postgres exporter                          | Logs scrape errors only.                                                    | n/a                                                                             | scrape failure 3× → warn; pg_stat_statements top-1 query mean_time > 500 ms 10 m → warn. |
| MySQL exporter                              | Logs scrape errors only.                                                    | n/a                                                                             | InnoDB buffer pool hit ratio < 95 % 30 m → warn; replica lag > 30 s → page.     |
| Caddy metrics                               | Existing access log untouched; metrics scrape only.                         | n/a                                                                             | 5xx ratio > 1 % 5 m → warn; upstream `backend` p95 > 700 ms 5 m → page.        |
| Blackbox probes                             | n/a (Prometheus query-time only)                                            | n/a                                                                             | https probe failure 3× consecutive → page.                                     |
| `perf-pr.yml` / `perf-nightly.yml`         | GH Actions logs; bundle-size + lighthouse + k6 artifacts retained 14 d.    | n/a                                                                             | Posts PR comment with deltas; non-blocking initially, then required after 1 week green. |

## Success metrics for this task

1. **Three live data planes** — Prometheus, Tempo, Loki — populated from at least one real deploy of `lita-backend` and one real session of `lita-frontend`. (Verifiable from Grafana Explore.)
2. **All 8 dashboards green** for the previous 24 hours in production with no panel showing "No data" except those tied to optional ClickHouse/Redis (which remain documented but disabled).
3. **`/metrics` is reachable internally** from Prometheus (`up{job="lita-backend"}=1`) and externally proxied through Caddy to nothing (must NOT be public).
4. **Front-end bundle delta posted** as a PR comment on a sample PR, with the bot detecting at least one regression case in a contrived test PR.
5. **k6 SLA gate** passes the smoke run in CI (`apply-flow.js`, 5 VUs × 60 s) and fails when an artificial 1 s sleep is added to one of the touched handlers.
6. **No regression in existing Sentry** — issue rate and session-replay rate during the first 24 h after rollout stay within ±10 % of the prior week's baseline.
7. **Cold-start delta** measured by `prelaunch_deployment_health_check.sh` stays under 200 ms vs the pre-rollout baseline.
8. **CI pipeline wall-clock** for `deploy.yml` increases by less than 30 % vs the pre-rollout baseline.
9. **One real alert fires end-to-end** (warn in Slack `#lita-perf-alerts`) during the first week — manual induction acceptable to prove the path.
10. **Runbook entries** for each alert linked from the alert payload exist under `docs/Deployment+Operations+and+Observability/`.
