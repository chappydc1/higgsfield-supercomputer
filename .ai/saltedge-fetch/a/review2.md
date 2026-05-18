# Review 2 — saltedge-fetch (post-fix-round-1)

## Verdict: APPROVED

The fix round addresses both Round-1 criticals correctly, lands the
recommended pydantic constraint and three of the four major issues, and
cleanly defers the two majors that were marked out-of-scope. The test
surface gained two new high-value tests (the 2-consent per-connection
pin and the submit-vs-post-connect dedup regression), and the existing
tests were updated coherently for the fire-and-forget refactor. No
critical or major regressions detected. A handful of minor residuals
remain (catalogued below) but none rise to merge-blocking.

---

## Round 1 issue tracking

- **CRITICAL 1 (submit-time dedup poisoning)** — RESOLVED.
  `backend/src/interface/http_endpoints.py:305-313` gates the
  `_should_skip_due_to_dedup` call (and therefore the
  `_SALTEDGE_PULL_DEDUP` write) on `trigger != "submit"`, so the
  submit-time kick at `:230` no longer seeds the dedup map. The
  post-connect kick that arrives seconds later at
  `saltedge_endpoints.py:518` now passes the dedup check on its own
  merits. New regression test
  `test_submit_does_not_poison_post_connect_dedup`
  (`backend/tests/interface/test_saltedge_post_connect_kick_off.py:400-475`)
  pins the invariant.

- **CRITICAL 2 (auth/threat-model documentation)** — DEFERRED (with
  documentation, as the prompt allowed). Threat model is now documented
  in the docstrings of `persist_saltedge_connection`
  (`backend/src/interface/saltedge_endpoints.py:594-610`) and
  `sync_saltedge_customer` (`:777-784`), each citing the
  `application.email == request_data.customer_reference` check as the
  follow-up. Behavioural change is left to a follow-up PR per the fix
  prompt; this is acceptable for the intended pre-submit flow.

- **MAJOR 1 (dead `db` param)** — RESOLVED.
  `backend/src/interface/saltedge_endpoints.py:499-503` no longer takes
  the FastAPI `Session`; both call sites (`:743`, `:897`) drop the
  argument too.

- **MAJOR 2 (sync postgres lookup on persist critical path)** —
  RESOLVED. `backend/src/interface/saltedge_endpoints.py:533-574`
  spawns a `saltedge-load-{application_id}` daemon thread that runs the
  postgres `repo.get_by_id` call AFTER the dedup decision (which
  remains synchronous at `:518` so two rapid persists cannot both spawn
  loader threads). The persist HTTP response is no longer gated on
  postgres reachability.

- **MAJOR 3 (log prefix `[saltedge.post-connect] dedup-skip` for
  submit)** — RESOLVED. `backend/src/interface/http_endpoints.py:307-312`
  emits `[saltedge.pull] dedup-skip` regardless of trigger; the
  parallel post-connect helper in
  `saltedge_endpoints.py:519-524` uses the same prefix. The submit
  trigger now bypasses the dedup branch entirely (CRITICAL 1) so a
  `trigger=submit` log line under that prefix is unreachable. The
  existing test was updated at
  `backend/tests/interface/test_saltedge_post_connect_kick_off.py:371`
  to assert the new prefix.

- **MAJOR 4 (per-applicant dedup vs per-(applicant, connection))** —
  DEFERRED. Trade-off note added to the helper docstring at
  `backend/src/interface/http_endpoints.py:129-137`. Wording is
  accurate and points at MAJOR 4 in `review1.md`.

- **MAJOR 5 (pydantic `gt=0`)** — RESOLVED.
  `backend/src/interface/saltedge_endpoints.py:117-119` (persist) and
  `:143-145` (sync) declare
  `application_id: Optional[int] = Field(default=None, gt=0)`. Negative
  / zero values now produce a 422 at the boundary. No existing test or
  caller relies on `application_id == 0`.

- **MAJOR 6 (concurrent thread-pool dedup test)** — DEFERRED per
  prompt. Lock invariants remain pinned by `TestDedupGuard` at
  `backend/tests/interface/test_saltedge_post_connect_kick_off.py:483-528`
  (single-thread sequential coverage). Acceptable.

- **MAJOR 7 (2-consent test)** — RESOLVED.
  `test_persists_per_connection_for_each_of_two_consents`
  (`backend/tests/usecase/test_bank_data_pull_saltedge.py:431-531`)
  builds two consents (`consent_id=42`, `consent_id=43`) with distinct
  `connection_id` / `provider_code` / `fingerprint`, asserts each
  product type appears for each consent (8 expected pairs), and
  verifies both `connection_id`s flow through to `client.get_connection`.
  The new helper `_build_per_connection_client_stub`
  (`:389-428`) returns distinct payloads per `connection_id`.

---

## New issues (introduced by the fix)

### Minor

1. **Dedup entry is now claimed BEFORE the postgres load, so a
   missing-application or `TxSessionLocal=None` path poisons dedup for
   30s.**
   `backend/src/interface/saltedge_endpoints.py:518` runs
   `_should_skip_due_to_dedup` on the request thread and unconditionally
   writes `_SALTEDGE_PULL_DEDUP[application_id] = now`. The loader
   thread then opens `TxSessionLocal()` at `:549`; if the engine is
   unconfigured (`:537-543`) or `repo.get_by_id` returns None
   (`:551-558`), no pull is scheduled BUT the dedup entry persists.
   Subsequent legitimate persist calls within 30s for the same
   `application_id` are dedup-skipped despite the prior call having
   produced no pull. Pre-fix, the load happened inside
   `_post_connect_kick_saltedge_pull` BEFORE
   `schedule_saltedge_pull_for_application` (and its dedup check), so
   a missing-app path did not poison dedup. Practical impact is low —
   triggered only by buggy clients sending non-existent
   `application_id` (now further mitigated by `gt=0`) or by transient
   postgres outages. Worth a short comment at `:518` documenting the
   trade-off, but not blocking.

2. **`_spawn_saltedge_pull_thread` accepts `trigger: str` but never
   uses it.** `backend/src/interface/http_endpoints.py:234, 251-263`
   the inner `_pull` always logs `[saltedge.submit] thread started` /
   `[saltedge.submit] thread completed` regardless of trigger.
   On-call diagnosing a `persist`-triggered pull will see
   `[saltedge.submit]` logs in Cloud Run, which is misleading. This is
   pre-existing (the same `[saltedge.submit] thread started` log
   existed pre-fix inside `schedule_saltedge_pull_for_application`)
   but the refactor moved the log into a function whose `trigger`
   parameter is now exposed in the signature, making the omission more
   conspicuous. Suggested fix: thread `trigger` into the log message
   (e.g. `[saltedge.pull] thread started application_id=%s trigger=%s`).

3. **Unused alias `import threading as _threading` at
   `backend/tests/interface/test_saltedge_post_connect_kick_off.py:17`.**
   Never referenced anywhere in the file. Dead import — drop it.

4. **`_load_and_kick` lazily re-imports `TxSessionLocal` inside every
   loader-thread invocation
   (`backend/src/interface/saltedge_endpoints.py:535`).** Cheap at the
   Python level (subsequent imports are cached) but stylistically
   redundant. Pre-fix the same pattern lived in the synchronous
   helper. Not a regression, just unchanged.

5. **`_post_connect_kick_saltedge_pull` log
   `[saltedge.post-connect] kick application_id=… trigger=…` now
   fires BEFORE the loader thread spawns
   (`backend/src/interface/saltedge_endpoints.py:527-531`).**
   If the loader thread later finds `TxSessionLocal is None` or the
   application missing, the "kick" log is followed by either
   `[saltedge.post-connect] skip` or
   `[saltedge.post-connect] application_id=… not found` rather than a
   true thread start. Slightly misleading on-call but low impact.

6. **Test `test_dedup_within_30s_window` re-targets the patch site to
   `saltedge_endpoints_module.threading.Thread`
   (`backend/tests/interface/test_saltedge_post_connect_kick_off.py:351,
   382`).** Correct because the loader thread now lives in
   `saltedge_endpoints`. But the new test
   `test_submit_does_not_poison_post_connect_dedup` uses BOTH patch
   targets sequentially (`http_endpoints_module.threading.Thread` for
   the submit call, `saltedge_endpoints_module.threading.Thread` for
   the persist call) — readable but mixed. Not flaky, just an
   asymmetry.

### None of the focus-area concerns triggered

- The fire-and-forget refactor does NOT introduce a double-record race
  between dedup check and the spawned thread. The loader thread calls
  `_spawn_saltedge_pull_thread` directly
  (`backend/src/interface/saltedge_endpoints.py:561`), bypassing
  `schedule_saltedge_pull_for_application`'s dedup re-check. Since the
  dedup entry is already claimed on the request thread at `:518`,
  there is no second dedup write inside the loader thread.
- The pydantic `gt=0` constraint does NOT break any existing test or
  caller. Test bodies always send positive ids.
- The dedup-skip-on-submit fix did NOT break any existing test —
  `test_dedup_within_30s_window` uses an explicit pre-seeded entry, not
  an entry seeded by a real submit kick.
- New tests appear deterministic: the regression test
  (`test_submit_does_not_poison_post_connect_dedup`) freezes
  `time.monotonic` and patches `Thread` in both modules, the 2-consent
  test patches `TxSessionLocal=None` so it never hits real I/O.

---

## What is good

- The split of `schedule_saltedge_pull_for_application` (public,
  dedup-aware) vs `_spawn_saltedge_pull_thread` (private, no dedup)
  is a clean separation of concerns. The docstrings clearly delineate
  who consults the map.
  (`backend/src/interface/http_endpoints.py:234-276, 279-323`)
- Documenting the per-applicant dedup trade-off in
  `_should_skip_due_to_dedup` (`:129-137`) inline rather than in a
  separate doc gives future readers a fighting chance.
- Threat-model docstrings at
  `backend/src/interface/saltedge_endpoints.py:594-610, 777-784` name
  the specific FOLLOW-UP guard (`application.email ==
  request_data.customer_reference`), which is concrete enough that a
  future engineer can implement without re-deriving the model.
- The pydantic `gt=0` constraint is the cheapest possible improvement
  for the "noisy `application_id=0` log" concern from review1.
- The fire-and-forget refactor preserves the synchronous dedup
  invariant (two rapid persists for the same applicant cannot BOTH
  spawn loader threads) while removing postgres from the persist
  critical path. The dedup is consistently applied at exactly one
  place per trigger class.
- New `_build_per_connection_client_stub` helper at
  `backend/tests/usecase/test_bank_data_pull_saltedge.py:389-428` is
  reusable for any future per-connection wiring tests.
- `_SynchronousThread` shim
  (`backend/tests/interface/test_saltedge_post_connect_kick_off.py:32-50`)
  cleanly resolves the "the loader thread must execute before the
  assertion" tension without sleeping or polling.
- Submit-bypass logging behaviour: when `trigger="submit"` no
  `[saltedge.post-connect] kick` log fires
  (`backend/src/interface/http_endpoints.py:315-320`), so the
  `[saltedge.submit] kick-off` log at `:223-229` remains the
  authoritative submit signal.

---

## Recommendation

APPROVED. Both critical issues are resolved or appropriately deferred
with documentation. All majors are either addressed or explicitly
out-of-scope per the fix prompt. New issues are all minor (mis-labelled
log strings, dead import, dedup-on-load-failure trade-off) and can be
folded into a follow-up cleanup PR or addressed inline before merge if
the team prefers. Test coverage is meaningfully stronger than pre-fix.
