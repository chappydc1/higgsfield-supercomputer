# Summary: Provider API — 2026-04-28

## PRs Merged: 6

## What Changed

- **Retry utility** (#71): Shared exponential-backoff applied to all provider calls
- **Normalization** (#72): Normalization service + canonical repository + DB migration
- **Connection status + webhooks** (#73): Health tracking and webhook endpoints for Plaid/SaltEdge
- **Ingestion pipeline** (#74): Raw payload ingestion + snapshot management service
- **Payload adapters** (#75): Plaid and SaltEdge adapters mapping to internal schema
- **Health check endpoints** (#76): FastAPI routes exposing `connection_status` per user

## Data Flow

```
Webhook → Ingestion (#74) → Snapshot → Adapter (#75) → Normalization (#72) → DB
                                             ↑
                              Connection status (#73, #76)
```

## Theme

Full provider integration pipeline shipped end-to-end in one day — from raw webhook receipt to normalised canonical storage.

## References

- Detail: [context.md](context.md)
- Project overview: [../about.md](../about.md)
