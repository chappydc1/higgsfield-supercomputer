# powercred-improvements — Improvement Backlog

> **Status: backlog, not active work.** The current PowerCred upload + IDP flow was built as a POC and the trade-offs below were accepted deliberately to ship it. This document captures the production-hardening items to revisit *before* PowerCred carries real applicant volume. Drafted 2026-05-15 against branch `feat/powercred` ([commit 6c1c4bb5](https://github.com/Dwilar/lita-ehousing/commit/6c1c4bb5)).

## Current architecture (POC, as of 2026-05-15)

```
Dashboard wizard
    └─ POST /api/v1/credit-report/upload (frontend proxy → backend)
         └─ http_endpoints.upload_credit_report (backend/src/interface/http_endpoints.py:3036)
              ├─ Validate ext + 25MB cap + email
              ├─ INSERT powercred_reports (status='pending')   ← commit
              └─ _kick_off_powercred_background (daemon Thread)
                    ├─ powercred_client.upload_credit_bureau → POST /idp/read
                    ├─ Poll /idp/get until done OR poll budget expires
                    ├─ _pc_extract_fields → score_from_payload (powercred_score pkg)
                    ├─ UPDATE powercred_reports (status='success', scoring_data, …)
                    └─ _write_bureau_score_history → INSERT applicant_score_history (method='bureau')

PDF bytes:    in-memory only — never persisted on our side
                              PowerCred holds the file; we store signed input_url
Background:   daemon thread per upload, in-process polling
Status surface: GET /v1/credit-report/{id}/status (frontend polls)
```

## Improvements — prioritized

Each item lists **why** it matters, the **rough shape** of the fix, and a **size estimate** (S = day, M = week, L = multi-week). Items 1 and 4 are pre-production blockers in my opinion; 2 and 3 are operability gaps; the rest are hardening.

### 1. Persist the original PDF in our own object storage  *(L — but the only hard-to-fix-later item)*

**Why.** PowerCred holds the only durable copy; we store a signed URL pointing at *their* bucket. For credit decisioning, the source document is typically a regulatory retention artifact that must survive vendor changes, signed-URL expiry, and PowerCred outages. Once we've taken volume without retaining originals, those rows are unrecoverable.

**Shape.**
- Before forwarding to PowerCred, upload bytes to GCS (e.g. `gs://lita-bureau-raw/<application_id>/<reference_id>.pdf`) with object-lock / retention policy aligned to whatever the compliance team specifies.
- Add columns to `powercred_reports`: `our_storage_uri TEXT`, `content_sha256 CHAR(64)`, `content_size_bytes INTEGER`. Migration goes in `backend/migrations/postgres/`.
- Treat `our_storage_uri` as source of truth; keep `input_url` (PowerCred's signed URL) only as a convenience pointer.
- Service-account: prefer Workload Identity over a long-lived key.

**Watch out for.** PII handling on the bucket — encryption at rest + restrict ACLs to the backend SA only. No public read.

---

### 2. Move background work off `threading.Thread(daemon=True)` to a durable task queue  *(M)*

**Why.** Today `_kick_off_powercred_background` ([http_endpoints.py:2890](backend/src/interface/http_endpoints.py#L2890)) runs as a daemon thread inside the FastAPI process. Process crash, SIGTERM during deploy, or OOM-kill mid-poll leaves the row stuck `pending` with no retry. No backoff metrics, no concurrency cap, no dead-letter.

**Shape.** Cloud Tasks (GCP-native, already in the stack) or RQ on Redis.
- HTTP handler does `commit pending row → enqueue {report_id, file_uri}` and returns.
- Worker (separate deployable or same image with a `WORKER_MODE=powercred` env flag) pulls jobs, retries with exponential backoff, dead-letters after N failures with `status='error', error_message=<reason>`.
- Cloud Tasks gives queue depth + age in Cloud Monitoring out of the box — add a Grafana panel for it.

**Watch out for.** Idempotency: the worker must be safe to re-execute. Key on `report_id`; if status is already terminal, no-op.

---

### 3. Sweeper for stuck `pending` rows  *(S — do alongside item 2)*

**Why.** Even with a queue, transient failures can leave rows in a non-terminal state. There's currently no cron that finds and re-drives them, so an undeliverable webhook or a worker that exits before commit creates permanent zombies.

**Shape.** A small scheduled job (Cloud Scheduler → HTTP endpoint, or k8s CronJob, or just a long-running asyncio loop in the worker):

```sql
SELECT id FROM powercred_reports
 WHERE status = 'pending' AND created_at < NOW() - INTERVAL '15 minutes'
```

Re-enqueue (with attempt-counter to bound retries) or mark `error` after N hours. Emit a metric.

---

### 4. Replace in-process polling with PowerCred's webhook callback  *(M)*

**Why.** `powercred_client.upload_credit_bureau` already accepts a `callback_url` argument ([powercred_client.py:269+](backend/src/infra/external_apis/powercred_client.py)), confirming PowerCred supports push. We're not using it — we just poll. Each upload pins a Python thread and a DB session for the duration of IDP processing, wasted.

**Shape.**
- Add `POST /v1/credit-report/powercred-callback` — verifies a shared-secret signature header, looks up the row by `reference_id`, runs the same parse → score → persist flow as today.
- Polling becomes a *fallback only*, driven by the sweeper from item 3 (if no callback within X minutes, poll once and decide).

**Watch out for.** Callback verification (shared secret + HMAC). Replay protection: the row's `status` transition itself is the idempotency key — a second callback for an already-`success` row should no-op.

---

### 5. Store SHA-256 of the uploaded bytes  *(S)*

**Why.** Audit / dedup. Without a hash we can't (a) prove what we sent to PowerCred, or (b) detect re-uploads of the same file.

**Shape.** Compute `sha256(file_bytes)` in `upload_credit_report` before kicking off the background task; store on the row (covered by the migration in item 1). Optional: short-circuit if a `success` row already exists for the same `(email, content_sha256)`.

---

### 6. Decouple bureau scoring from IDP polling  *(S)*

**Why.** Today the same thread polls IDP, parses the response, runs `score_from_payload`, and commits. If scoring throws (e.g. a future scorecard-version bug), the parsed IDP response can be lost; rescoring requires re-uploading.

**Shape.** Two-phase write inside the worker:
1. On IDP success, persist `raw_response` + scalar columns to `powercred_reports` and commit.
2. Run scoring as a *separate step* (could be a separate Cloud Task with the report_id as input). On failure, the IDP data is already safe; the row sits at a `scored_pending` sub-state until rescore succeeds.

Bonus: rescoring becomes a script — `SELECT id FROM powercred_reports WHERE scoring_data IS NULL OR scorecard_version != $current`. Useful when the scorecard pipeline gets a fix.

**Schema add.** `powercred_reports.scorecard_version VARCHAR(32)` so we know which version of the powercred_score pipeline produced a given `scoring_data`.

---

### 7. Content scanning at the upload boundary  *(S)*

**Why.** Users → our backend → PowerCred. PDFs can carry active content. Low likelihood in a controlled applicant base, but we're a transit point and the cost is low.

**Shape.** Run ClamAV on the bytes before forwarding. If we adopt GCS upload-first (item 1), the built-in malware scanning on Cloud Storage can replace this.

---

### 8. Idempotent re-upload UX  *(S — frontend + backend coordination)*

**Why.** Re-uploading the same PDF (intentional or accidental) currently spawns a new row + a new PowerCred call (and presumably a new charge). The wizard has no notion of "you already uploaded this".

**Shape.** Once content hash exists (item 5), the upload endpoint can return `{ id: <existing>, status: <existing>, dedup: true }` for a hash that already has a `success` row for this applicant, and the wizard can branch on that.

---

### 9. Operability — metrics & logs  *(S)*

**Why.** Today there's `logger.info`/`logger.exception` and nothing else. No way to see "how many PowerCred uploads ran today, what's the success rate, what's the median IDP latency".

**Shape.** Add counters / histograms (via the existing observability stack):
- `powercred_upload_total{status="pending|success|error"}`
- `powercred_idp_duration_seconds` histogram from upload-start to success
- `powercred_score_history_write_total{result="ok|skipped|error"}`

Wire the existing `_write_bureau_score_history` and `_pc_extract_fields` log lines to a span too — they already prefix with `[score_history]` and `powercred_score pipeline OK …`, so the discovery work is done.

---

## What's already good — don't regress these

- **`pending` row committed before background work starts.** Right ordering. Even a worker that never runs leaves an auditable record.
- **`raw_response` JSONB + flattened scalar columns.** Good shape for both deep dives and fast dashboard queries.
- **Two-table split:** `powercred_reports` = authoritative bureau store, `applicant_score_history` = cross-pipeline audit ledger ([method='bureau'](backend/src/infra/postgres/score_history_repository.py) row). Don't fold these into one.
- **Best-effort `score_history` writes that don't fail the upload.** Right policy — operational store wins, audit ledger is eventually consistent.

## Recommended first move

If this only ever gets one round of investment before traffic, **do item 1 first** (durable PDF storage). Everything else is mid-flight retrofittable; missing originals are not.

Suggested grouping when we circle back:
- **Slice A (1 + 5 + 6):** durable storage + hash + decouple scoring. Establishes the data-correctness foundation in one schema migration + one worker change.
- **Slice B (2 + 3 + 4):** queue + sweeper + webhook. Operationally hardens the whole pipeline; can ship without touching slice A.
- **Slice C (7 + 8 + 9):** safety + UX polish + metrics. Lowest risk, do whenever.

## Related context

- [Post-submit application flow](../../docs/Housing+Application+DOMAIN/Post-submit+application+flow+and+background+pipelines.md) — where the bureau path sits in the overall application lifecycle.
- [feat/powercred branch](https://github.com/Dwilar/lita-ehousing/tree/feat/powercred) — Yogesh's branch; this plan is written against that diff.
- [PowerCred client](../../backend/src/infra/external_apis/powercred_client.py) — the IDP integration; callback_url support is already in `upload_credit_bureau`.
- [ScoreHistoryRepository](../../backend/src/infra/postgres/score_history_repository.py) — the audit-ledger write surface for both pipelines.
