# intake-hardening — Implementation Plan

> All paths in this plan have been verified to exist on disk via `ls -la` against
> the worktree root `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/zen-solomon-13f3f4/`.
> Cited line numbers were sampled from the live files prior to writing this plan
> and reflect the as-of-Phase-1 state.

## Status

Phases: 6
- [ ] Phase 4a — Backend schema + sentinel coercion (`schemas.py`)
- [ ] Phase 4b — Backend DB nullable migration + ORM model
- [ ] Phase 4c — Backend repo merge logic + handler field-presence logging
- [ ] Phase 4d — Frontend payload sentinel removal (`review/page.tsx`)
- [ ] Phase 4e — Tests (backend + frontend)
- [ ] Phase 4f — CHANGELOG + about.md update

## Rollback Plan

All backend code changes (Pydantic schema, handler logging, repo merge logic, ORM
nullability flags) ship in one Cloud Run revision and are reverted by re-routing
traffic to the previous revision (`gcloud run services update-traffic lita-api`)
in <60 s. The runtime nullable-column migration is forward-compatible — old code
still reads/writes the columns whether they are NULL or NOT NULL — so no
schema rollback step is required; the `ALTER TABLE ... MODIFY COLUMN ... NULL`
remains in place safely. The frontend change is a static asset rebuild that
ships with the next Vercel/Cloud Run deploy and is rolled back the same way.

---

## Phase 4a — Backend schema + sentinel coercion

### Files to touch
- `backend/src/interface/schemas.py` (lines 1, 71-89, 92-116) — add `field_validator` import, add `model_config = ConfigDict(extra="forbid")` to `ApplicationCreateRequest`, relax legacy fields to `Optional[str] = None`, install sentinel-coercing pre-validator. Relax matching fields on `ApplicationResponse`.

### Steps

1. In `backend/src/interface/schemas.py:1`, extend the existing pydantic import to include `field_validator` and `model_validator`:
   ```python
   from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
   ```

2. In `ApplicationCreateRequest` (`schemas.py:71-89`), replace the body so that:
   - The class declares `model_config = ConfigDict(extra="forbid")` as its first member.
   - `email`, `full_name` keep `Field(..., min_length=1)`.
   - `agree_policy: bool` stays required (no default).
   - All of these become `Optional[str] = None` with NO `min_length`:
     `phone` (already optional, leave as is), `country`, `property_type`, `purchase_intent`,
     `budget_range`, `savings`, `income`, `income_currency`, `employment_status`,
     `financing_consent`.
   - `receive_updates`, `skipped_connect_accounts`, `connected_accounts`, `metadata`,
     `identifier` keep their existing definitions.

3. In the same class, add a single `@model_validator(mode="before")` named
   `_coerce_sentinel_strings` that:
   - Iterates the incoming dict (`if not isinstance(values, dict): return values`).
   - For every value that is a string, checks (case-insensitive, post-`strip()`) against
     the set `{"not_provided", "not provided", "n/a", "na", "none", ""}`.
     If matched, replaces the value with `None` and emits
     `logging.getLogger("submit.intake").warning("[sentinel-coerce] field=%s sentinel=%r → None", field, raw)`.
   - The set of fields to which this is applied is restricted to the legacy
     affordability fields plus `phone`, `country`, `income_currency`, `employment_status`,
     `financing_consent` (i.e. only the optional string fields — DO NOT coerce
     `email` or `full_name`, which must fail loudly).
   - Returns the (possibly mutated) dict.

4. In `ApplicationResponse` (`schemas.py:92-116`), relax these to `Optional[str] = None`
   so `null` round-trips back through the JSON response:
   `country`, `property_type`, `purchase_intent`, `budget_range`, `savings`, `income`,
   `income_currency`, `employment_status`, `financing_consent`. Leave `email`, `full_name`
   non-optional.

5. Do NOT touch `PhoneApplicationCreateRequest` (`schemas.py:59-61`) or any other
   model. Scope of this phase is only `ApplicationCreateRequest` /
   `ApplicationResponse`.

### Acceptance criteria

- `pytest backend/tests/interface/test_application_endpoint.py::test_submit_application_success`
  still passes unchanged.
- A POST with `{"property_type": "not_provided"}` triggers a WARNING log line
  containing `field=property_type` and the request is accepted (validation passes).
- A POST with an unknown key (e.g. `"date_of_birth": "1990-01-01"`) returns HTTP 422
  with the field name in the error detail.
- A POST omitting all legacy affordability fields entirely (only `email`,
  `full_name`, `agree_policy`) is accepted by the schema layer (handler-level
  rules still apply downstream).
- The pre-validator never coerces `email` or `full_name`.

### Risks

- A request that legitimately contains the literal string `"none"` in
  `employment_status` (e.g. an applicant typing it as a free-text answer) would
  be coerced to `None`. Risk acceptable per Phase 1 context — these are coded
  enum-like fields, not free text. Documented in code comment above the validator.

---

## Phase 4b — Backend DB nullable migration + ORM model

### Files to touch
- `backend/src/infra/mysql/schema.py` (lines 1-25, 117-158 — new helper appended at end of module).
- `backend/src/infra/mysql/housing_application_repository.py` (lines 20-25, 50-95 — extend imports and `_ensure_schema_columns`).
- `backend/src/infra/mysql/models.py` (lines 45-75 — `HousingApplicationModel` columns).
- `backend/migrations/012_relax_application_legacy_columns.sql` (new file, follows existing 000-011 numbering).

### Steps

1. In `backend/src/infra/mysql/schema.py`:
   - At the top of the module (after `_USER_APPLICATION_ID_COLUMN` block ~line 19) add a constant:
     ```python
     _APPLICATION_LEGACY_NULLABLE_COLUMNS: tuple[tuple[str, str], ...] = (
         ("phone", "VARCHAR(64)"),
         ("country", "VARCHAR(128)"),
         ("property_type", "VARCHAR(128)"),
         ("purchase_intent", "VARCHAR(64)"),
         ("budget_range", "VARCHAR(64)"),
         ("savings", "VARCHAR(64)"),
         ("income", "VARCHAR(64)"),
         ("income_currency", "VARCHAR(16)"),
         ("employment_status", "VARCHAR(128)"),
         ("financing_consent", "VARCHAR(32)"),
     )
     ```
   - At the end of the module, add a new helper following the same exception-
     handling pattern as `_ensure_column` (lines 68-114):
     ```python
     def ensure_application_legacy_nullable(engine: Engine) -> None:
         """Relax legacy affordability columns on `applications` to NULL-able.

         Idempotent: skips columns that are already nullable. Inspects
         `information_schema.columns` (MySQL) — falls back to PRAGMA
         `table_info` for SQLite engines used in unit tests.
         """
     ```
     Implementation contract:
       - Resolve the dialect via `engine.dialect.name`.
       - For MySQL: query
         ```
         SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'applications'
         ```
         and for each column in `_APPLICATION_LEGACY_NULLABLE_COLUMNS` whose
         current `is_nullable` is `'NO'`, issue
         `ALTER TABLE applications MODIFY COLUMN <col> <vartype> NULL`. Wrap in
         `engine.begin()`.
       - For SQLite (unit-test path): use `inspect(engine).get_columns("applications")`
         and only ATTEMPT the ALTER if a column is `nullable=False`. SQLite cannot
         `MODIFY COLUMN`, so emit `logger.debug` and return without raising — the
         existing legacy-table fixture in `backend/tests/test_schema_migrations.py`
         already creates columns as `nullable=False`; the unit test for this
         helper will assert the SQLite path is a soft no-op (see Phase 4e).
       - Catch `SQLAlchemyError` per column, route through `_is_missing_table_error`
         (line 52) — log and continue.
       - On success per column emit `logger.info("Relaxed '%s' on 'applications' to NULL")`.

2. In `backend/src/infra/mysql/housing_application_repository.py`:
   - Update the import block (lines 20-25) to include the new helper:
     ```python
     from src.infra.mysql.schema import (
         ensure_application_archived_column,
         ensure_application_connected_accounts_column,
         ensure_application_legacy_nullable,
         ensure_application_review_status_column,
         ensure_application_skipped_connect_accounts_column,
     )
     ```
   - In `_ensure_schema_columns` (lines 50-95), inside the
     `if "applications" in table_names:` branch (line 70), add a new call after
     `ensure_application_connected_accounts_column(engine)` at line 78 and its
     `_mk("after-connected-accounts-col")`:
     ```python
     ensure_application_legacy_nullable(engine)
     _mk("after-legacy-nullable")
     ```

3. In `backend/src/infra/mysql/models.py:45-75`, change `nullable=False` to
   `nullable=True` on EXACTLY the following columns of `HousingApplicationModel`:
   `phone` (line 57), `country` (line 58), `property_type` (line 59),
   `purchase_intent` (line 60), `budget_range` (line 61), `savings` (line 62),
   `income` (line 63), `income_currency` (line 64), `employment_status` (line 65),
   `financing_consent` (line 66). DO NOT change `email`, `full_name`,
   `agree_policy`, the `created_at` server default, the unique constraint at
   lines 47-53, or any other column.

4. Create `backend/migrations/012_relax_application_legacy_columns.sql` — a single
   self-contained SQL migration matching the style of `004_ensure_applicants_columns.sql`:
   ```
   -- Relax legacy affordability columns on `applications` to NULL-able.
   -- Idempotent: re-running is a no-op once columns already permit NULL.
   ALTER TABLE applications MODIFY COLUMN phone             VARCHAR(64)  NULL;
   ALTER TABLE applications MODIFY COLUMN country           VARCHAR(128) NULL;
   ALTER TABLE applications MODIFY COLUMN property_type     VARCHAR(128) NULL;
   ALTER TABLE applications MODIFY COLUMN purchase_intent   VARCHAR(64)  NULL;
   ALTER TABLE applications MODIFY COLUMN budget_range      VARCHAR(64)  NULL;
   ALTER TABLE applications MODIFY COLUMN savings           VARCHAR(64)  NULL;
   ALTER TABLE applications MODIFY COLUMN income            VARCHAR(64)  NULL;
   ALTER TABLE applications MODIFY COLUMN income_currency   VARCHAR(16)  NULL;
   ALTER TABLE applications MODIFY COLUMN employment_status VARCHAR(128) NULL;
   ALTER TABLE applications MODIFY COLUMN financing_consent VARCHAR(32)  NULL;
   ```
   Numbering 012 follows the gap-aware existing sequence
   (000, 001, 002, 003, 004, 005, 006, 007, 009, 010, 011 — note 008 is absent
   in the directory; do NOT fill it, follow last-used + 1).

### Acceptance criteria

- After repository instantiation against a fresh MySQL test DB,
  `information_schema.columns` reports `IS_NULLABLE='YES'` for all 10 columns
  listed above.
- Re-instantiating the repository (and thus re-running `_ensure_schema_columns`)
  emits zero ALTER statements and no errors — proven by capturing
  `SQLAlchemyError` would-be raises in a unit test.
- The SQL file exists at `backend/migrations/012_relax_application_legacy_columns.sql`
  and is byte-identical to running the helper against a fresh schema.
- `backend/tests/test_schema_migrations.py` continues to pass — its
  `_create_legacy_applications_table` fixture (lines 23-115) still creates a
  legacy NOT-NULL schema, and the new helper invocation through the repository
  must NOT crash on SQLite.

### Risks

- `ALTER TABLE ... MODIFY COLUMN` on a large `applications` table in MySQL takes
  a metadata lock; production row count is small (per Phase 1 deployment notes,
  Cloud SQL MySQL, no high-throughput writes), so risk is bounded. The helper
  short-circuits on `IS_NULLABLE='YES'` so the lock is taken only on the first
  deploy.
- SQLAlchemy ORM column metadata (`nullable=True`) is purely cosmetic against an
  existing table — the actual DB constraint is what matters. Acceptable.

---

## Phase 4c — Backend repo merge logic + handler field-presence logging

### Files to touch
- `backend/src/interface/http_endpoints.py` (lines 2010-2090 — `create_application` handler).
- `backend/src/infra/mysql/housing_application_repository.py` (lines 241-296 — `create()` upsert path).
- `backend/src/usecase/housing_application.py` (lines 10-58 — `submit_housing_application` signature).

### Steps

1. **Domain object widening (preparatory)** — in `backend/src/domain/housing_application.py:10-30`,
   widen the type annotations so a thin path of `Optional[str]` flows through
   the dataclass without runtime breakage. Change exactly these fields from
   `str` to `Optional[str]`:
   `phone`, `country`, `property_type`, `purchase_intent`, `budget_range`,
   `savings`, `income`, `income_currency`, `employment_status`,
   `financing_consent`. Default value: `None`. Leave `email`, `full_name`,
   `agree_policy`, `connected_accounts`, `created_at`, `archived`,
   `review_status` unchanged.

2. **Usecase signature** — in `backend/src/usecase/housing_application.py:10-29`,
   change every parameter from `str` to `Optional[str]` for the same 10 fields
   listed above. The body at lines 30-58 already calls
   `normalize_country(country) or country` — verified at
   `backend/src/usecase/country_codes.py:77-93` to handle `None` gracefully
   (returns `None`). No body change required — `canonical_country` will be
   `None` when `country is None`, and the `HousingApplication` dataclass now
   accepts that.

3. **Handler — field-presence logging** — in
   `backend/src/interface/http_endpoints.py:2010-2014`, immediately after the
   `_mark("handler-entered")` line, add a new block:
   ```python
   _intake_log = logging.getLogger("submit.intake")
   _payload_dump = request.model_dump(exclude={"connected_accounts"})
   _present = {k: True for k, v in _payload_dump.items() if v is not None}
   _nonempty = {
       k: True
       for k, v in _payload_dump.items()
       if isinstance(v, str) and v.strip()
   }
   _intake_log.info(
       "[intake.field-presence] keys_total=%d present=%s nonempty=%s",
       len(_payload_dump),
       sorted(_present.keys()),
       sorted(_nonempty.keys()),
   )
   ```
   This emits exactly one INFO line per submission summarising which keys
   arrived. Sentinel-coerced values are already `None` by the time this runs
   (Phase 4a executes during pydantic validation, which is before handler entry).

4. **Handler — pass-through of None** — in `create_application`
   (`http_endpoints.py:2016-2018, 2069-2077`):
   - Replace
     ```
     phone = _normalise_string(request.phone or "")
     ```
     at line 2018 with
     ```
     phone = _normalise_string(request.phone) if request.phone is not None else None
     ```
   - For each of the 9 string-call-sites in the
     `submit_housing_application(...)` invocation at lines 2069-2077
     (`country`, `property_type`, `purchase_intent`, `budget_range`, `savings`,
     `income`, `income_currency`, `employment_status`, `financing_consent`),
     replace `_normalise_string(request.<field>)` with the inline expression
     `_normalise_string(request.<field>) if request.<field> is not None else None`.
   - DO NOT introduce a `"not_provided"` literal anywhere in this handler.
   - `_normalise_string` itself (lines 790-791) does not need to change — it
     only runs on real strings now.

5. **Repository merge logic** — in
   `backend/src/infra/mysql/housing_application_repository.py:241-296`,
   replace the unconditional overwrites at lines 259-282 with a per-field merge
   helper.
   - Add a private static helper at module scope (e.g. above the class on
     line 31, or as a `@staticmethod` inside the class):
     ```python
     _LEGACY_SENTINELS = frozenset({"not_provided", "not provided", "n/a", "na", "none", ""})

     @staticmethod
     def _is_meaningful(value: object) -> bool:
         if value is None:
             return False
         if not isinstance(value, str):
             return True
         return value.strip().lower() not in SQLAlchemyHousingApplicationRepository._LEGACY_SENTINELS
     ```
   - Inside the `if existing is not None:` branch (line 258), introduce a
     per-column merge loop. Replace lines 259-282 with:
     ```python
     _merge_log = logging.getLogger("submit.intake")
     preserved: list[str] = []
     overwritten: list[str] = []
     mergeable_columns = (
         "email", "phone", "country", "property_type", "purchase_intent",
         "budget_range", "savings", "income", "income_currency",
         "employment_status", "financing_consent", "full_name",
     )
     for col in mergeable_columns:
         incoming = getattr(application, col)
         current = getattr(existing, col)
         if self._is_meaningful(incoming):
             if incoming != current:
                 setattr(existing, col, incoming)
                 overwritten.append(col)
         else:
             # incoming is sentinel/empty/None — preserve existing value
             # but only if the existing value is itself meaningful; otherwise
             # honour the incoming None so nothing rotates from sentinel→None.
             if not self._is_meaningful(current):
                 setattr(existing, col, incoming)
                 overwritten.append(col)
             else:
                 preserved.append(col)
     existing.agree_policy = application.agree_policy
     existing.receive_updates = application.receive_updates
     existing.skipped_connect_accounts = application.skipped_connect_accounts
     existing.connected_accounts = connected_accounts_json
     existing.archived = False
     if hasattr(existing, "review_status"):
         existing.review_status = (
             application.review_status or existing.review_status or "pending"
         )
     _merge_log.info(
         "[intake.merge] application_id=%s overwritten=%s preserved=%s",
         existing.id,
         sorted(overwritten),
         sorted(preserved),
     )
     if preserved:
         _merge_log.warning(
             "[intake.merge.preserve] application_id=%s fields=%s",
             existing.id,
             sorted(preserved),
         )
     ```
   - The existing `_persist_existing` closure at lines 284-296 is unchanged.

6. The insert path (lines 298-334) needs no merge logic but does need to write
   `None` faithfully for nullable columns. Verified: SQLAlchemy already passes
   `None` straight through when assigned. No code change required here.

7. **`_to_domain`** at lines 209-239 already returns whatever the column holds.
   `phone=db_application.phone` will be `None` for the new rows; the
   `HousingApplication` dataclass (post step 1) accepts that. No change.

### Acceptance criteria

- A POST with all legacy fields omitted creates a row with `NULL` in those
  columns; the response JSON shows `null` (not `"not_provided"`).
- A second POST under the same `(full_name, phone)` with empty/sentinel values
  for `country`, `property_type`, etc. preserves the prior row's real values.
- One INFO line `[intake.field-presence]` per submission is emitted, listing
  the present and non-empty keys.
- One INFO line `[intake.merge]` per upsert path emitted with `overwritten` /
  `preserved` lists.
- `WARNING` level `[intake.merge.preserve]` line emitted if any column was
  preserved (i.e. an incoming sentinel/null tried to stomp a real value).
- No occurrence of the literal `"not_provided"` is written by the handler — a
  test (Phase 4e) asserts this.

### Risks

- The merge logic changes upsert semantics for ALL applications, not just
  sentinel-affected ones. Behaviour change: a field previously holding
  `"London"` would have been overwritten by `""`; it now stays `"London"`.
  This is the desired behaviour per the user's "bullet proof like telegram"
  ask and matches the scope item in the prompt.
- `_LEGACY_SENTINELS` is duplicated between the schema validator (Phase 4a)
  and the repo. Acceptable redundancy: schema layer protects API surface;
  repo layer protects DB integrity even if the schema layer is bypassed
  (e.g. by `delete_all` + bulk reload). Both must be kept in lockstep —
  documented as a CHANGELOG note in Phase 4f.

---

## Phase 4d — Frontend payload sentinel removal

### Files to touch
- `frontend/app/application/review/page.tsx` (lines 38, 104-125, 268-291, 322-400).

### Steps

1. **Remove the constant and helper fallback default** at
   `frontend/app/application/review/page.tsx:38`:
   - Delete the line `const DEFAULT_SUBMISSION_PLACEHOLDER = "not_provided"`.
   - At line 107, change `readStoredApplicationValue`'s signature from
     `fallback = DEFAULT_SUBMISSION_PLACEHOLDER` to `fallback: string | null = null`.
   - Change the return type from `string` (line 108) to `string | null`.
   - Change the final `return fallback` at line 124 — it already returns the
     parameter value, which is now `null` by default; no body change required.

2. **Update the consumers in `submissionDefaults`** at lines 275-291:
   - Each of the five `readStoredApplicationValue(...)` calls (`property_type`,
     `purchase_intent`, `budget_range`, `savings`, `income`) returns
     `string | null` after step 1. The keys they produce on the payload object
     should be `null`-typed too.
   - The sixth call (`income_currency`, lines 284-288) explicitly passes
     `resolveIncomeCurrency(applicantCountry)` as the fallback — keep this
     unchanged. It still returns `string`.

3. **Update the `applicantPhone` and `residencePermitNumber` derivations**
   at lines 268-274:
   - `applicantPhone` (lines 268-273): change the trailing `|| "Not provided"`
     to `|| null`. The variable type becomes `string | null`. The display
     side that renders `applicantPhone` in `<ReviewFormContent>` (line 416)
     must be updated to accept `null` and display `"Not provided"` itself.
     Do this inline: at line 416 pass `applicantPhone={applicantPhone ?? "Not provided"}`.
     This satisfies the prompt's "Keep the legacy display strings on the
     review page UI — only fix the OUTGOING payload" requirement.
   - `residencePermitNumber` (line 274): same treatment — replace `|| "Not provided"`
     with `|| null`, and at line 419 pass
     `residencePermitNumber={residencePermitNumber ?? "Not provided"}`.

4. **Rewrite the outgoing payload** at lines 334-357:
   ```ts
   const submissionPayload = {
     email: applicantEmail || "",
     phone: applicantPhone,                               // null when missing
     country: applicantCountry || null,
     property_type: submissionDefaults.property_type,     // null when missing
     purchase_intent: submissionDefaults.purchase_intent, // null when missing
     budget_range: submissionDefaults.budget_range,       // null when missing
     savings: submissionDefaults.savings,                 // null when missing
     income: submissionDefaults.income,                   // null when missing
     income_currency: submissionDefaults.income_currency, // resolveIncomeCurrency fallback, always string
     employment_status: applicantRole || null,
     financing_consent: "granted",
     full_name: applicantName,
     agree_policy: true,
     receive_updates: true,
     skipped_connect_accounts: !hasPersonalAccount,
     connected_accounts: connectedAccounts as Record<string, unknown[]>,
     metadata: {
       ...(storedForm?.metadata && typeof storedForm.metadata === "object" ? storedForm.metadata : {}),
       application_reference: generatedReference,
       residence_permit_number: residencePermitNumber, // null when missing
     },
   }
   ```
   - **DELETE** the `created_at: now.toISOString(),` line at 351 — `created_at`
     is an unknown key that the backend now rejects (Phase 4a `extra="forbid"`).
     The backend supplies `created_at` itself via SQL `func.now()` server default
     (`backend/src/infra/mysql/models.py:72`).
   - DO NOT introduce any literal `"not_provided"` in this file. A grep for
     `"not_provided"` after the edit must yield zero matches.
   - The `Not provided` display strings at lines 416, 419 are display-side and
     must remain.

5. The `ReviewFormContent` component prop types (declared at
   `frontend/components/application/review/review-form-content.tsx`) accept
   `applicantPhone: string` and `residencePermitNumber: string` today. Verify
   step 3 still compiles — passing `applicantPhone ?? "Not provided"` produces
   `string` which satisfies the existing prop. No edit to that file required.

### Acceptance criteria

- A grep `grep -n "not_provided" frontend/app/application/review/page.tsx`
  returns ZERO matches.
- A grep `grep -n "DEFAULT_SUBMISSION_PLACEHOLDER" frontend/app/application/review/`
  returns ZERO matches.
- `JSON.stringify(submissionPayload)` for an empty `localStorage` produces a
  body whose `property_type`, `purchase_intent`, `budget_range`, `savings`,
  `income`, `phone`, and `metadata.residence_permit_number` are all `null`
  (not `""`, not `"not_provided"`). Asserted by the new Jest test in Phase 4e.
- The body does NOT include a `created_at` key.
- The review page UI still renders "Not provided" where phone or residence
  permit are missing. Visible in Playwright e2e (`frontend/eHousing_Web/tests`)
  if run, but Phase 4d does not require Playwright execution.

### Risks

- Removing `created_at` from the outgoing payload depends on Phase 4a being
  deployed first; otherwise the backend (with old `extra="ignore"`) accepts
  it and ignores it harmlessly — backwards compatible. Removing `created_at`
  AFTER Phase 4a is deployed is mandatory.
- Display side of the review page must still render "Not provided" — verified
  by passing `?? "Not provided"` at the JSX call site.

---

## Phase 4e — Tests

### Files to touch
- `backend/tests/interface/test_application_endpoint.py` (append new tests after the existing `test_submit_application_requires_email_and_name` block).
- `backend/tests/test_schema_migrations.py` (append a test for `ensure_application_legacy_nullable`).
- `frontend/app/application/review/__tests__/payload.test.ts` (new file).

### Steps

#### Backend: append to `backend/tests/interface/test_application_endpoint.py`

1. Add a new test `test_submit_application_coerces_sentinel_strings_to_null`:
   - Build `payload = build_payload()` (line 10 helper); set
     `payload["property_type"] = "not_provided"` and
     `payload["budget_range"] = "  N/A "`.
   - POST to `/api/v1/applications`.
   - Assert `response.status_code == 201`.
   - Assert `response.json()["property_type"] is None` and
     `response.json()["budget_range"] is None`.
   - Use pytest's `caplog` fixture (`caplog.set_level(logging.WARNING, logger="submit.intake")`)
     and assert at least one log record contains
     `"[sentinel-coerce]"` and `"property_type"`.

2. Add `test_submit_application_accepts_omitted_legacy_fields`:
   - Build `payload = build_payload()`; `del payload["property_type"]`,
     `del payload["purchase_intent"]`, `del payload["budget_range"]`,
     `del payload["savings"]`, `del payload["income"]`.
   - POST and assert `201`. Assert each missing field is `None` in the response.

3. Add `test_submit_application_rejects_unknown_keys`:
   - Build `payload = build_payload()`; add `payload["created_at"] = "2026-05-05"`.
   - POST and assert `response.status_code == 422`.
   - Assert `"created_at"` appears somewhere in the error detail (case-insensitive).

4. Add `test_submit_application_repository_merge_preserves_existing_values`:
   - First POST with all real values via `build_payload()`. Assert 201, capture `id`.
   - Second POST under the same `(full_name, phone)` but with the legacy fields
     each set to `"not_provided"`.
   - Re-fetch via `GET /api/v1/applications/<id>` (handler at
     `http_endpoints.py:2415`) and assert the original values are intact —
     `body["country"] == "JP"` (after `normalize_country("Japan")` canonicalises),
     `body["property_type"] == "Condo"`, etc.
   - With `caplog.set_level(logging.INFO, logger="submit.intake")`, assert one
     record contains `"[intake.merge]"` and the `preserved` list mentions the
     legacy field names.

5. Add `test_submit_application_emits_field_presence_log`:
   - Build a minimal payload (only required fields).
   - With `caplog.set_level(logging.INFO, logger="submit.intake")`, POST and
     assert at least one record matches `"[intake.field-presence]"`. The log
     message must include `"property_type"` in the `keys_total` set even
     though the value is `None` — proving we observe absence, not just
     presence.

#### Backend: append to `backend/tests/test_schema_migrations.py`

6. Add `test_ensure_application_legacy_nullable_idempotent_on_legacy_table`:
   - Use the existing `_create_legacy_applications_table` fixture (lines 23-115)
     — it creates the columns NOT NULL on SQLite.
   - Import `ensure_application_legacy_nullable` from
     `src.infra.mysql.schema`. Call it twice in succession against the legacy
     SQLite engine. Assert no exception is raised.
   - The SQLite branch is a soft no-op per Phase 4b step 1, so the columns
     remain `NOT NULL` — this is acceptable; the helper's contract on
     SQLite is "do not crash".

#### Frontend: new file `frontend/app/application/review/__tests__/payload.test.ts`

7. Create the test file (jest, jsdom-aware via the existing
   `frontend/jest.config.js` defaults). The test suite must NOT mount React.
   Instead, factor the payload-building expression out of `handleSubmit`
   into a tiny pure helper, e.g. add to `review/page.tsx` an export:
   ```ts
   export function buildSubmissionPayload(args: {
     applicantEmail: string;
     applicantPhone: string | null;
     applicantCountry: string | null;
     applicantRole: string | null;
     applicantName: string;
     submissionDefaults: { /* ... */ };
     residencePermitNumber: string | null;
     storedForm: StoredFormData | null;
     hasPersonalAccount: boolean;
     connectedAccounts: typeof emptyConnectedAccounts;
     generatedReference: string;
   }): Record<string, unknown> { /* identical to inline body */ }
   ```
   Then test:
   - `test("buildSubmissionPayload omits sentinel for affordability fields")`:
     supply `submissionDefaults` with all `null`s. Expect the returned object
     to have `property_type: null`, etc. AND `JSON.stringify(payload)` not
     to contain the substring `"not_provided"`.
   - `test("buildSubmissionPayload sends null for missing phone")`:
     `applicantPhone: null` ⇒ payload `phone: null`.
   - `test("buildSubmissionPayload sends null for missing residence_permit_number")`:
     `residencePermitNumber: null` ⇒ payload `metadata.residence_permit_number: null`.
   - `test("buildSubmissionPayload does not include created_at")`:
     ⇒ `Object.keys(payload)` does not contain `"created_at"`.

   The implementation phase (4d) MUST extract the helper to make this test
   feasible. Phase 4d will note this dependency.

### Acceptance criteria

- All five new backend tests pass on their own and do not regress existing
  tests in `backend/tests/`.
- The new schema-migration test passes.
- All four frontend payload tests pass under
  `npm test --prefix frontend -- payload.test.ts`.
- `caplog`-based assertions actually exercise the new logger names
  `submit.intake` (not `submit.trace`).

### Risks

- Backend tests in `test_application_endpoint.py` rely on a `client` fixture
  defined in `backend/tests/conftest.py`. Confirmed the fixture exists
  (file present on disk; fixtures referenced at lines 37-38 of the test file).
  The new tests reuse the same fixture name and signature.
- The frontend test requires factoring `buildSubmissionPayload` out of
  `handleSubmit`. Phase 4d's commit MUST include this extraction. Sequenced
  accordingly.

---

## Phase 4f — CHANGELOG + about.md update

### Files to touch
- `workspace/CHANGELOG.md` (canonical changelog source consumed by
  `scripts/generate_changelog_html.py:11` regex `## [YYYY-MM-DD] – Title`).
  Create the directory + file if absent (this repo currently ships only the
  generated `docs/changelog/index.html`; the source `workspace/CHANGELOG.md`
  is referenced by the generator script comment at
  `scripts/generate_changelog_html.py:2` and is the conventional location).
- `.ai/intake-hardening/a/about.md` (lines 1-40 — the Project Blueprint).

### Steps

1. **Append a new entry** to `workspace/CHANGELOG.md` at the top (newest first
   ordering — confirmed by the generator's reverse parse). Use the existing
   regex format `## [YYYY-MM-DD] – Title` with today's date (`2026-05-05` per
   environment) and the field-block style:
   ```markdown
   ## [2026-05-05] – Intake submission hardening

   **Type:** fix
   **Areas:** backend, frontend, schema

   **Summary:**
   Stop persisting the literal sentinel string `"not_provided"` for legacy
   affordability fields. The backend now treats `property_type`,
   `purchase_intent`, `budget_range`, `savings`, `income`, `country`,
   `income_currency`, `employment_status`, `financing_consent`, and `phone`
   as optional, coerces sentinel/empty values to `NULL`, rejects unknown
   payload keys with HTTP 422, and emits one structured INFO log line per
   submission summarising field presence. The repository upsert path
   preserves existing real values when an incoming submission carries empty
   or sentinel placeholders. The frontend review page no longer fabricates
   `"not_provided"` for fields the simplified flow does not collect; missing
   values are sent as `null`.

   **Notes:**
   - DB columns relaxed to `NULL` via runtime migration
     (`ensure_application_legacy_nullable`) and migration file
     `backend/migrations/012_relax_application_legacy_columns.sql`.
   - Existing rows with `"not_provided"` are NOT backfilled — only NEW writes
     are guaranteed sentinel-free.
   ```
   If `workspace/` does not exist, create the directory.

2. **Update `.ai/intake-hardening/a/about.md`** to reflect the actual end state
   (removing the original blueprint's out-of-scope claims):
   - In the "Final Architecture" / "Backend (FastAPI / SQLAlchemy)" block
     (lines 6-13), remove the two paragraphs that describe `structlog`,
     `metrics`, `Sentry on backend`, the `metadata` JSON column, and the
     "backfill `"not_provided"` rows to NULL" claim. Replace with a one-paragraph
     summary mirroring the actual scope (sentinel coercion, `extra="forbid"`,
     field-presence INFO log, repo merge logic, nullable columns).
   - In the "Frontend" block (lines 14-17), remove the residence-permit
     collection step claim and the Zod-in-proxy claim. Replace with a sentence
     describing the sentinel removal in `review/page.tsx`.
   - In the "Observability" block (lines 18-21), remove `structlog`,
     `prometheus_client`, `/metrics`, and Sentry-on-backend claims. Replace
     with a sentence noting the new `submit.intake` stdlib logger.
   - In the "Tests" block (lines 22-25), update the bullet list to match the
     test plan in Phase 4e.
   - Leave the Mission paragraph (lines 3-4) and Deployment / Definition of
     Done sections (lines 26+) intact except for any references to
     `"not_provided"` backfill.

### Acceptance criteria

- `workspace/CHANGELOG.md` exists, contains an entry for `[2026-05-05]`, and
  passes the generator's regex parser (verified by running
  `python scripts/generate_changelog_html.py` locally — its output is just
  reformatted HTML; non-zero exit indicates a parse failure).
- `.ai/intake-hardening/a/about.md` no longer mentions `structlog`,
  `prometheus`, `/metrics`, "Sentry … on the backend", "Zod schema",
  "first-class JSON column", "residence-permit step", or "backfilled
  migration replaces existing `"not_provided"` rows with `NULL`".
- A grep for these tokens in `.ai/intake-hardening/a/about.md` after the edit
  yields ZERO matches.

### Risks

- The blueprint at `.ai/intake-hardening/a/about.md` was the original "ideal
  end state" — not the agreed scope. Trimming it to match Phase 2+3 scope is
  the explicit purpose of this phase. No other code is touched.

---

## Cross-Phase Notes

### Concurrency safety

- The repository's `_SCHEMA_LOCK` (`housing_application_repository.py:26`) and
  `_ENSURED_ENGINES` set already serialise the runtime migrations. Adding
  `ensure_application_legacy_nullable` to the same critical section (Phase 4b
  step 2) is a one-line change inside the existing `with _SCHEMA_LOCK` block
  (line 64) and inherits its serialisation guarantees. The MySQL `ALTER TABLE
  ... MODIFY COLUMN` only fires when `IS_NULLABLE='NO'`, so on the second and
  later instantiations the helper is a no-op at zero-lock cost.
- The handler-level field-presence log (Phase 4c) uses a per-call dict; no
  shared state.
- The repository merge logic uses no shared state.

### Migration order

1. Phase 4b's runtime migration MUST run before Phase 4c's handler can write
   `NULL`s to the affordability columns (otherwise MySQL rejects the INSERT
   with NOT NULL constraint failure). In practice both ship in the same
   Cloud Run revision, and the migration runs at first repository
   instantiation — i.e. on the FIRST request to the new revision. The
   FIRST request will therefore experience one `ALTER TABLE` latency hit
   (small table, sub-second) before the INSERT runs. Acceptable.
2. Phase 4a's `extra="forbid"` schema MUST NOT ship before Phase 4d's
   `created_at` removal — otherwise the live frontend (still sending
   `created_at`) gets 422-ed. Mitigation: deploy backend Phase 4a alongside
   frontend Phase 4d in a coordinated release. If a strict ordering is
   required, ship Phase 4d first (drops `created_at` from outgoing payload —
   forward-compatible with old backend) and Phase 4a second.
3. Phase 4f is a docs-only change and runs last.

### Dependencies between phases (parallelization summary)

- Phase 4a, Phase 4b, Phase 4d are the three ground-floor implementation
  phases; they touch disjoint files and have no inter-phase code dependency.
- Phase 4c (`http_endpoints.py` + `housing_application_repository.py` +
  `housing_application.py` + `domain/housing_application.py`) reads the
  schema fields relaxed in Phase 4a. It must run AFTER Phase 4a.
- Phase 4e (tests) asserts behaviours introduced in Phases 4a-4d. Must run
  AFTER all four. Phase 4d also adds the `buildSubmissionPayload` export
  required by the frontend tests.
- Phase 4f closes out the work and depends on Phases 4a-4e being merged.

---

## Parallelization

**Safe to run in parallel:**

- (Phase 4a, Phase 4b, Phase 4d) — three subagents can run concurrently.
  - Phase 4a edits `backend/src/interface/schemas.py`.
  - Phase 4b edits `backend/src/infra/mysql/{schema.py, models.py,
    housing_application_repository.py}` AND adds
    `backend/migrations/012_relax_application_legacy_columns.sql`.
  - Phase 4d edits only `frontend/app/application/review/page.tsx`.
  - File-overlap check: Phase 4b and Phase 4c both edit
    `backend/src/infra/mysql/housing_application_repository.py`, so they
    cannot be parallel — but Phase 4b and 4d/4a have NO overlap.

**Must run sequentially:**

- Phase 4c AFTER Phase 4a (handler depends on schema relaxation; otherwise
  passing `None` to a `min_length=1` field 422-fails).
- Phase 4c AFTER Phase 4b (handler INSERTs `None`; otherwise NOT NULL
  constraint violation on first write).
- Phase 4e AFTER Phase 4a, 4b, 4c, 4d (tests assert end-to-end behaviour
  including the extracted `buildSubmissionPayload` from 4d).
- Phase 4f LAST (CHANGELOG + about.md reflect the merged outcome).

**Recommended execution graph:**

```
   ┌────────┐    ┌────────┐    ┌────────┐
   │  4a    │    │  4b    │    │  4d    │   (parallel)
   └───┬────┘    └───┬────┘    └───┬────┘
       │             │             │
       └──────┬──────┘             │
              │                    │
          ┌───▼────┐                │
          │   4c   │                │
          └───┬────┘                │
              │                    │
              └──────┬─────────────┘
                     │
                 ┌───▼────┐
                 │   4e   │
                 └───┬────┘
                     │
                 ┌───▼────┐
                 │   4f   │
                 └────────┘
```

## Assessed: yes
