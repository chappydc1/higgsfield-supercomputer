# PowerCred PoC — Letter `b`: Live OCR Sandbox Test

Building on the spec-only research in letter `a` (`.ai/powercred-poc/a/research.md`).

## Status

`Phase 0` complete: scaffolding ready, fixture staged. Phase 1 onward is
**blocked on credentials**: needs either browser approval for
`app.powercred.io` (so we can pull the API key from the dashboard) or the
key + production base URL pasted directly into `backend/.env`
(gitignored). Until either lands, no live API calls happen here.

## Fixture

**`fixtures/sample-zairyu-card.png`** — a Japanese Residence Card (在留カード)
specimen showing "TURNER ELIZABETH". Marked 「見本 SAMPLE」 in the document
itself, so no PII concerns. Source: copied from the repo root `image.png`
provided by the user as the canonical OCR test input.

This fixture is deliberately **adversarial against PowerCred's documented
coverage**:

| Property | Value | Why it stresses PowerCred |
| --- | --- | --- |
| Document type | Japanese Residence Card | **Not in the 33-value `document_type` enum.** Closest fits are `passport` (different layout) or `ktp` (Indonesian, will likely 422). Forces use of Bring-Your-Own-Schema. |
| Language | Japanese kanji + kana + Latin | PowerCred claims "any Latin-alphabet language" — this fixture is mixed-script and tests the boundary literally. |
| Region | Japan | PowerCred's documented coverage is Indonesia + Malaysia (bank statements), Indonesia (KTP), Philippines (22 PH-specific types), and generic Latin types. Japan is unlisted. |
| Field set we want extracted | `name`, `card_number`, `date_of_birth`, `nationality`, `status_of_residence`, `period_of_stay`, `expiration_date`, `issue_date`, `issuing_authority`, photograph_present, sample_watermark_detected | Lets us measure structured-extraction quality outside the vendor's happy path. |

This is exactly the document type lita-ehousing would see from a Japanese
applicant — so a passing result here is real evidence; a failing result tells
us "we'll need a different vendor (or build our own) for Japanese ID".

## Test plan (executed once credentials land)

Per §10 of `a/research.md`, but adapted to this fixture:

### Phase 1 — Connectivity & schema (≤30 min once unblocked)
- `POST {base}/auth/token?secret={key}&redirect_url=` with body
  `{"user_id": "powercred-poc-test"}`. Capture token, expiry, error shapes.
- Trigger every documented error code (400, 422) by sending malformed
  payloads. Record exact response shape per status.

### Phase 2 — IDP extraction on the fixture (~1 hour)

Run the fixture through `POST /idp/read` with several `document_type`
values to map PowerCred's behaviour:

| Attempt | `document_type` | `schema_file` | Hypothesis |
| --- | --- | --- | --- |
| 2.1 | `passport` | (default) | Closest in-enum match. Will likely partial-extract name + DOB + expiration; struggle on Japanese-language fields. |
| 2.2 | `ktp` | (default) | Indonesian-specific. Likely 422 or garbage output. Tests how badly it degrades. |
| 2.3 | (Bring-Your-Own-Schema) | `schemas/zairyu-card.json` (custom — to be authored in this letter) | The escape hatch. Should produce the highest-quality extraction if PowerCred's "any Latin alphabet" claim holds. |

For each attempt, capture:
- HTTP status + raw response.
- Polling vs callback latency (use polling for now — webhook needs separate
  ingress setup).
- Per-field accuracy: extracted value vs ground-truth (which we
  hand-transcribe from the image into `fixtures/ground-truth.json`).

### Phase 3 — Production-readiness probes (~30 min)
- `return_json=true` on the GET to confirm JSON works (default is Excel URL).
- Trigger 422 with a corrupted PNG to see error structure.
- Note token TTL — does the same `reference_id` work for multiple `/idp/read`
  calls within a session, or is it single-shot?

### Phase 4 — Decision
Write `b/results.md` with per-field accuracy scores and a single bottom-line
recommendation: **"PowerCred IDP is/isn't viable for Japanese ID extraction"**,
plus a separate go/no-go for the bank-statement product (which is region-
locked to ID/MY/PH and orthogonal to this fixture).

## Non-goals for letter `b`

- No bank-statement upload testing (no SE-Asian bank-statement fixture
  available).
- No fraud-detection testing (needs a tampered PDF set we don't have).
- No production code wiring — that's letter `c`, conditional on `b` clearing
  the go/no-go criteria in `a/about.md`.

## Files

- `b/about.md` — this file.
- `b/fixtures/sample-zairyu-card.png` — the test input.
- `b/fixtures/README.md` — describes the fixture and how it was sourced.
- `b/fixtures/ground-truth.json` — to be authored once we run extraction so
  we can score accuracy (don't pre-author it; that biases the test design).
- `b/schemas/zairyu-card.json` — custom Bring-Your-Own-Schema, authored
  during Phase 2.3.
- `b/logs/` — per-phase results.
- `b/results.md` — final scorecard + recommendation (Phase 4 deliverable).
