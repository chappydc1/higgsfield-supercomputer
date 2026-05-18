# PowerCred — Pre-Meeting Research Brief

**Source:** Public docs at https://apidocs.powercred.io (snapshot taken 2026-05-09).
Raw scrapes archived at `.ai/powercred-poc/a/.firecrawl/`.
**Scope:** Specs only. No live API calls (credentials arrive post-contract).

---

## 1. TL;DR — three things to settle in the meeting

1. **Regional fit is the biggest open question.** PowerCred's documented bank
   coverage is **Indonesia + Malaysia only** (BCA, Mandiri, BNI, BRI, OCBC,
   CIMB, Permata, Maybank, RHB, plus Islamic variants). The Intelligent
   Document Parser (IDP) goes broader — Philippines-heavy with 22 PH-specific
   document types — but **none of the 33 supported `document_type` enum values
   is a credit-bureau report** (no Experian / Equifax / TransUnion / SCHUFA /
   Creditsafe / etc. schema). If lita-ehousing's applicants submit Western
   bureau reports, PowerCred is a poor fit out-of-the-box; we'd be relying on
   their "Bring-Your-Own-Schema" feature with no published accuracy data.

2. **"Fraud check" ≠ generic PDF-tampering check.** The fraud-indicator
   endpoint (`POST /bank/transactions/fraud`) is **scoped to bank statements
   from supported banks only** (`bank_name` is an enum: `BCA | MANDIRI | BRI |
   BNI | OCBC | PERMATA | CIMB | MAYBANK`). It is **not** a drop-in Inscribe
   replacement for arbitrary PDFs. The "Document Authenticity Verification"
   described on the bank-statement intro page is metadata + font/typeface
   uniformity analysis — useful, but a sophisticated forger who flattens the
   PDF can defeat metadata checks.

3. **Async-only execution model.** Every parsing call returns `202` and the
   client must either poll `GET /idp/get` (or the equivalent bank-statement
   `/analysis/filestatus`) or supply a `callback_url` at session creation. We
   need a publicly-reachable callback endpoint on lita-ehousing, or we accept
   polling latency. There is no synchronous parse mode.

If the answer to (1) is "yes, our applicants are mostly SE Asia," PowerCred
looks promising and we should proceed to letter `b`. If the answer is "no,"
the PoC needs a much narrower scope (custom schema for one document type)
before any contract decision.

---

## 2. What PowerCred actually is

A multi-product document-intelligence API hosted on ReadMe.io docs. Five
product lines, all sharing a session-token auth model:

| Product line | What it does | Region |
| --- | --- | --- |
| **Intelligent Document Parser (IDP)** | OCR + structured extraction across 33 document types, default schemas + bring-your-own-schema | Latin-alphabet, SE-Asia-leaning |
| **Bank Statement Analysis** | Upload → analyse → JSON/Excel output. Includes EOD balances, top creditors/debitors, fraud indicators | Indonesia + Malaysia only |
| **Identity Verification** | KTP (Indonesian national ID) OCR v1/v2/v3 + FaceMatch & passive liveness | Indonesia |
| **Digital Insights API** | "Insights" endpoints (sparsely documented in public pages) | Unknown |
| **Telco Verification** | Telco data lookup endpoints | Unknown — likely India/SE Asia |

**Sandbox base URL:** `https://mock.powercred.io` (one auth endpoint exposes
`http://mock.powercred.io` — almost certainly a docs typo, but flag during
sign-up).
**Production base URL:** not in public docs. Must come from the signup manual
or contract.
**Docs last updated:** 10–12 months ago. Stable but slow-moving.

---

## 3. Authentication

`POST {base}/auth/token`

- **Query params**:
  - `secret` *(required, string)* — the API key issued at signup.
  - `redirect_url` *(optional, string)* — if set, results are POSTed here
    asynchronously; otherwise the client polls.
- **Body** (JSON):
  - `user_id` *(required, string)* — the **end-user identifier** (e.g. their
    phone number, per the IDP introduction example). Multiple sessions per
    `user_id` are allowed — all session data aggregates under one user.
- **Response 200**: token (full schema not visible publicly — confirm at
  signup).

Implications:
- The `user_id` is the applicant identifier, not lita-ehousing's tenant id.
  We need to decide what we send: applicant phone, internal applicant_id, or
  a hashed equivalent. **PII implication**: if we send raw phone numbers
  PowerCred holds them; sending opaque IDs is safer.
- The auth endpoint expects the API key in the **query string**, not a header.
  Make sure callers don't accidentally log full URLs.

---

## 4. Intelligent Document Parser (IDP) — the OCR/extraction product

Two endpoints, both async:

### 4.1 `POST /idp/read` — Start Parsing

- **Query params**:
  - `reference_id` *(required)* — the session ID from `/auth/token`.
  - `document_type` *(required, enum, 33 values)* — see §4.3.
  - `file_url` *(optional)* — public URL to the PDF/JPG/PNG. Mutually
    exclusive with `file` body param.
  - `callback_url` *(optional)* — overrides the session-level redirect.
- **Body (multipart/form-data)**:
  - `file` *(file)* — direct upload (PDF/JPG/PNG).
  - `schema_file` *(file, optional)* — Bring-Your-Own-Schema definition for
    custom output. **This is the escape hatch** for unsupported document
    types.
- **Responses**: `202` accepted, `400` bad request, `422` validation, `500`
  server error.

### 4.2 `GET /idp/get` — Get Document Data

- **Query params**:
  - `id` *(required)* — the session ID.
  - `document_type` *(optional)* — filter to one type, or omit for all.
  - `return_json` *(optional, default `false`)* — **CRITICAL**: by default the
    response is an `excel_url` + `input_url`. To get structured JSON, set
    `return_json=true`. Production integration almost certainly wants JSON;
    don't accept the default.

### 4.3 Supported `document_type` enum (33 values)

Generic (Latin alphabet, region-agnostic):
`invoice, bank_statement, payslip, passport, employment_certificate,
utility_bill, loan_statement, credit_card_statement, itr`

Indonesian:
`ktp, kartu_keluarga`

Philippines (22 types — clearly the deepest country coverage):
`alien_registration_card_ph, barangay_clearance_ph, driving_license_ph,
dti_registration_ph, firearm_license_ph, national_id_ph, nbi_clearance_ph,
pag_ibig_ph, philhealth_ph, police_clearance_ph, prc_id_ph, sssid_ph,
tax_id_ph, umid_ph, voter_id_ph, incorporation_certificate_ph,
partnership_certificate_ph, articles_of_partnership_ph,
articles_of_incorporation_ph, gis_ph, by_laws_ph, secretary_certificate_ph`

**Notably absent:**
- Credit-bureau reports (Experian, Equifax, TransUnion, SCHUFA, Creditsafe…)
- US tax forms (W-2, 1099, 1040)
- European payslips (German Lohnabrechnung, Dutch loonstrook…)
- ID documents from US/EU/UK

### 4.4 Default extracted fields (sampled)

The IDP intro page lists default schemas for the generic types. Highlights:

- **Bank statement**: `account_holder_name, account_number, bank_address,
  account_holder_address, statement_start_period, statement_end_period`,
  per-transaction `date, description, debit_amount, credit_amount, type,
  balance`.
- **Payslip**: `employer_name, employee_name, gross_salary, net_salary,
  allowances, deductions, deduction_description, year_to_date_salary,
  payslip_month, credit_bank_name, credit_bank_account_number,
  hr_email_information, country_of_employment, currency_of_payslip,
  language_of_payslip`.
- **Passport**: `passport_number, holder name/address/gender/dob,
  issuing_country, issuance_date, expiration_date`.
- **Loan statement**: `account_holder_name, account_number, bank_name,
  loan_amount, outstanding_loan_amount, monthly_installments,
  tenure_paid, tenure_pending, please_pay_by_date` + transactions.
- **Credit-card statement**: account info + transactions.
- **Utility bill, ITR, employment certificate, invoice**: see scrape at
  `.firecrawl/idp-intro.md`.

Confirm field-level coverage during the sandbox PoC — docs are 12 months old
and may understate or overstate the current schema.

---

## 5. Bank Statement Analysis — the fraud / analysis product

Five-step workflow, all async:

1. `POST /bank/analysis/stmt/upload` (PDF) **or** `POST /bank/analysis/stmt/upload/img`
   (JPG/PNG) — upload statement. *(Note: `/analysis/` segment is required —
   `/bank/stmt/upload` is **not** a valid path.)*
2. `POST /bank/analysis/stmt/publish` — start analysis.
3. `GET /bank/analysis/filestatus` — poll for processing status.
4. Fetch outputs:
   - `GET /bank/transactions/fetch` — accounts + transactions JSON.
   - `GET /bank/transactions/analysis/fetch` — **analysis + tamper-check**
     JSON. **This is the fraud output** in JSON form.
   - `GET /bank/analysis/statement` — raw analysis Excel.
   - `GET /bank/analysis/profile` — all processed statements JSON.
5. Optional helpers: `EOD balances`, `top 5 debitors/creditors`, `filter
   transactions by type`, dedicated `Fraud Indicators` (`POST
   /bank/transactions/fraud`).

> **Path verification (post-Codex review).** All nine bank-statement endpoint
> paths above were re-grepped against `.firecrawl/*.md` and confirmed
> verbatim. The full path map is also documented in §11 (Endpoint reference
> table) so the harness in letter `b` can be built from a single source of
> truth.

### 5.1 Fraud Indicators endpoint

`POST /bank/transactions/fraud`

- **Query params**:
  - `id` *(required)* — session ID.
  - `bank_name` *(enum)*: `BCA | MANDIRI | BRI | BNI | OCBC | PERMATA | CIMB |
    MAYBANK`.
  - `account_number` *(string)*.
  - `generate_excel` *(bool, default false)*.
- **Responses**: `200`, `400`, `404`. Response payload schema not visible
  publicly — must capture during sandbox testing.

### 5.2 What the fraud check actually examines

From the bank-statement intro:

> Our tool conducts a detailed forensic examination of financial statements,
> analyzing **metadata like PDF creation software and document timestamps**,
> as well as ensuring **uniformity in font size, color, and typeface**
> throughout the document to ascertain its authenticity.

So: PDF metadata + visual uniformity. Useful against amateur tampering
(e.g. someone editing a number in Acrobat). **Likely defeated by:**
- Re-printing → re-scanning the tampered PDF (kills metadata).
- Fully regenerating the PDF from a forged source (uniform fonts).
- Generative-AI document forgery.

This is a meaningful capability but should not be considered an
all-tampering-defeating layer. Inscribe and similar tools claim broader
heuristics (cross-document consistency, transaction-level statistical
anomalies, embedded-image analysis). Direct comparison test plan goes in §10.

---

## 6. Async execution model

Every meaningful endpoint is asynchronous. Two consumption patterns:

| Pattern | Cost | Best for |
| --- | --- | --- |
| **Polling**: client repeatedly calls `GET /idp/get` (or `GET /bank/analysis/filestatus`) until done. | More requests, more latency, simpler ops. | Backend cron / Celery workers; environments without public ingress. |
| **Callback**: client supplies `callback_url` at session creation (or per-call). PowerCred POSTs the result. | Faster, fewer requests, requires a public HTTPS endpoint that accepts POST. | Production — assuming we have an ingress controller able to receive webhooks. |

PowerCred explicitly does not support GET-method callbacks.

**For lita-ehousing**, GCP Cloud Run is already used for the FastAPI backend
(per `.claude/skills/local-postgres-proxy/`). A new authenticated webhook
endpoint at `/api/v1/integrations/powercred/callback` is feasible. We would
need:
- HMAC signature verification (PowerCred docs are silent on signing — must
  ask).
- Idempotency keyed on `(reference_id, document_type)`.
- A persistence model that links the PowerCred session → applicant.

---

## 7. Integration sketch into lita-ehousing

Slotting PowerCred into the existing pipeline:

**Existing surfaces (per memory + repo context):**
- Applicants flow through `/applicants` and `/dashboard`.
- Document storage: applicant uploads land via Salt Edge / Plaid pipeline +
  direct uploads. The `canonical_transactions`, `canonical_financial_accounts`,
  `canonical_income_summaries` tables already provide a "canonical" layer.
- Local dev DB is Cloud SQL Proxy on `127.0.0.1:5432`.

**Proposed integration shape (subject to letter `b` validation):**

1. **New service module** `backend/integrations/powercred/` containing:
   - `client.py` — async HTTPX client wrapping `/auth/token`, `/idp/read`,
     `/idp/get`, and the bank-statement endpoints. Configurable base URL
     (sandbox vs prod) and `secret` from env.
   - `schemas.py` — Pydantic v2 models (`PowerCredSession`, `IDPParseRequest`,
     `IDPDocumentResult[T]`, `BankStatementAnalysis`, `FraudIndicators`).
     Generic over per-document-type field models.
   - `mapping.py` — translates PowerCred output → existing `canonical_*`
     rows. This is where field-name mismatches surface (e.g. PowerCred
     `debit_amount` vs canonical `debit`).
2. **New table** `powercred_jobs` (or extend an existing `documents` table)
   with: `id, applicant_id, session_id, reference_id, document_type, status,
   submitted_at, completed_at, raw_payload_jsonb, error`. Used for retries
   and audit.
3. **Webhook endpoint** `POST /api/v1/integrations/powercred/callback`
   protected by HMAC. Persists raw payload, then dispatches a normalisation
   job.
4. **Background worker** (existing infra TBD — Celery? Cloud Tasks?) for the
   poll-fallback path and for retrying failed normalisations.
5. **Admin UI surface** — show extracted vs. canonical fields side-by-side on
   the applicant detail view, plus the fraud-indicator verdict.

**Risk areas:**
- Two-stage workflow (`upload` → `publish` → `fetch`) requires careful state
  machine. A naive implementation will leak orphaned sessions on errors.
- `canonical_transactions` is already populated by Salt Edge. If we also
  populate it from PowerCred bank-statement parses, we need a `source` /
  precedence column to avoid duplicates and conflicts.

---

## 8. Open questions for the meeting

Bring a printed copy of this list.

### Coverage
1. What is lita-ehousing's actual applicant geographic distribution? If
   ≥80% are outside SE Asia, the bank-statement-analysis product is mostly
   useless to us.
2. Which applicant document types are highest-volume today? Map them to the
   33-value enum. Note any gap that would need Bring-Your-Own-Schema.
3. Does PowerCred have any non-public document types (e.g. credit-bureau
   reports under contract)? Their public docs explicitly omit it; ask
   directly.
4. What languages does IDP support beyond English? "Latin alphabet" is
   claimed but not enumerated.

### Pricing & SLA
5. Per-document pricing tier — IDP vs Bank Statement Analysis vs fraud
   endpoint. Do we pay per call or per document?
6. Volume commitment? Minimum monthly spend?
7. Latency SLA (p50/p95) for PDF parsing? Bank statement analysis?
8. Uptime SLA? Penalty on miss?
9. Rate limits — per-second / per-minute / per-day? Burst allowance?

### Security & compliance
10. Where is data hosted? Which region? Cross-border-transfer implications?
11. Data retention policy. How long do they keep the original PDF + extracted
    output? Right-to-delete API?
12. PII scrubbing: is the document content used to train their models? Opt-out?
13. Webhook signature scheme — HMAC? Bearer? Mutual TLS?
14. PCI scope — credit-card-statement parsing means we may capture full PANs
    in extraction output. Are PANs masked by default? Configurable?
15. Encryption at rest, encryption in transit (the sandbox `auth/token`
    endpoint is documented as `http://`, not `https://` — confirm this is a
    docs typo).
16. Sub-processor list. GDPR / SOC 2 / ISO 27001 attestations.

### Operational
17. Sandbox vs production base URL.
18. Is there a way to inspect a session's history (admin/debug endpoint)?
19. How are API key rotations handled? Multiple keys per environment?
20. What does an error response actually look like (404, 422, 500)? Schema?
21. Retry semantics — is `POST /idp/read` idempotent if we send the same
    `reference_id` + `document_type`?
22. Monthly volume reporting — do they expose a usage/billing API?
23. Is there an OpenAPI / Postman export we can drop into the repo?

### Fraud-specific
24. What fraud signals does the response payload contain? (Boolean? Score?
    Per-page?)
25. Confusion matrix on their internal validation set — false-positive and
    false-negative rates.
26. Is there a "challenge bank" we can submit a known-tampered PDF against
    during PoC?
27. How do they compare against Inscribe on their own benchmark? (They will
    spin this; ask anyway.)

### Replacing Inscribe
28. Can PowerCred extract from US/EU bureau reports today, even via custom
    schema? If yes, accuracy on a few sample reports?
29. If we keep Inscribe for non-SE-Asia and use PowerCred for SE-Asia, what's
    the cost-benefit? Is consolidation actually cheaper?

---

## 9. Risks & not-suitable scenarios

- **Wrong-region data.** US/EU bureau reports, US bank statements (Chase, Wells
  Fargo, Bank of America), European IBAN-style statements — none are in the
  documented coverage.
- **Synchronous needs.** Any UX flow requiring sub-second extraction (e.g.
  "show me what we extracted while the user is still on the upload screen")
  is incompatible with the async-only model unless we bound latency carefully.
- **GenAI-forged documents.** Metadata + font-uniformity checks will not catch
  documents generated end-to-end by a forger.
- **Audit trail.** Docs do not mention immutable audit logs of what they
  extracted from what file. We need to keep our own copy (raw payload +
  hashed input file).

---

## 10. Recommended PoC test plan (letter `b`)

Once API access lands and we have the signup manual + Postman collection,
letter `b` should execute:

### Phase 1 — Connectivity & schema (≤1 day)
- `POST /auth/token` against sandbox. Capture token shape, expiry, error
  responses.
- Verify the `secret` query-param model works as documented (confirm it isn't
  also accepted as `Authorization: Bearer`).
- Trigger every documented error (`400`, `404`, `422`, `500`) — record the
  exact response shape per status.

### Phase 2 — IDP accuracy (1–2 days)
- Run 10 sample documents per type, for the 3–5 document types our applicants
  actually submit. Score field-level accuracy (extracted vs. ground truth).
- Test with `return_json=true` on every call. Compare field set vs. the
  default schemas in §4.4.
- Test Bring-Your-Own-Schema with a synthetic schema for a document type not
  in the enum (e.g. a generic "credit_summary"). Score accuracy.

### Phase 3 — Bank Statement Analysis (1 day, only if we have SE-Asia samples)
- Full pipeline: upload → publish → poll → fetch transactions JSON +
  analysis/tamper-check JSON.
- For each supported bank, run 1–2 statements and validate the transaction
  list matches ground truth.

### Phase 4 — Fraud detection comparison (1–2 days)
- 5 clean PDFs and 5 tampered PDFs (modify a transaction, change a balance,
  alter the holder name) on a supported bank.
- Score: how many tampered did PowerCred flag? How many clean did it
  false-positive? Compare against Inscribe on the same set.
- Repeat with a "print → scan" tampered set to measure metadata-loss bypass.

### Phase 5 — Production readiness (≤1 day)
- Webhook callback flow vs. polling — measure end-to-end latency and request
  count.
- Concurrency stress: 10 concurrent sessions, 50 concurrent reads. Did rate
  limits kick in? At what threshold?
- Error injection: kill mid-flight, malformed PDF, non-PDF binary, oversized
  file. Does the API behave?

### Deliverables (letter `b`)
- `backend/scripts/powercred_poc/test_client.py` — minimal async client.
- `backend/tests/integration/powercred/` — pytest suite covering Phases 1–5
  with assertions, scoreboard CSV.
- `.ai/powercred-poc/b/results.md` — per-phase results, accuracy scores,
  latency histograms, and a final go/no-go recommendation against the
  criteria in `about.md`.

---

## 11. Endpoint reference (verified verbatim against scrapes)

This is the **single source of truth** for paths the letter `b` harness
must build against. Every URL below was extracted from the cURL examples in
`.firecrawl/*.md` and re-verified by `grep -E "https?://mock\.powercred\.io"
.firecrawl/*.md`. If a path here disagrees with prose elsewhere in this
brief, this table wins.

| Method | URL | Evidence file |
| --- | --- | --- |
| `POST` | `http://mock.powercred.io/auth/token` *(http: in docs — confirm with vendor)* | `auth-token.md` |
| `POST` | `https://mock.powercred.io/idp/read` | `idp-parse.md` |
| `GET` | `https://mock.powercred.io/idp/get` | `idp-get.md` |
| `POST` | `https://mock.powercred.io/bank/analysis/stmt/upload` | `bank-upload.md` |
| `POST` | `https://mock.powercred.io/bank/analysis/stmt/upload/img` | (verified via WebFetch of `method_stmt_upload_img_post`) |
| `POST` | `https://mock.powercred.io/bank/analysis/stmt/publish` | `bank-publish.md` |
| `GET` | `https://mock.powercred.io/bank/analysis/filestatus` | `bank-filestatus.md` |
| `GET` | `https://mock.powercred.io/bank/transactions/fetch` | (verified via WebFetch of `get_transactions_details_transactions_fetch_get`) |
| `GET` | `https://mock.powercred.io/bank/transactions/analysis/fetch` | `bank-analysis-fetch.md` |
| `GET` | `https://mock.powercred.io/bank/analysis/statement` | (verified via WebFetch of `get_bank_excels_analysis_statement_get`) |
| `GET` | `https://mock.powercred.io/bank/analysis/profile` | (verified via WebFetch of `get_bsa_output_analysis_profile_get`) |
| `POST` | `https://mock.powercred.io/bank/transactions/fraud` | `bank-fraud.md` |
| `POST` | `https://mock.powercred.io/identity/get/ocr/ktp/v3` | `ktp-v3.md` |

`mock.powercred.io` is the sandbox base. Production base URL is not in the
public docs and must come from the signup manual / dashboard.

---

## Appendix: scraped reference pages

All raw scrapes are in `.ai/powercred-poc/a/.firecrawl/`:

| File | Endpoint / page |
| --- | --- |
| `urls.json` | full URL inventory of `apidocs.powercred.io` (34 pages) |
| `auth-token.md` | `POST /auth/token` |
| `idp-intro.md` | IDP overview + default schemas |
| `idp-parse.md` | `POST /idp/read` |
| `idp-get.md` | `GET /idp/get` |
| `bank-upload.md` | `POST /bank/analysis/stmt/upload` |
| `bank-publish.md` | `POST /bank/analysis/stmt/publish` |
| `bank-filestatus.md` | `GET /bank/analysis/filestatus` |
| `bank-fraud.md` | `POST /bank/transactions/fraud` |
| `bank-analysis-fetch.md` | `GET /bank/transactions/analysis/fetch` |
| `supported-banks.md` | Region + bank coverage |
| `sample-schemas.md` | Default IDP schema files |
| `ktp-v3.md` | Indonesian KTP OCR v3 |
