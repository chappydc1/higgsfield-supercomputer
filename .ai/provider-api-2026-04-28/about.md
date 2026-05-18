# Project: provider-api-2026-04-28

## Project

Provider API backend foundation shipped on 2026-04-28 across six PRs. Covers the full pipeline from raw payload ingestion through normalisation to canonical storage, plus connection health management and webhook endpoints for Plaid and SaltEdge.

## Architecture

Clean architecture layers in `backend/`:
- `infra/` — provider clients (Plaid, SaltEdge), raw payload storage, webhook receivers
- `usecase/` — normalization service, retry utility, connection status management
- `interface/` — FastAPI health-check endpoints, webhook routes

Data flow: provider webhook → ingestion pipeline → raw snapshot storage → payload adapter → normalization service → canonical repository → DB.

## Key Design Decisions

- Shared exponential-backoff retry utility applied to all provider calls (PR #71) to handle transient failures uniformly.
- Raw payloads stored as snapshots before normalization so the original data is never lost.
- Payload adapters decouple provider-specific schemas from the internal canonical model.
- `connection_status` table tracks provider health per user; health-check endpoints expose this to the frontend.
- Plaid and SaltEdge handled by separate adapter implementations behind a common interface.

## Relevant Codebase Areas

- `backend/infra/providers/` — Plaid and SaltEdge clients and webhook handlers
- `backend/usecase/normalization/` — normalization service and canonical repository
- `backend/usecase/retry.py` — exponential-backoff utility
- `backend/interface/routers/providers.py` — health-check and webhook FastAPI routes
- DB migrations — `connection_status` table schema
