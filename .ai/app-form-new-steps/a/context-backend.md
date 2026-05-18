# Account Connection Step: Backend Contract Map

**Scope**: Account-connection (step 3) endpoints, schemas, ORM models, and service layers for Salt Edge integration, credit report upload, and application submission.

---

## Endpoints

### Salt Edge Account Connection

| Method | Path | Handler File | Purpose |
|--------|------|--------------|---------|
| POST | `/api/saltedge/v6/customer` | `saltedge_endpoints.py:364` | Create or get Salt Edge customer by email (unauthenticated, pre-submit) |
| POST | `/api/saltedge/v6/connect-session` | `saltedge_endpoints.py:394` | Generate widget connect URL with reconnect mode support |
| POST | `/api/saltedge/connection/{connection_id}/persist` | `saltedge_endpoints.py:577` | Record widget-return connection, compute fingerprint, upsert consent |
| POST | `/api/saltedge/customer/{customer_id}/sync` | `saltedge_endpoints.py:761` | Pull all upstream connections and persist new ones (idempotent) |
| DELETE | `/api/saltedge/connection/{connection_id}` | `saltedge_endpoints.py:910` | Soft-delete connection row (removed_at + status='removed') |
| GET | `/api/saltedge/customer/{customer_id}/connections` | `saltedge_endpoints.py:945` | List live SaltEdge connections from DB (not upstream) with accounts |
| GET | `/api/saltedge/connection/{connection_id}` | `saltedge_endpoints.py:1004` | Return single connection details including accounts |

### Application Submission

| Method | Path | Handler File | Purpose |
|--------|------|--------------|---------|
| POST | `/api/v1/applications` | `http_endpoints.py:1980` | Submit full application with intake form + connected_accounts payload |

### Credit Report Upload

| Method | Path | Handler File | Purpose |
|--------|------|--------------|---------|
| GET | `/api/v1/applications/credit-resubmit/validate` | `credit_resubmit_endpoints.py:198` | Validate magic link JWT without consuming (idempotent) |
| POST | `/api/v1/applications/credit-resubmit/redeem` | `credit_resubmit_endpoints.py:242` | Redeem magic link, set HttpOnly cookie (single-use) |
| POST | `/api/v1/applications/{application_id}/credit-report` | `credit_resubmit_endpoints.py:298` | Upload PDF, run PowerCred fraud check, return verdict |

---

## Pydantic Request/Response Schemas

### Salt Edge Account Connection

**File**: `src/interface/saltedge_endpoints.py:75–105`

- **SaltEdgeV6CustomerRequest** (line 80): `email: str`
- **SaltEdgeV6CustomerResponse** (line 83): `customer_id: str`
- **SaltEdgeV6ConnectSessionRequest** (line 86): `customer_id`, `return_to`, `consent_scopes: List[str]`, `categorization`, `reconnect_connection_id: Optional[str]`, `customer_reference: Optional[str]`, `saltedge_provider_code: Optional[str]`
- **SaltEdgeV6ConnectSessionResponse** (line 99): `connect_url`, `expires_at: Optional[str]`, `mode: str` ('create'|'reconnect'), `reconnect_connection_id: Optional[str]`
- **SaltEdgePersistConnectionRequest** (line 107): `connection_id`, `customer_reference` (applicant email), `categorization`, `application_id: Optional[int]`
- **SaltEdgePersistConnectionResponse** (line 122): `consent_id`, `saltedge_connection_id`, `saltedge_customer_id`, `provider_code`, `provider_name`, `categorization`, `status`, `superseded_existing: bool`
- **SaltEdgeSyncCustomerRequest** (line 133): `customer_reference`, `categorization`, `application_id: Optional[int]`
- **SaltEdgeSyncCustomerResponse** (line 148): `persisted: int`, `already_present: int`, `connection_ids: List[str]`

### Application Submission

**File**: `src/interface/schemas.py:84–122`

- **ApplicationCreateRequest** (line 84):
  - Intake fields: `email`, `phone`, `country`, `property_type`, `purchase_intent`, `budget_range`, `savings`, `income`, `income_currency`, `employment_status`, `financing_consent`
  - Personal: `full_name`, `agree_policy`, `receive_updates`
  - Account-connection specific: **`skipped_connect_accounts: bool`**, **`connected_accounts: Dict[str, Any]`** (JSON blob holding Salt Edge/Plaid consents)
  - Optional: `metadata: Optional[Dict[str, Any]]`, `identifier: Optional[str]`
  
- **ApplicationResponse** (line 124): Returns all ApplicationCreateRequest fields plus `id`, `created_at`, `archived`, `review_status`, `credit_score`, `transactions_count`, KYC fields (date_of_birth, profession, etc.)

### Credit Report Upload

**File**: `src/interface/credit_resubmit_endpoints.py:88–89`

- **_RedeemRequest** (line 88): `token: str` (JWT magic link)
- Response bodies: JSON dicts with `error`, `application_id`, `expires_at`, `applicant_email_hash`, `provider_reference_id`

---

## ORM Models

### Postgres (Canonical, via TxBase)

**File**: `src/infra/postgres/models.py`

| Table | File | Key Fields | Purpose |
|-------|------|-----------|---------|
| `applications` | line 196 | `id (PK)`, `email`, `full_name`, `phone`, `country`, `property_type`, **`skipped_connect_accounts` (bool)**, `connected_accounts (Text/JSON)`, `created_at`, `archived`, `review_status`, `credit_upload_status` | Main housing application; persists intake form + skip flag |
| `canonical_financial_accounts` | line 63 | `id (PK)`, `applicant_id (FK to applications.id)`, `provider_name`, `account_type`, `balance_available_usd`, `is_primary` | Normalized bank account snapshot from any provider (Salt Edge, Plaid) |
| `canonical_transactions` | line 93 | `id (PK)`, `applicant_id`, `account_id (FK)`, `provider_transaction_id`, `posted_date`, `amount_usd`, `direction` ('credit'/'debit') | Normalized transaction records |
| `canonical_income_summaries` | line 125 | `id (PK)`, `applicant_id`, `source_type`, `monthly_net_usd`, `detection_method`, `computed_at` | Derived income per applicant |
| `canonical_identity_profiles` | line 154 | `id (PK)`, `applicant_id` | Normalized KYC/identity from PowerCred, holder_info snapshots |
| `raw_provider_payloads` | line 31 | `id (PK)`, `applicant_id`, `provider_name`, `payload_type` ('accounts', 'transactions', 'holder_info'), `payload (Text/JSON)` | Unprocessed blobs from Salt Edge, Plaid (audit trail) |

### MySQL (Consent, via Base)

**File**: `src/infra/mysql/models.py`

| Table | File | Key Fields | Purpose |
|-------|------|-----------|---------|
| `open_banking_consents` | line 90 | `id (PK)`, `provider` ('plaid'/'saltedge'), `customer_reference` (applicant email), `application_id`, `saltedge_customer_id`, **`saltedge_connection_id`**, `saltedge_provider_code`, `account_fingerprint`, `status` ('active'/'removed'), **`removed_at`**, `superseded_by_id` | Live consent registry; one row per bank per applicant; uniqueness enforced by `(customer_reference, provider_code, account_fingerprint)` partial unique index when removed_at IS NULL |

### Postgres (Auth & Draft)

**File**: `src/infra/postgres/models.py`

| Table | File | Key Fields | Purpose |
|-------|------|-----------|---------|
| `application_drafts` | line 272 | `id (PK)`, `email (UNIQUE)`, `current_step`, `draft_data (Text/JSON)` | Multi-step form state (steps 1–4); holds partially-completed connected_accounts |
| `consumed_magic_link_jtis` | line 285 | `jti (PK)`, `application_id`, `created_at` | Single-use magic-link redemption audit; prevents reuse |

---

## Account Connection Flow

### Step-by-step (user perspective)

1. **Frontend initiates**: On step 3, user clicks "Connect Bank Account"
2. **Get/create customer**: `POST /api/saltedge/v6/customer` → receive `customer_id`
3. **Generate widget URL**: `POST /api/saltedge/v6/connect-session` with `customer_id`, `return_to`, `categorization` ('personal'/'business'/'investment') → receive `connect_url` + `expires_at`
4. **User connects in Salt Edge widget**: Redirects to `return_to` URL with `connection_id` query param (v6 may omit this; fallback to sync endpoint)
5. **Frontend persists**: `POST /api/saltedge/connection/{connection_id}/persist` with `connection_id`, `customer_reference` (email), `application_id` (optional)
   - Backend fetches connection + accounts from Salt Edge
   - Computes SHA-256 fingerprint of account IBANs/masked-PANs
   - Upserts row into `open_banking_consents` with `status='active'`
   - If `application_id` is set, spawns background thread to kick off SaltEdge data pull
6. **Sync fallback**: If `connection_id` not in redirect, `POST /api/saltedge/customer/{customer_id}/sync` lists all upstream connections and persists new ones (idempotent)
7. **Skip flow**: User clicks "Skip" → `skipped_connect_accounts=true` in ApplicationCreateRequest

### Backend persistence flow (on persist/sync)

**File**: `saltedge_endpoints.py:581–758` (persist), `761–907` (sync)

```
1. Fetch connection metadata from Salt Edge API (provider_code, provider_name, country_code)
2. Fetch accounts list for dedup fingerprint
3. Compute SHA-256(sorted([iban, masked_pan, account_number, ...]))
4. UpsertQuery:
   - If same (customer_reference, provider_code, fingerprint) exists & is active:
     - Set existing row's superseded_by_id = new_row.id, status='superseded', removed_at=now()
     - Insert new row with status='active'
   - Else: Insert new row with status='active'
5. If application_id provided: Spawn daemon thread → load HousingApplication → call run_submit_saltedge_pull
   - Dedup check: Skip if same application_id kicked off within 30s (TTL)
```

---

## Skip-Step Semantics

**Field**: `HousingApplicationModel.skipped_connect_accounts` (postgres models.py:221)

- **Type**: `Boolean`, default `False`, server_default "0"
- **When set**: User clicks "Skip all" on step 3 or submits form without connecting any accounts
- **Semantics**: 
  - `True` → No bank data required for this applicant; scoring proceeds without financial accounts
  - `False` → Normal flow; if no consents in `open_banking_consents`, application is pending data pull
- **Persistence**: `ApplicationCreateRequest.skipped_connect_accounts` (line 101 schemas.py) → persisted directly on row
- **Draft mode**: `ApplicationDraftModel.draft_data` JSONB can hold sub-flow completion state (e.g., `{"main_account": {"skipped": true}}`)

---

## Salt Edge Service Module

**Primary file**: `src/infra/external_apis/saltedge_client.py`

**Key classes & methods**:

- **SaltEdgeClient** (line 70):
  - `__init__`: Read env vars `SALTEDGE_APP_ID`, `SALTEDGE_SECRET`, `SALTEDGE_PRIVATE_KEY_PEM` or `SALTEDGE_PRIVATE_KEY_PATH`
  - `_sign_request(method, url, body)` → RSA signature for v6 request signing
  - `create_customer(email)` → v6 POST /customers; returns `customer_id` (409 on duplicate handled upstream)
  - `create_connect_session_v6(customer_id, consent_scopes, return_to, reconnect_connection_id)` → v6 POST /connect_sessions; returns `{connect_url, expires_at}`
  - `get_connection(connection_id)` → v6 GET /connections/{id}; returns connection metadata (provider_code, provider_name, customer_id)
  - `list_accounts(customer_id, connection_id)` → v6 GET /accounts; returns list of account dicts
  - `list_connections(customer_id)` → v6 GET /connections; returns list of connection dicts

**Configuration**:
- API base: `https://www.saltedge.com/api/v6`
- Retry policy: up to 2 retries with exponential backoff; max 20s total
- Request timeout: 15s
- OpenTelemetry observability: gated by `ENABLE_OBSERVABILITY` env var

**Repository layer**:
- `src/infra/mysql/saltedge_consent_repository.py`: SQLSaltEdgeConsentRepository
  - `upsert_from_widget_return(connection_id, customer_id, ...)` → atomically insert/supersede
  - `list_live_by_customer_reference(email)` → all active consents for applicant
  - `find_reconnect_candidate(customer_reference, provider_code)` → existing connection for provider (for reconnect mode)
  - `soft_remove(consent_id)` → set removed_at + status='removed'

---

## Feature Flags / Environment Variables

| Env Var | Usage | Default | Notes |
|---------|-------|---------|-------|
| `SALTEDGE_APP_ID` | SaltEdge v6 OAuth app ID | (none) | Required for salt edge client init; missing → 503 unavailable |
| `SALTEDGE_SECRET` | SaltEdge v6 OAuth secret | (none) | Required; missing → SaltEdgeConfigurationError |
| `SALTEDGE_PRIVATE_KEY_PEM` | PEM-encoded RSA private key | (none) | Either PEM or PATH required for request signing |
| `SALTEDGE_PRIVATE_KEY_PATH` | File path to private key | (none) | Alternative to PEM; if both set, PEM takes precedence |
| `SALTEDGE_WEBHOOK_SECRET` | Incoming webhook signature key | "" | For webhook.py (out of step 3 scope) |
| `POWERCRED_ENABLED` | Ship-dark flag for fraud check | "false" | If "false", credit upload returns 503; if "true", PowerCred is called |
| `POWERCRED_API_KEY` | PowerCred API authentication | (none) | Required when POWERCRED_ENABLED=true |
| `POWERCRED_API_URL` | PowerCred endpoint base | https://api.powercred.com | Configurable per environment |
| `POWERCRED_TIMEOUT_S` | PowerCred request timeout | 10 | Seconds |
| `ENABLE_OBSERVABILITY` | OpenTelemetry span export | "false" | Enables external.saltedge.* traces when true |

---

## Existing Tests

### Interface Layer

**File**: `backend/tests/interface/test_saltedge_post_connect_kick_off.py`
- Covers: `POST /api/saltedge/connection/{id}/persist`, `POST /api/saltedge/customer/{id}/sync`
- Asserts: dedup guard, post-connect hook spawn, loaded application passed to pull thread
- Setup: creates application via POST /api/v1/applications, mocks Salt Edge client, mocks threading.Thread

**File**: `backend/tests/interface/test_credit_resubmit_endpoints.py`
- Covers: `GET /credit-resubmit/validate`, `POST /credit-resubmit/redeem`, `POST /{app_id}/credit-report`
- Asserts: magic-link validation, cookie auth, rate limit (5/hour), PowerCred fraud check, PDF magic bytes
- Setup: mocks PowerCredClient, monkeypatches POWERCRED_ENABLED, creates test token

**File**: `backend/tests/interface/test_application_endpoint.py`
- Covers: `POST /api/v1/applications` with full payload (intake + connected_accounts)
- Asserts: field presence, policy consent, connected_accounts persistence, draft fallback on missing accounts

### Usecase Layer

**File**: `backend/tests/usecase/test_bank_data_pull_saltedge.py`
- Covers: `run_submit_saltedge_pull(application, trigger)`
- Asserts: lists live consents from DB, calls SaltEdge API per connection, upserts canonical records (accounts, transactions, income)

**File**: `backend/tests/usecase/test_account_detection.py`
- Covers: account type classification (main, business, investment)
- Asserts: infer_account_coverage categorizes canonical accounts

---

## Integration Points with Other Steps

### Step 1 & 2 (Intake Form)
- Draft saved to `application_drafts` table
- Loaded on step 3 if no connected_accounts submitted yet (http_endpoints.py:2050)

### Step 4 (Review & Submit)
- Application submitted with final connected_accounts + skipped_connect_accounts flags
- Daemon thread kicks off SaltEdge pull (bank_data_pull.py)
- Credit upload may be triggered out-of-band via magic link if fraud detected

### Credit Scoring (Post-Submit)
- Canonical records (accounts, transactions, income summaries) feed credit model
- Address + identity populated from canonical_identity_profiles (PowerCred OCR) or manual KYC

---

## Key Contracts for Frontend Rewrite

1. **Consent upsert is idempotent**: Multiple calls to persist/sync with the same connection_id → same DB row
2. **Dedup by (customer_reference, provider_code, account_fingerprint)**: Same bank, same applicant, same accounts → one active row
3. **Reconnect mode**: When user reconnects a provider, pass `reconnect_connection_id` to avoid duplicate rows
4. **Skip flag is binary**: Set `skipped_connect_accounts=true` if all sub-flows skipped
5. **Magic link is single-use**: Redeem endpoint atomically inserts JTI; second redeem → 410 Gone
6. **PowerCred fraud check is ship-dark**: If POWERCRED_ENABLED=false, upload returns 503
7. **Rate limit on upload**: 5 attempts per hour per application_id
8. **Fingerprint is optional**: If SaltEdge list_accounts fails, dedup still proceeds (null fingerprint)

---

**Last updated**: 2026-05-12  
**Scope**: Account-connection step (step 3) backend surface for UI redesign contract compatibility  
**Length**: ~380 lines

