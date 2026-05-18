# Context: Provider API — 2026-04-28

## Task Description

Build the full provider API backend pipeline: raw payload ingestion, normalization, canonical storage, connection status tracking, and webhook endpoints for Plaid and SaltEdge.

## PRs & Commits

| PR | Description |
|----|-------------|
| #71 | Shared exponential-backoff retry utility applied to provider calls |
| #72 | Normalization service, canonical repository, and DB migration |
| #73 | Connection status management and webhook endpoints for Plaid/SaltEdge |
| #74 | Raw provider payload ingestion pipeline and snapshot management service |
| #75 | Provider payload adapters mapping external payloads to internal schema |
| #76 | Provider connection_status schema and health check endpoints |

## Key Files

- `backend/usecase/retry.py` — exponential-backoff utility (PR #71)
- `backend/usecase/normalization/service.py` — normalization logic (PR #72)
- `backend/usecase/normalization/repository.py` — canonical data store (PR #72)
- DB migration — `connection_status` table (PR #72, #76)
- `backend/infra/providers/plaid/webhook.py` — Plaid webhook handler (PR #73)
- `backend/infra/providers/saltedge/webhook.py` — SaltEdge webhook handler (PR #73)
- `backend/usecase/connection_status.py` — connection health manager (PR #73)
- `backend/infra/ingestion/pipeline.py` — raw ingestion pipeline (PR #74)
- `backend/infra/ingestion/snapshot.py` — snapshot management (PR #74)
- `backend/infra/providers/plaid/adapter.py` — Plaid payload adapter (PR #75)
- `backend/infra/providers/saltedge/adapter.py` — SaltEdge payload adapter (PR #75)
- `backend/interface/routers/providers.py` — health-check FastAPI routes (PR #76)

## Data Flow

```
Provider webhook
  → ingestion pipeline (PR #74)
  → raw snapshot storage (PR #74)
  → payload adapter (PR #75)
  → normalization service (PR #72)
  → canonical repository (PR #72)
  → DB
```

## Build Info

- Backend: `powershell -ExecutionPolicy Bypass -File .\validate.ps1 -BackendOnly`
- Tests: `backend\.venv\Scripts\python.exe -m pytest backend\tests\ -v`
