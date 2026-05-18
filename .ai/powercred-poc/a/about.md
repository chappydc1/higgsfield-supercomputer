# PowerCred PoC — Project Blueprint

PowerCred is a third-party document-extraction and bank-statement-analysis API
that lita-ehousing is evaluating to (a) replace Inscribe for PDF fraud checks
and (b) provide structured extraction from applicant-supplied financial
documents (payslips, bank statements, utility bills, etc.).

## Scope

This `.ai/powercred-poc/` project tracks the staged evaluation of PowerCred
against lita-ehousing's document-processing needs:

- **Letter `a`** — Pre-meeting research brief from the public API documentation
  at https://apidocs.powercred.io. Produced before credentials, signup manual,
  or sample bureau PDFs are available. Output: `research.md`. No source-code
  changes.
- **Letter `b` (planned)** — Live API harness once credentials, the Postman
  collection, and sample bureau PDFs are provided. Will produce a small Python
  test client under `backend/scripts/powercred_poc/` plus a runnable
  `pytest` suite that exercises auth, IDP parse, status polling, and
  fraud-indicator endpoints against the sandbox.
- **Letter `c` (conditional)** — Production integration design and atomic
  commits, only if the PoC results clear the go/no-go criteria recorded in
  `a/research.md`.

## Decision criteria (drive go/no-go from letter `b`)

1. PowerCred's regional + document-type coverage matches lita-ehousing's actual
   applicant document mix.
2. Extraction accuracy on representative bureau / bank / payslip samples is at
   or above the threshold needed for downstream underwriting flows.
3. Fraud-detection signals are strong enough on a tampered-vs-clean sample set
   to retire (or supplement) Inscribe.
4. Latency (upload → callback) and cost-per-document fit the planned
   per-applicant budget.
5. Integration is feasible without material rework of the existing
   `applications` / `canonical_*` pipeline.

## Branch strategy

All PoC work merges into `tobias` (per user instruction), not `main`. Each
letter ships as a separate PR.
