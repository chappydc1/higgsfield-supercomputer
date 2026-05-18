# Letter c — Implementation plan

## Goal
End-to-end OCR flow: applicant doc upload → PowerCred adapter → `canonical_identity_profiles` → `/dashboard?id=N` renders the address.

## Status
- [x] Phase 0 — branch off feat/canonical-identity-full-address; .ai/c/ at parent
- [x] Phase 1 — context (3 parallel Explore agents, plus targeted reads)
- [x] Phase 2 — plan (this file)
- [x] Phase 4 — implement: 7 new backend files + http_endpoints.py + 3 frontend files
- [x] Phase 5 — validate: 67 backend tests pass (62 prior + 5 new endpoint integration tests). Frontend tsc clean on touched files.
- [x] Phase 6 — live HTTP exercise against real uvicorn + transient postgres + next dev. Caught and fixed a proxy-forwarding bug (proxy was dropping `application_id`). Browser screenshot deferred — Auth0-gated. See `screenshots/phase-6-live-flow.md`.
- [ ] Phase 7 — review pass (deferred to GitHub PR review)
- [ ] Phase 8 — PR

## Findings that drive design
1. **The frontend wizard exists** (`dashboard/components/dashboard-dialogs-section.tsx` Bureau Upload, `hooks/use-bureau-upload-wizard.ts`) but is mocked — `bureauReportFields` is a hardcoded `[{score:"712"},...]` array, `handleBureauUploadChange` only stores `File[]` in state, no network call.
2. **The frontend OCR proxy exists** (`app/api/v1/application/residence-permit/ocr/route.ts`) and forwards multipart to `POST {backend}/api/v1/application/residence-permit/ocr`, but **that backend endpoint does not exist** — calls 404 today.
3. **The dashboard read endpoint** is `GET /v1/applications/{application_id}` returning `ApplicationResponse`. `_application_to_response()` (http_endpoints.py:1416) already populates `address_line1` / `address_line2` etc. from the `applications` table — so the rendering path is wired; we just need to also merge from `canonical_identity_profiles` when canonical has data.
4. **No real PowerCred credentials** yet. Letter `c` ships behind a `POWERCRED_BASE_URL` env var: when unset, the adapter uses a mock that returns canned extraction for the residence-card fixture. Real client lives in the same module, switched on at credential-time without other code changes.
5. **No Celery / Cloud Tasks** in this codebase — async work uses bare `threading.Thread(daemon=True)`. PowerCred IDP is async (returns 202), but for the mock path we run synchronously so the wizard's "review extracted fields" step has data to display immediately. When real PowerCred lands, the polling loop runs in a thread and the wizard transitions to "processing" until the result is ready.

## Implementation units (parallelisable where noted)

**Unit A — PowerCred adapter module** (backend, no external dependencies):
- `backend/src/infra/powercred/__init__.py`
- `backend/src/infra/powercred/schemas.py` — typed request/response models
- `backend/src/infra/powercred/mock.py` — canned-extraction fallback for sandbox-less testing
- `backend/src/infra/powercred/client.py` — real HTTP client (skeleton, used when `POWERCRED_BASE_URL` set)
- `backend/src/infra/powercred/mapper.py` — `IDPDocumentResult → CanonicalAddress + identity fields`
- `backend/src/infra/powercred/persist.py` — `persist_extraction(session, applicant_id, raw_payload, mapped)` writes `raw_provider_payloads` + upserts `canonical_identity_profiles`

**Unit B — backend OCR endpoint** (depends on Unit A):
- New handler `POST /api/v1/application/residence-permit/ocr` in `backend/src/interface/http_endpoints.py`
- Accepts: `file: UploadFile`, `applicant_id: str = Form(...)`, `document_type: str = Form("credit_card_statement")`
- Pipeline: read file → call PowerCred (mock or real per env) → mapper → persist → return extracted fields JSON

**Unit C — dashboard merge** (parallel-safe with A and B):
- Edit `_application_to_response()` to take a fresh `CanonicalAddress` (from `CanonicalIdentityRepository.get_current_address`) and prefer canonical's full street over the `applications` table values when canonical's `line1` is populated. Provenance carried in a new optional `address_source` field on `ApplicationResponse`.

**Unit D — frontend wizard wiring** (parallel with A/B/C):
- Edit `hooks/use-bureau-upload-wizard.ts`: replace the hardcoded `bureauReportFields` initial state with a `[]`-default and add a `handleBureauUploadRequest` impl that POSTs the first selected file to `/api/v1/application/residence-permit/ocr` and writes the response into `bureauReportFields`. Fire from the existing "Continue to upload" / "Review extracted fields" button.
- The proxy route already exists and forwards multipart; only the hook + button wiring change.
- Carry `applicantId` from the dashboard page into the hook so the form submits it.

**Unit E — tests** (depend on A and B):
- `backend/tests/infra/test_powercred_persist.py` — round-trip mock extraction → canonical row, fetched via `CanonicalIdentityRepository.get_current_address`.
- `backend/tests/interface/test_residence_permit_ocr_endpoint.py` — POST a small PNG (synthetic), assert 200 + extracted fields + DB rows present.
- `backend/tests/infra/test_canonical_identity_profile.py` — already shipped in PR #176, ensure no regression.

**Unit F — browser e2e** (Phase 6, after units A–E green):
- Start backend with `POWERCRED_BASE_URL` unset (mock mode).
- Start frontend dev server.
- Navigate `/dashboard?id=N` for an existing applicant in the local DB.
- Open Bureau Upload, drop the residence card PNG, advance to "Review extracted fields".
- Verify the wizard shows real OCR-mocked fields (full_name=TURNER ELIZABETH etc.) and the dashboard's Customer Information card now reflects the address coming from `canonical_identity_profiles`.
- Capture three screenshots: dialog with file selected, extracted-fields review, dashboard with new address.

## Rollback plan
- All four backend file additions live under `backend/src/infra/powercred/` — `rm -rf` reverts them.
- `_application_to_response` change is additive; if the canonical merge misbehaves, set the `MERGE_CANONICAL_ADDRESS=false` env flag (we'll plumb it during impl) to short-circuit back to the existing applications-table-only path.
- DB schema unchanged in this letter (PR #176 already added the columns). No migrations to revert.
- Frontend hook change is feature-flag-able by leaving `bureauReportFields` defaulting to `[]` — when no upload has happened, the review step shows "no fields yet" gracefully instead of mock data.

## Out of scope for letter c
- Real PowerCred credentials wiring (impossible until creds land — mock is sufficient).
- GCS file persistence (the OCR result is what we care about; the bytes can be discarded after extraction for now).
- Webhook callback path (mock is synchronous; real-PowerCred async polling is letter `d`).
- HEIC/HEIF conversion (the wizard accepts these but we'll only test PNG end-to-end this round).
