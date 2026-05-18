# Dashboard Pipeline Fix

Fixes the end-to-end Plaid bank-data pipeline so that `/dashboard` populates with account balances and transactions.

## What was broken

Two independent root causes, both now fixed:

1. **`connected_accounts` column missing from production DB** — The schema migration added `archived`, `review_status`, and `skipped_connect_accounts` columns but not `connected_accounts`. Without this column `sync_application_plaid_consents()` read `None`, extracted zero Plaid tokens, and no bank-data pull was ever kicked off.

2. **`country_aliases.json` absent from Docker image** — The file resolves free-text country names to ISO-3166-1 alpha-2 codes at import time. Without it `normalize_country("United States")` returned `None`, the fallback uppercased the raw string to `"UNITED STATES"`, which never matched `"US"`, so the US routing branch was never taken and the Plaid pull was skipped.

3. **Plaid tokens stripped at review page** — The frontend review page reconstructed `ConnectedAccount` without `accessToken`, so the submit payload arrived with empty `connected_accounts`. The submit handler now falls back to draft-stored Plaid tokens when the request payload is empty.

4. **Asset-report-only snapshots** — Plaid users whose bank data was captured as `asset_report_full` (not separate `balances`/`transactions` products) had empty dashboard panels. Normaliser functions now extract balances and transactions from the nested asset-report structure.

## Fixes

| File | Change |
|------|--------|
| `backend/Dockerfile` | Added `COPY data/ ./data/` so `country_aliases.json` is in the container |
| `backend/src/infra/mysql/schema.py` | Added `ensure_application_connected_accounts_column()` migration |
| `backend/src/infra/mysql/housing_application_repository.py` | Calls the new migration at startup |
| `backend/src/interface/http_endpoints.py` | Draft fallback for `connected_accounts`; DB reload after submit; `_normalise_plaid_asset_report_balances`; `_normalise_plaid_asset_report_transactions`; balance/transaction endpoints dispatch on `asset_report_full` |
| `backend/tests/interface/test_application_endpoint.py` | `test_submit_application_uses_draft_connected_accounts_for_plaid_sync` |

## PR references

- This branch: `claude/priceless-archimedes-f0f1f9`
- Harry's complementary PR: [#122](https://github.com/Dwilar/lita-ehousing/pull/122) (merged into this branch)
