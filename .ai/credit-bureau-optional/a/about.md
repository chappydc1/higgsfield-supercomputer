# Credit Bureau Report — Optional (Highly Recommended)

The application form's **Step 3: Connect your accounts** (`/application/connect-accounts`) presents the credit-bureau-report upload as an **optional** supplementary submission, clearly marked `(Optional)` in the card title and described as "highly recommended" in the body copy. It is no longer framed as a fallback for users who couldn't connect a personal bank account.

The form's continue gating remains unchanged: the user must connect at least one personal bank account to proceed; the credit report has no validation gate. Both Plaid and Salt Edge variants of the page (`pagePlaid.tsx`, `pageSalt.tsx`) carry the same wording.

## Scope of this task (E-housing Condition 1)

- Re-position the credit-report card as **optional** with consistent visual marker.
- Re-word the body copy to mark it as "highly recommended" without the "fallback if you couldn't connect" framing.
- Fix a copy bug where the Plaid variant said "Max file size: 15 MB" while validation enforces 25 MB.

## Out of scope (handled separately)

- **Condition 2** (resubmit flow without re-uploading bank docs when score is low) — Kapil, this week.
- **Chain-of-custody proof** that PDFs were downloaded directly from the bureau — 3-month PoC → long-term-contract focus area.
- **Wiring the credit-report file to backend submission** — the file input currently selects and validates files client-side but is not POSTed to any endpoint. Separate task; not blocking the wording fix.
