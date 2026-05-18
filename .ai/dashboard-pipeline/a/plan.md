# Plan — Dashboard Pipeline Fix

Phases: 4
Assessed: yes
Status: COMPLETE

## Phase 1 — DB schema migration
- [x] Add `ensure_application_connected_accounts_column()` to `schema.py`
- [x] Call it from `_ensure_schema_columns()` in `housing_application_repository.py`

## Phase 2 — Docker image fix
- [x] Add `COPY data/ ./data/` to `backend/Dockerfile` so `country_aliases.json` is available

## Phase 3 — Submit handler draft fallback + DB reload
- [x] Add `_has_connected_account_records()` helper to `http_endpoints.py`
- [x] Add `_extract_draft_connected_accounts()` helper to `http_endpoints.py`
- [x] Load draft before building `connected_accounts_payload` in `create_application`
- [x] Fall back to draft tokens when request payload is empty
- [x] Reload application from DB after `submit_housing_application` call
- [x] Add `test_submit_application_uses_draft_connected_accounts_for_plaid_sync`

## Phase 4 — Asset report normalisers
- [x] Add `_normalise_plaid_asset_report_balances()` to `http_endpoints.py`
- [x] Add `_normalise_plaid_asset_report_transactions()` to `http_endpoints.py`
- [x] Dispatch `asset_report_full` in `get_application_account_balances` endpoint
- [x] Dispatch `asset_report_full` in `get_application_transactions` endpoint
