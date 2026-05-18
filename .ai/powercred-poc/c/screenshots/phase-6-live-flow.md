# Phase 6 — Live end-to-end validation

Backend uvicorn on `127.0.0.1:8765`, transient postgres on `55433`,
sqlite for the mysql side. PowerCred mock (no creds, default fallback).
Frontend wiring not invoked here — this proof goes through the actual
HTTP API surface the wizard will call.

## Step 1 — Create application
```
POST /api/v1/applications  →  201 {id: 1, address_line1: null, address_source: null}
```

## Step 2 — Upload image.png to OCR
```
POST /api/v1/application/residence-permit/ocr
  application_id=1, file=image.png (residence card specimen)

200 {
  application_id: 1,
  applicant_id: "app-00000001",
  document_type: "residence_card",
  reference_id: "mock-32b07eb29fd7",
  source: "mock",
  canonical_profile_id: 1,
  fields: [
    {id: "full_name",            label: "Full name",      value: "TURNER ELIZABETH",         confidence: 0.95},
    {id: "date_of_birth",        label: "Date of birth",  value: "1985-12-31",               confidence: 0.93},
    {id: "national_id_type",     label: "ID type",        value: "japanese_residence_card",  confidence: 1.0},
    {id: "national_id_number",   label: "Card number",    value: "AB12345678CD",             confidence: 0.97},
    {id: "address_line1",        label: "Address line 1", value: "1-2-3 Shibuya",            confidence: 0.88},
    {id: "address_city",         label: "City",           value: "Shibuya-ku",               confidence: 0.91},
    {id: "address_region",       label: "Region / Pref.", value: "Tokyo",                    confidence: 0.94},
    {id: "address_postal_code",  label: "Postal code",    value: "150-0002",                 confidence: 0.85},
    {id: "address_country",      label: "Country",        value: "JP",                       confidence: 1.0},
    {id: "issue_date",           ...},
    {id: "expiration_date",      ...},
    {id: "status_of_residence",  ...},
  ]
}
```

## Step 3 — Database state after upload
```
raw_provider_payloads:
  applicant_id="app-00000001", provider_name="powercred",
  object_type="document_extraction",
  provider_object_id="mock-32b07eb29fd7",
  schema_version="powercred-idp/mock",
  payload (JSONB) carries the full mock response.

canonical_identity_profiles:
  applicant_id="app-00000001", provider_name="powercred",
  raw_payload_id=1 (FK to row above),
  full_name="TURNER ELIZABETH",
  address_line1="1-2-3 Shibuya",
  address_city="Shibuya-ku",
  address_region="Tokyo",
  address_postal_code="150-0002",
  address_country="JP",
  date_of_birth_hash=<sha256>, national_id_hash=<sha256>.
```

## Step 4 — Dashboard endpoint surfaces canonical address
```
GET /api/v1/applications/1  →  200 {
  ...,
  address_line1:    "1-2-3 Shibuya",
  city:             "Shibuya-ku",
  region:           "Tokyo",
  postal_code:      "150-0002",
  address_country:  "JP",
  address_source:   "powercred"     ← provenance set by canonical merge
}
```

`address_source: "powercred"` proves the merge fired — fields came from
`canonical_identity_profiles` (the OCR-populated row), not the
`applications` table (which is still empty for this applicant).

## Step 5 — Frontend proxy validation (the actual wizard path)

Re-ran the upload through the **Next.js proxy** at port 3000
(`/api/v1/application/residence-permit/ocr/route.ts`) — the same path the
Bureau Upload wizard takes. Caught and fixed a real bug: the proxy was
silently dropping `application_id` and `document_type` from the
forwarded form. After the fix:

```
POST http://127.0.0.1:3000/api/v1/application/residence-permit/ocr
  application_id=1, document_type=residence_card, file=image.png

→ 200 {
    applicant_id:          "app-00000001",
    reference_id:          "mock-98b2831be2e5",
    fields_count:          12,
    source:                "mock",
    canonical_profile_id:  1,
    fields[0]:             full_name = TURNER ELIZABETH (conf=0.95)
    fields[1]:             date_of_birth = 1985-12-31 (conf=0.93)
    fields[2]:             national_id_type = japanese_residence_card (conf=1.0)
  }
```

The dashboard endpoint then surfaces the OCR-extracted address:

```
GET http://127.0.0.1:8765/api/v1/applications/1
→ address_line1=1-2-3 Shibuya
  city=Shibuya-ku
  country=JP
  source=powercred
```

Both ports exercise the complete wizard path:
**Bureau Upload wizard → Next.js proxy (3000) → backend (8765) → postgres → dashboard read.**

## Browser screenshot — deferred to user

The `/dashboard` route is Auth0-gated. A real browser screenshot would
require a working dev Auth0 session, available in the user's local env
but not in this session. The HTTP-level evidence above proves the
backend + frontend proxy + DB chain works end-to-end. The user can
visually confirm by:

  1. Leaving `POWERCRED_BASE_URL` unset so the mock client runs.
  2. Running `npm run dev` (frontend) + backend with the Cloud SQL Proxy.
  3. Opening `/dashboard?id=<existing-applicant>` while signed in.
  4. Clicking "Upload bureau report", selecting `image.png`, advancing the wizard.
  5. Confirming the "Review extracted fields" step shows the canned
     residence-card extraction, then refreshing the dashboard to see the
     address populate the Customer Information card.
