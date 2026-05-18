# intake-hardening — Project Blueprint

## Mission
Make the eHousing application submission pipeline "telegram-bulletproof" so every field a user fills in on the Next.js onboarding flow is persisted intact through `POST /api/v1/applications`, into the `applications` MySQL row, and back out via `GET /api/v1/applications`. Sentinel placeholders like `"not_provided"` and `""` are no longer written by either tier, every drop or coercion emits a structured log under the `submit.intake` logger, and the upsert path preserves prior real values when a re-submission carries empty data.

## Final Architecture

### Backend (FastAPI / SQLAlchemy)
- `POST /api/v1/applications` (`backend/src/interface/http_endpoints.py`) accepts `ApplicationCreateRequest` (`backend/src/interface/schemas.py`) with `model_config = ConfigDict(extra="forbid")` so unknown payload keys yield HTTP 422 with the offending key in the error detail. Plain `email: str = Field(..., min_length=1)` is preserved so the handler-level 400 contract on empty/whitespace email still applies.
- The legacy affordability fields (`property_type`, `purchase_intent`, `budget_range`, `savings`, `income`, `country`, `income_currency`, `employment_status`, `financing_consent`) plus `phone` are `Optional[str] = None` with no `min_length`. A `@model_validator(mode="before")` named `_coerce_sentinel_strings` substitutes `None` for any case-insensitive value matching `{"not_provided", "not provided", "n/a", "na", "none", ""}` (post-strip) on those fields, emitting a `WARNING` under logger `submit.intake` with `[sentinel-coerce] field=<name> sentinel=<repr> → None`.
- `ApplicationResponse` accepts `Optional[str] = None` for the same fields so `null` round-trips back through the JSON response.
- The handler emits one `INFO` line `[intake.field-presence] keys_total=N present=[…] nonempty=[…]` per submission, summarising which keys arrived and which had non-empty trimmed string values.
- `submit_housing_application` (`backend/src/usecase/housing_application.py`) and `HousingApplication` (`backend/src/domain/housing_application.py`) widen the same 10 string fields to `Optional[str] = None`. `normalize_country` is guarded for `None` input.
- `HousingApplicationModel` (`backend/src/infra/mysql/models.py`) marks the same 10 columns `nullable=True`. A runtime helper `ensure_application_legacy_nullable` (`backend/src/infra/mysql/schema.py`) issues idempotent `ALTER TABLE applications MODIFY COLUMN <col> <type> NULL` statements gated by `information_schema.columns` checks; SQLite engines used in unit tests are a soft no-op. The matching SQL migration file is `backend/migrations/012_relax_application_legacy_columns.sql`.
- The repository upsert path (`backend/src/infra/mysql/housing_application_repository.py::create`) merges per column instead of stomping. A column is overwritten only when the incoming value is "meaningful" (non-empty, non-sentinel) OR when both incoming and existing are non-meaningful. Otherwise the prior real value is preserved. Each upsert emits `[intake.merge]` (INFO) with `overwritten=…` and `preserved=…` lists, plus `[intake.merge.preserve]` (WARNING) when at least one column was preserved.

### Frontend (Next.js)
- `frontend/app/application/review/page.tsx` no longer hardcodes the `DEFAULT_SUBMISSION_PLACEHOLDER = "not_provided"` constant. The shared `readStoredApplicationValue` helper now defaults to `null`. Missing affordability fields, missing phone, and missing `metadata.residence_permit_number` are sent as `null` in the JSON body. The review page's UI still displays the human-friendly string `"Not provided"` via inline `?? "Not provided"` at the JSX call site for `<ReviewFormContent>`.
- The outgoing payload no longer includes `created_at` (the backend now rejects it via `extra="forbid"`; the DB supplies `created_at` itself via `func.now()` server default).
- Payload construction is extracted into a top-level `export function buildSubmissionPayload(...)` so it can be unit-tested directly without mounting React.

### Observability
- All new code paths log via the stdlib `logging.getLogger("submit.intake")` channel. The four stable breadcrumbs are:
  - `[sentinel-coerce] field=<name> sentinel=<repr> → None` (WARNING) when a sentinel string is coerced.
  - `[intake.field-presence] keys_total=N present=[…] nonempty=[…]` (INFO) once per submission.
  - `[intake.merge] application_id=<id> overwritten=[…] preserved=[…]` (INFO) on every upsert.
  - `[intake.merge.preserve] application_id=<id> fields=[…]` (WARNING) when an empty/sentinel submission tried to overwrite real values.

### Tests
- `backend/tests/interface/test_application_endpoint.py` gains five tests: sentinel coercion, optional-fields acceptance, unknown-key rejection (`extra="forbid"`), repository merge preservation, and field-presence log emission.
- `backend/tests/test_schema_migrations.py` gains one idempotency test for `ensure_application_legacy_nullable`.
- `frontend/app/application/review/__tests__/payload.test.ts` covers `buildSubmissionPayload` with four assertions: no sentinels, null phone, null `metadata.residence_permit_number`, and no `created_at` in the body.
- The existing 22-test backend application suite continues to pass; full backend suite is 348 passing.

### Deployment
- The fix ships as additive Pydantic + logging changes plus an idempotent runtime ALTER that relaxes 10 columns to NULL on `applications`. The matching `012_relax_application_legacy_columns.sql` mirrors that for offline migration tooling.
- Cloud Run revision rolls forward; old revision can be re-served instantly because the schema changes are forward- and backward-compatible (NULL columns are ignored by old code, which always supplied non-null strings).

## Definition of Done
1. Submitting the live form with a real phone number, country, employment status, and residence permit produces a `GET /api/applications` row containing exactly those values — no `"not_provided"`, no empty strings.
2. Submitting with deliberately missing affordability fields produces structured `WARNING` log entries naming the missing fields.
3. Resubmitting with all sentinels under the same `(full_name, phone)` preserves the prior real values.
4. The full backend test suite passes (348 tests).
5. The new `frontend/app/application/review/__tests__/payload.test.ts` passes (4 tests).
