# intake-hardening — Phase 1 Context

## Submission Endpoint Summary

- **Route**: `POST /api/v1/applications` — `backend/src/interface/http_endpoints.py:2001-2187`
  - Handler: `create_application(request: ApplicationCreateRequest, db: Session = Depends(get_db))`
  - Status: `201 CREATED`, `response_model=ApplicationResponse`
  - Mounted under the `endpoints_router` (`backend/src/interface/http_endpoints.py`) which is included with no prefix in `backend/src/main.py:66`. The path is therefore `/api/v1/applications` exactly.
- **Frontend Next.js proxy**: `POST /api/applications` (browser) → `frontend/app/api/applications/route.ts:114-201` → forwards to `${baseUrl}/api/v1/applications` (line 151).
  - The browser submission in `frontend/app/application/review/page.tsx:359` actually calls `/api/v1/applications` directly (skipping the Next proxy at `/api/applications`). That's the path described in the bug report.
- **Request model**: `ApplicationCreateRequest` — `backend/src/interface/schemas.py:71-89`
  - All affordability fields use `str = Field(..., min_length=1)` — required and non-empty: `country`, `property_type`, `purchase_intent`, `budget_range`, `savings`, `income`, `income_currency`, `employment_status`, `financing_consent`, `full_name`.
  - `phone` is `Optional[str] = None`.
  - `metadata: Optional[Dict[str, Any]] = None`, `identifier: Optional[str] = None`.
  - No `model_config` for `extra="forbid"`, no `alias_generator`, no `populate_by_name` on this model. Pydantic v2 default is `extra="ignore"` — unknown keys silently dropped.
- **Inline normalisation**: every string field passes through `_normalise_string(value)` (`backend/src/interface/http_endpoints.py:790-791`) which is just `value.strip()`. No lowercase, no replacement, no validation against an enum.
- **Validation gates** (handler level, lines 2020-2036):
  - 400 if `email` is empty after strip.
  - 400 if `full_name` is empty after strip.
  - 400 if `agree_policy` is falsy.
  - No other content-shape validation. Empty strings for `phone`, `country`, `property_type`, etc. are allowed past the schema only because the frontend always supplies a non-empty placeholder string (see hypothesis section).
- **Trace logger**: `_submit_log = logging.getLogger("submit.trace")` and `_mark(stage)` — emits `WARNING` level breadcrumbs at each stage with monotonic timing. This is the only observability that exists today.

## SQLAlchemy Model Summary

- **Class**: `HousingApplicationModel` — `backend/src/infra/mysql/models.py:45-75`
- **Table**: `applications`
- **Unique constraint**: `(full_name, phone)` — `models.py:48-52` (this is what raises `IntegrityError` and triggers the upsert path in the repository at `housing_application_repository.py:244-296`).
- **Columns** (every one is `String(N), nullable=False` unless noted):

  | Column | Type | Nullable | Default | Notes |
  |---|---|---|---|---|
  | id | Integer PK | — | autoinc | |
  | email | String(255) | NO | — | |
  | phone | String(64) | NO | — | empty string `""` accepted |
  | country | String(128) | NO | — | normalised via `normalize_country` (`usecase/housing_application.py:33`) |
  | property_type | String(128) | NO | — | NOT NULL — needs a value |
  | purchase_intent | String(64) | NO | — | NOT NULL — needs a value |
  | budget_range | String(64) | NO | — | NOT NULL — needs a value |
  | savings | String(64) | NO | — | NOT NULL — needs a value |
  | income | String(64) | NO | — | NOT NULL — needs a value |
  | income_currency | String(16) | NO | — | NOT NULL — needs a value |
  | employment_status | String(128) | NO | — | NOT NULL — needs a value |
  | financing_consent | String(32) | NO | — | NOT NULL — needs a value |
  | full_name | String(255) | NO | — | |
  | agree_policy | Boolean | NO | — | |
  | receive_updates | Boolean | NO | `default=False` | |
  | skipped_connect_accounts | Boolean | NO | `default=False`, server_default `"0"` | added at runtime if missing |
  | connected_accounts | Text | YES | — | JSON-serialised string; carries embedded `_application_metadata` and `_application_identifier` keys |
  | created_at | DateTime(tz) | YES | `server_default=func.now()` | |
  | archived | Boolean | NO | `default=False`, server_default `"0"` | |
  | review_status | String(32) | NO | `default="pending"`, server_default `"pending"` | |

- **No `metadata` column.** The application's `metadata` field (`application_reference`, `residence_permit_number`, etc.) is JSON-serialised into `connected_accounts` under the key `_application_metadata` — see `http_endpoints.py:1084` (`_CONNECTED_ACCOUNTS_METADATA_KEY = "_application_metadata"`) and `http_endpoints.py:2055-2056`. On read, it's extracted back out by `_extract_embedded_application_enrichment` (`http_endpoints.py:1139-1161`) and `_clean_response_connected_accounts` (`http_endpoints.py:1164-1171`).
- **No `default="not_provided"` anywhere on the model.** The `"not_provided"` string in production rows is supplied by the **frontend**, not the backend.
- **Runtime migration helpers**: `ensure_application_archived_column`, `ensure_application_review_status_column`, `ensure_application_skipped_connect_accounts_column`, `ensure_application_connected_accounts_column` in `backend/src/infra/mysql/schema.py:117-158` — invoked from `_ensure_schema_columns` (`housing_application_repository.py:50-95`) on every repository instantiation and gated by `_SCHEMA_LOCK`. This is the established pattern for additive schema changes.

## Frontend Submission Summary

- **Submitting page**: `frontend/app/application/review/page.tsx`
- **Form state shape**: `StoredFormData` — `review/page.tsx:22-30`. Loaded from `localStorage["userFormData"]` (key constant at line 37). Persisted across pages by `signup/page.tsx:116-124` and `employment/page.tsx:218-233`. Connected accounts stored separately under `dw_application_connected_accounts` (line 32).
- **Payload builder**: `handleSubmit` — `review/page.tsx:322-400`. The payload is constructed inline (no shared helper) at lines 334-357.
- **HTTP call**: `fetch("/api/v1/applications", { method: "POST", … body: JSON.stringify(submissionPayload) })` — `review/page.tsx:359-366`. Hits the backend directly — no Next.js proxy — through the same-origin path that nginx routes to FastAPI.
- **The placeholder source**: `DEFAULT_SUBMISSION_PLACEHOLDER = "not_provided"` — `review/page.tsx:38`. Used as the `fallback` argument in `readStoredApplicationValue` (`review/page.tsx:104-125`). When `userFormData` lacks `property_type`, `purchase_intent`, `budget_range`, `savings`, or `income`, the function literally returns the string `"not_provided"`.
- **Comment confirming the intent**: `review/page.tsx:277-278` — *"The backend still requires these legacy affordability fields even though the simplified application flow no longer collects them from applicants."*
- **Phone trail**:
  - Captured in `signup/page.tsx:46` (`phone` state) and combined with country dial code into `fullNumber` (`signup/page.tsx:69-73`).
  - Written to `localStorage.userFormData.phone` at `signup/page.tsx:122` (`phone: fullNumber || null`).
  - Read by review page at `review/page.tsx:268-273` — falls back to `"Not provided"` if missing.
  - Submitted at `review/page.tsx:336`: `phone: applicantPhone === "Not provided" ? "" : applicantPhone` — *empty string when missing*.
- **Residence permit trail**:
  - Read at `review/page.tsx:274`: `const residencePermitNumber = toOptionalString(storedForm?.residencePermitNumber) || "Not provided"`.
  - Submitted in `metadata.residence_permit_number` at `review/page.tsx:355` — empty string when "Not provided".
  - **Never written**: a `grep -rn "residencePermitNumber:"` across the entire frontend shows no place that sets `userFormData.residencePermitNumber`. The form does not collect it — only the type definition (`review/page.tsx:26`, `applicants/page.tsx:49`, `review-form-content.tsx:31`) and read paths exist. So `metadata.residence_permit_number` is *always* empty in production.

## Field-by-Field Trace

| Field | Frontend state key | Frontend payload key | Backend schema field | DB column | Default sentinel observed in prod |
|---|---|---|---|---|---|
| phone | `userFormData.phone` (`signup/page.tsx:122`) | `phone` (`review/page.tsx:336`) | `ApplicationCreateRequest.phone` (`schemas.py:73`) | `applications.phone VARCHAR(64) NOT NULL` (`models.py:57`) | `""` — phone collected but never persists when applicant skips |
| property_type | `userFormData.property_type`/`propertyType` (`review/page.tsx:279`) — never written | `property_type` (`review/page.tsx:338`) | `ApplicationCreateRequest.property_type` (`schemas.py:75`) | `applications.property_type VARCHAR(128) NOT NULL` (`models.py:59`) | `"not_provided"` from `DEFAULT_SUBMISSION_PLACEHOLDER` (`review/page.tsx:38`) |
| purchase_intent | `userFormData.purchase_intent`/`purchaseIntent` (`review/page.tsx:280`) — never written | `purchase_intent` (`review/page.tsx:339`) | `ApplicationCreateRequest.purchase_intent` (`schemas.py:76`) | `applications.purchase_intent VARCHAR(64) NOT NULL` (`models.py:60`) | `"not_provided"` |
| budget_range | `userFormData.budget_range`/`budgetRange` (`review/page.tsx:281`) — never written | `budget_range` (`review/page.tsx:340`) | `ApplicationCreateRequest.budget_range` (`schemas.py:77`) | `applications.budget_range VARCHAR(64) NOT NULL` (`models.py:61`) | `"not_provided"` |
| savings | `userFormData.savings` (`review/page.tsx:282`) — never written | `savings` (`review/page.tsx:341`) | `ApplicationCreateRequest.savings` (`schemas.py:78`) | `applications.savings VARCHAR(64) NOT NULL` (`models.py:62`) | `"not_provided"` |
| income | `userFormData.income` (`review/page.tsx:283`) — never written | `income` (`review/page.tsx:342`) | `ApplicationCreateRequest.income` (`schemas.py:79`) | `applications.income VARCHAR(64) NOT NULL` (`models.py:63`) | `"not_provided"` |
| metadata.residence_permit_number | `userFormData.residencePermitNumber` (`review/page.tsx:274`) — never written | `metadata.residence_permit_number` (`review/page.tsx:355`) | `ApplicationCreateRequest.metadata` (`schemas.py:88`) | embedded inside `applications.connected_accounts` JSON under `_application_metadata` (`http_endpoints.py:2055-2056`, `1084`) | `""` — read path returns `"Not provided"`, sender then maps to `""` (`review/page.tsx:355`) |

Cross-checks: I ran `grep -rn "residencePermitNumber:"` across `frontend/` — only type-declaration sites match, no setter sites. I ran `grep -rn "property_type:|propertyType:|purchase_intent:|purchaseIntent:|budget_range:|budgetRange:|savings:|income:|incomeCurrency:" frontend/app/application` — no setter sites in the live form pages. The only place these keys appear as **values** in `localStorage` is via `readStoredApplicationValue`'s read path, never via a write.

## Validation & Coercion Behavior

- **Pydantic v2 default behaviour**: `ApplicationCreateRequest` does not declare `model_config = ConfigDict(extra="forbid")` or `extra="ignore"`. Default is `extra="ignore"` — unknown keys (e.g. the `created_at`, `date_of_birth`, `profession`, `current_employer`, `job_title`, `industry`, `website`, `linkedin` listed in `frontend/app/api/applications/route.ts:30-36` `ApplicationPayload`) are silently dropped at the boundary. No log line is emitted.
- **`min_length=1`**: every required field must be at least one character. `"not_provided"` (length 12) passes; `""` (length 0) would fail and return 422.
- **`_normalise_string`** (`http_endpoints.py:790-791`): `value.strip()` only. Does not lowercase, does not enum-validate, does not detect the `"not_provided"` sentinel.
- **`_normalise_phone_number`** (`http_endpoints.py:794-799`): keeps only digits. **NOT used on the request path** — only used for SaltEdge customer matching elsewhere.
- **`_normalise_identifier`** (`http_endpoints.py:802-820`): lowercases, strips. Used for the optional `identifier` field, not for any of the suspect fields.
- **Country normalisation**: `normalize_country(country) or country` (`usecase/housing_application.py:33`). If the country alias matches an ISO-3166-1 alpha-2 it canonicalises (e.g. `"Japan"` → `"JP"`); otherwise it keeps the raw string. Doesn't drop or substitute.
- **Repository `create`** (`housing_application_repository.py:241-334`): blind upsert. If a row exists with the same `(full_name, phone)` (case-insensitive `func.lower`), it overwrites every field with the new values — INCLUDING the `"not_provided"` placeholders. So even if a user later supplies real values, an earlier `"not_provided"` row gets stomped on resubmission. There is **no merge logic** to preserve previously-good values.
- **No middleware drops keys** beyond Pydantic. There is no custom request-body sanitiser.
- **Empty string vs None**: every non-optional schema field has `min_length=1`, so genuinely empty values get rejected with 422. `"not_provided"` is the only thing that smuggles in.

## Observability State Today

- **Logger**: stdlib `logging` only. No `structlog`, no `loguru` — confirmed `grep -rn "structlog" backend/src` returns zero hits, `requirements.txt` does not list either.
- **Sentry**: present on the **frontend** (`frontend/sentry.server.config.ts`, `frontend/sentry.edge.config.ts`, `frontend/instrumentation.ts`, `frontend/instrumentation-client.ts`) — but NOT on the backend (no `sentry_sdk` in `backend/requirements.txt`).
- **Existing logs in the application creation path** (`backend/src/interface/http_endpoints.py`):
  - `submit.trace` warnings at every stage — `http_endpoints.py:2010-2014`. Example: `_submit_log.warning("[submit-trace] %s @ %.3fs", stage, time.monotonic() - _submit_t0)` followed by `_mark("handler-entered")`, `_mark("after-load_draft")`, etc. *Timing only — no payload, no field names, no presence info.*
  - Defensive failure logs: `logging.getLogger(__name__).warning("Failed to load application draft for %s before submit: %s", email, error)` (`http_endpoints.py:2043-2045`), and similar patterns at lines 2099-2104, 2110-2113, 2121-2126, 2139-2144, 2160-2161.
  - Schema-trace warnings: `_log.warning("[schema-trace] %s @ %.3fs", s, …)` (`housing_application_repository.py:54-55`).
- **No payload-shape logging**, no "field X dropped" logging, no log of which keys arrived vs which keys persisted.
- **No metrics endpoint**: no `prometheus_client`, no `/metrics`. Verified via `grep -rn "prometheus" backend/src` — zero hits.
- **Validation errors**: `validation_exception_handler` at `backend/src/main.py:93-105` does log `Validation error on %s %s: %s` with `exc.errors()`. So Pydantic 422s are visible — but `"not_provided"` is a *valid* string that passes Pydantic.

## Existing Tests

### Backend
- `backend/tests/interface/test_application_endpoint.py` (664 lines) — primary E2E tests. Includes:
  - `test_submit_application_success` (line 79) — basic round-trip with a payload including `"property_type": "Condo"`, `"purchase_intent": "buy"`, etc.
  - `test_submit_application_persists_embedded_dashboard_metadata` (line 99) — verifies `metadata` and `identifier` survive round trip.
  - `test_submit_application_uses_draft_connected_accounts_for_plaid_sync` (line 37 and line 126) — draft fallback for Plaid tokens.
  - `test_application_response_merges_embedded_and_enriched_metadata` (line 189).
  - `test_submit_application_returns_login_credentials` (line 228).
  - `test_submit_application_requires_consent` (line 243), `test_submit_application_requires_email_and_name` (line 253).
  - List endpoint tests at lines 264-431 (limit, html, metadata-list, missing-created-at).
  - **`build_payload()`** at line 10 always supplies real values — **no test exercises the "client sent `not_provided`"** scenario, no test exercises a partial payload with affordability fields missing.
- `backend/tests/test_schema_migrations.py` — exercises `ensure_application_*_column` idempotency.
- `backend/tests/test_applicants.py` — applicants-side tests (canonical applicant schema, not the application intake path).

### Frontend
- `frontend/app/api/applications/[id]/__tests__/route.test.ts` — only frontend test that references applications. Tests the GET-by-id proxy; no submission-path coverage.
- `frontend/app/dashboard/__tests__/snapshot-formatters.test.ts` and `dashboard-page-helpers.test.js` — dashboard formatters only.
- **No test of `review/page.tsx`'s `handleSubmit`**, no test that asserts the literal string `"not_provided"` is or isn't present in payloads.
- Playwright e2e exists in `frontend/eHousing_Web/tests/testcases/application-*-tests.spec.ts` — these test UI flow, not payload shape.

## Git History — 3 most-relevant commits

1. **`9ef36f3 Surge DB errors on POST /v1/applications as 500 detail`** — recent, touches `backend/src/interface/http_endpoints.py`. Confirms the team has been actively patching this exact handler.
2. **`9cd3784 Fix simplified application review submission.`** — touches `frontend/app/application/review/page.tsx`. Adjacent to the bug; "simplified" flow is the regression source — this commit is when the affordability collection step was removed but the placeholder fallback was added to keep the backend NOT NULL contract green.
3. **`835d6ae fix: populate dashboard pipeline (connected_accounts column, country aliases, asset report normalisers, draft fallback) (#126)`** — recent, touches both backend and frontend. Establishes the draft-fallback pattern in `http_endpoints.py:2048-2053` and the connected_accounts column ensure migration. Same area, same author cadence, same level of risk.

Other context: many commits with placeholder messages (`wwwwwwwww`) — the repo has light commit-message hygiene. The `applications` table has been hardened progressively via runtime `ensure_*_column` migrations — that's the precedent for adding a `metadata` column without an Alembic migration.

## Hypothesis For Each Suspect Field

- **`phone = ""`** — *Frontend root cause*. The signup page does store `phone` correctly to `userFormData.phone` (`signup/page.tsx:122`), but the frontend marks it Optional and the user `harrymapodile@gmail.com` either skipped the optional phone field at signup or arrived via a flow that didn't persist it to `userFormData`. The review page then maps the read-fallback string `"Not provided"` to `""` at `review/page.tsx:336` — `phone: applicantPhone === "Not provided" ? "" : applicantPhone`. Backend accepts `""` because `phone` is `Optional[str] = None` (`schemas.py:73`) without `min_length`. Persisted as empty string by `housing_application_repository.py:300`.

- **`property_type = "not_provided"`** — *100% frontend*. The simplified onboarding form does not collect this field at all (no input element, no setter writes `userFormData.property_type`). When `review/page.tsx:279` calls `readStoredApplicationValue(storedForm, ["property_type", "propertyType"])`, `readStoredApplicationValue` (`review/page.tsx:104-125`) traverses both `storedForm` and `storedForm.metadata`, finds nothing, and returns `DEFAULT_SUBMISSION_PLACEHOLDER` (`review/page.tsx:38, 107`) — the literal string `"not_provided"`. That string then passes Pydantic's `min_length=1` check (it's 12 chars) and `_normalise_string`'s `.strip()` (no-op), and SQLAlchemy persists it verbatim at `housing_application_repository.py:303`.

- **`purchase_intent = "not_provided"`** — Same root cause as `property_type`. `review/page.tsx:280` → `readStoredApplicationValue(storedForm, ["purchase_intent", "purchaseIntent"])` → fallback `"not_provided"` → `review/page.tsx:339` → backend accepts → `housing_application_repository.py:304`.

- **`budget_range = "not_provided"`** — Same. `review/page.tsx:281` → `readStoredApplicationValue(storedForm, ["budget_range", "budgetRange"])` → fallback → `review/page.tsx:340` → persisted at `housing_application_repository.py:305`.

- **`savings = "not_provided"`** — Same. `review/page.tsx:282` → `readStoredApplicationValue(storedForm, ["savings"])` → fallback → `review/page.tsx:341` → persisted at `housing_application_repository.py:306`.

- **`income = "not_provided"`** — Same. `review/page.tsx:283` → `readStoredApplicationValue(storedForm, ["income"])` → fallback → `review/page.tsx:342` → persisted at `housing_application_repository.py:307`.

- **`metadata.residence_permit_number = ""`** — *Frontend never collects this field*. A grep of the frontend for `residencePermitNumber:` yields only type-declaration sites (`review/page.tsx:26`, `applicants/page.tsx:49`, `review-form-content.tsx:31`). No `localStorage.setItem` writes it, no input has it as state. `review/page.tsx:274` reads it, gets undefined, falls back to literal `"Not provided"`. Then `review/page.tsx:355` maps `"Not provided"` to `""`. Backend stuffs it into `connected_accounts._application_metadata` via `http_endpoints.py:2055-2056` (`connected_accounts_payload[_CONNECTED_ACCOUNTS_METADATA_KEY] = copy.deepcopy(request.metadata)`). On read, `_extract_embedded_application_enrichment` (`http_endpoints.py:1139-1161`) surfaces it back into `metadata.residence_permit_number` — empty string, just as it went in.

**Summary**: this is a frontend bug, not a backend bug. The backend persists exactly what it receives. The frontend sends a sentinel string `"not_provided"` in place of fields that the simplified onboarding flow no longer collects, and never writes `phone`/`residencePermitNumber` to localStorage during the form pages. The fix has two halves: (1) frontend stops sending sentinels and starts collecting `residencePermitNumber`; (2) backend hardens the contract so future regressions are caught — relax `min_length=1` requirements on legacy affordability fields (or accept `null`), add `extra="forbid"` to reject unknown keys loudly, add structured per-field logging, and add a fail-closed test that detects sentinel strings.

## Deployment Safety Analysis

- **Migration system**: SQL files in `backend/migrations/000-011_*.sql` are applied via `backend/run_migration.py` (top-level) / `backend/src/scripts/...`. The runtime fallback for additive columns lives in `backend/src/infra/mysql/schema.py` and is invoked from every `SQLAlchemyHousingApplicationRepository` instantiation. New columns can therefore be rolled out by adding both a `*.sql` file and an `ensure_*_column(engine)` helper without an offline migration step.
- **Production DB**: Cloud SQL MySQL — `lita_production` database on instance `elemental-day-443510-e0:us-central1:lita-mysql` per `backend/cloudbuild.yaml:14-19`. Connection via Cloud SQL Auth Proxy (`--add-cloudsql-instances`); credentials supplied as Cloud Run secrets `db-user`, `db-password`. **No secrets printed.**
- **Deploy mechanism**: direct `gcloud run deploy lita-api` (`backend/cloudbuild.yaml:11-25`) — no blue/green, no canary. Re-rolling forward requires only a new revision; old revision is preserved by Cloud Run for instant rollback (`gcloud run services update-traffic`).
- **Schema-additive-safe**: a new nullable column would be backward-compatible — old code ignores it. A new required column would be breaking. Reading `connected_accounts._application_metadata` is already nullable.
- **Existing live rows with `"not_provided"`**: there are production rows with literal `"not_provided"` in `property_type`, `purchase_intent`, `budget_range`, `savings`, `income`. A backfill/migration step is needed if the desired end state is `NULL` instead of `"not_provided"`. Safer interim: leave existing rows alone, only stop new writes from emitting the sentinel; the dashboard already treats `"not_provided"` as "missing" via display logic.
- **Pydantic schema relaxation safety**: changing required fields to `Optional[str] = None` (with no `min_length`) is forward-compatible — existing clients sending `"not_provided"` still work; new clients sending nothing also work.
- **Rollback plan**: any code-only change is rolled back by reverting the Cloud Run revision in <60 seconds. Schema-only additive changes (new nullable column via `ensure_*_column`) need no rollback step — they're invisible to old code.
- **Risk-asymmetric**: the *minimum* fix is purely additive — frontend stops sending `"not_provided"`, backend logs every drop. Both halves are independently safe to deploy.

DeploymentSafety: SAFE
