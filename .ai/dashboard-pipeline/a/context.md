# Task A — Context

## Goal
Fix `/dashboard` so that account balances and transactions are populated for Plaid users.

## Key files

### Backend

| File | Role |
|------|------|
| `backend/src/interface/http_endpoints.py` | Submit handler (`create_application`), balance/transaction endpoints, Plaid normaliser functions |
| `backend/src/usecase/open_banking.py` | `sync_application_plaid_consents()` — reads `connected_accounts` to extract Plaid tokens |
| `backend/src/usecase/bank_data_pull.py` | `run_submit_plaid_pull()` / `PRODUCT_ASSET_REPORT_FULL` |
| `backend/src/usecase/country_codes.py` | `normalize_country()` — reads `data/country_aliases.json` at import |
| `backend/src/infra/mysql/schema.py` | Schema migration helpers |
| `backend/src/infra/mysql/housing_application_repository.py` | `_ensure_schema_columns()` runs migrations at startup |
| `backend/Dockerfile` | Controls which files are copied into the container |

### Frontend

| File | Role |
|------|------|
| `frontend/lib/application-kyc.ts` | Reads KYC fields from `connected_accounts` JSON column |

## Data shapes

### `bank_data_snapshots` table
```
source          TEXT   ("plaid" | "saltedge")
product_type    TEXT   ("balances" | "transactions" | "asset_report_full" | "liabilities")
payload         JSON
```

### Plaid asset report payload
```json
{
  "report": {
    "items": [
      {
        "institution_name": "First Bank",
        "accounts": [
          {
            "name": "Checking",
            "balances": { "current": 1234.56, "available": 1100.00 },
            "transactions": [
              { "amount": 50.0, "date": "2024-03-15", "name": "Coffee Shop" }
            ]
          }
        ]
      }
    ]
  }
}
```

## Root causes (fixed in this task)

1. `connected_accounts` column missing from prod DB → migration added
2. `country_aliases.json` missing from Docker image → `COPY data/ ./data/` added
3. Review page strips Plaid tokens from `connected_accounts` → draft fallback added in `create_application`
4. `asset_report_full` snapshots not dispatched to balance/transaction normalisers → dispatch added

## New functions added

- `_has_connected_account_records(connected_accounts)` — predicate helper
- `_extract_draft_connected_accounts(draft)` — extracts Plaid tokens from draft
- `_normalise_plaid_asset_report_balances(snapshot_payload)` — maps asset report → balance list
- `_normalise_plaid_asset_report_transactions(snapshot_payload)` — maps asset report → transaction list
