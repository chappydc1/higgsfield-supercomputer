# Review 1 — saltedge-fetch

## Verdict: NEEDS_CHANGES

The changeset is mostly correct and well-tested. The threading + dedup logic is sound for the basic post-connect-twice-fast scenario, the frontend gating is defensive against `application_id=0/NaN`, and the test surface is good. But there is **one real correctness concern** (submit-time dedup poisoning post-connect kicks), **one real authn/authz concern** (the persist/sync endpoints have no auth and now schedule a daemon thread for an attacker-supplied `application_id`), and a handful of smaller issues. None are individually merge-blocking, but together they argue for one more pass before this lands.

---

## Critical issues (must fix before merge)

- [ ] **Submit-time kick poisons the dedup map for legitimate post-connect kicks.**
      `backend/src/interface/http_endpoints.py:204-221` (`_kick_off_saltedge_submit_pull`) → `:224-291` (`schedule_saltedge_pull_for_application`).
      The submit-time kick at `http_endpoints.py:2298` (the `create_application` call site) now goes through the same dedup map (`_SALTEDGE_PULL_DEDUP`) as the post-connect kicks. Concrete scenario:

      1. `t=0`: User submits the application. `submit_housing_application` → `_kick_off_saltedge_submit_pull(application)` → `schedule_saltedge_pull_for_application(application, trigger="submit")` → records `_SALTEDGE_PULL_DEDUP[28]=t0`, spawns the daemon, returns.
      2. The submit-time pull reads `live_consents` (which may be empty if the user hasn't yet connected a bank, or stale if they connected one mid-submit — common: the SaltEdge widget closes ~milliseconds before the user clicks "submit").
      3. `t=2`: SaltEdge widget redirects → frontend calls `POST /api/saltedge/connection/{id}/persist` with `application_id=28`. `_post_connect_kick_saltedge_pull` → `schedule_saltedge_pull_for_application(app, trigger="persist")` → `_should_skip_due_to_dedup(28)` returns `True` (entry from `t=0` still inside the 30s window) → log `"[saltedge.post-connect] dedup-skip application_id=28 trigger=persist"` and return. **The new connection is never pulled.**

      The user is left with no transactions until either (a) the next sync-on-mount fires *after* `t=30s` and the user is still on the page, or (b) the user re-links the bank manually. For the canonical "submit then connect" flow this is exactly the bug this PR was meant to fix.

      **Suggested change:** dedup only when `trigger != "submit"`, OR dedup by `(application_id, trigger_class)` where `trigger_class in {"submit", "post-connect"}` so that submit and post-connect each have their own 30-second window. Simplest fix: skip the dedup recording in `schedule_saltedge_pull_for_application` when `trigger == "submit"`. The submit path is already only reachable from one HTTP handler (`create_application`), so spamming it isn't a real concern.

- [ ] **Persist/sync endpoints have no authentication, and now schedule a SaltEdge pull thread for an attacker-supplied `application_id`.**
      `backend/src/interface/saltedge_endpoints.py:538-545` (`persist_saltedge_connection`) and `:705-712` (`sync_saltedge_customer`) declare only `db: Session = Depends(get_db)` — no `Depends(get_current_user_email)` or similar. With this PR, an unauthenticated attacker can:

      1. POST `/api/saltedge/customer/<any_known_customer_id>/sync` with body `{"customer_reference":"victim@example.com","application_id":28}`. If upstream `list_connections(customer_id)` returns at least one connection that doesn't already exist for that customer in our DB, `persisted_ids` is non-empty and `_post_connect_kick_saltedge_pull(...)` schedules a SaltEdge pull thread for application 28 — even though the attacker doesn't own application 28.
      2. The pull thread will issue real SaltEdge API calls (cost) and write `bank_data_snapshots` rows for the wrong applicant (data integrity).

      Practical attack surface is partially limited because the attacker must also know a valid SaltEdge `customer_id` and `connection_id` to make `get_connection`/`list_connections` succeed. But the attack is **not** prevented by the upstream call — the persist endpoint will happily call `repo.upsert_from_widget_return(... application_id=request_data.application_id, ...)`, which writes a consent row with the attacker-chosen `application_id` regardless of whether it matches the upstream connection's owner.

      This is largely a **pre-existing** issue (the persist endpoint already trusted `application_id` for the consent upsert before this PR). But this PR amplifies the blast radius: the `application_id` field now causes a privileged daemon thread to spawn, not just a DB row.

      **Suggested change:** add an authentication dependency to `persist_saltedge_connection` and `sync_saltedge_customer` (matching the older `connect-url` endpoint at `:174` which uses `Depends(get_current_user_email)`). At minimum, verify that the `customer_reference` (applicant email) matches the authenticated user's email before honouring the body's `application_id`. If reauthing the connect-accounts flow is out of scope (it appears to be unauthenticated by design — pre-submit users have no token), then add a server-side check that `application_id`'s `email` matches `request_data.customer_reference`. This change need not gate this PR if a follow-up issue is filed and tracked.

      If the pre-existing unauthenticated nature of these endpoints is consciously scoped, this still warrants an explicit comment in the persist/sync handlers and a tracked follow-up.

---

## Major issues (strongly recommended)

- [ ] **`_post_connect_kick_saltedge_pull` takes a `db: Session` argument but never uses it.**
      `backend/src/interface/saltedge_endpoints.py:489-535`. The handler passes the FastAPI request session but the helper opens a fresh `TxSessionLocal()` internally and does all its work there. Dead parameter — confusing to future readers and adds a fake "this hook needs the request DB" coupling. Drop the parameter or use it (e.g., to short-circuit when `db.bind` already points at the postgres engine).

- [ ] **Persist endpoint now does a synchronous postgres lookup on every call.**
      `backend/src/interface/saltedge_endpoints.py:685-691` calls `_post_connect_kick_saltedge_pull` *before* returning the persist response. Inside that helper, `with TxSessionLocal() as tx_session:` opens a postgres connection (via the Cloud SQL connector in prod) and runs `repo.get_by_id(application_id)`. If postgres is sluggish or down, the persist endpoint blocks/errors even though its primary job (the MySQL upsert) succeeded. The catch-all `except Exception:` in the helper does swallow exceptions, but a postgres connection-acquisition timeout is not necessarily an `Exception` raised quickly — it can hang.

      **Suggested change:** spawn a thread immediately and load the application inside the thread — the helper itself becomes fire-and-forget. The postgres lookup is not on the request critical path; only the dedup decision is, and that's already in-memory. Or: queue the kick via `asyncio.create_task`/`BackgroundTasks` (FastAPI native) so it runs after the response is flushed.

- [ ] **Submit-time `[saltedge.submit] kick-off` log fires *before* the dedup check, then `[saltedge.post-connect] dedup-skip ... trigger=submit` fires inside the helper.**
      `backend/src/interface/http_endpoints.py:213-220` followed by `:242-249`. When dedup blocks a submit-time call (rare but possible when a post-connect just ran), logs read:
      ```
      [saltedge.submit] kick-off application_id=28 country=SE email=...
      [saltedge.post-connect] dedup-skip application_id=28 trigger=submit ttl=30.0s
      ```
      The "post-connect" prefix on a `trigger=submit` line is confusing for on-call. Either drop the prefix in the log message and emit `[saltedge.pull] dedup-skip ...` regardless of trigger, or move the `[saltedge.submit] kick-off` log inside the helper so it never fires when the call is dedup-skipped.

- [ ] **Dedup map only key is `application_id`; concurrent persist+sync from the same applicant block legitimate per-connection pulls.**
      `backend/src/interface/http_endpoints.py:115-147`. If the user adds a second bank within 30 seconds of the first (e.g., both a personal and a business account at the same provider), the second persist's hook is dedup-skipped and the second connection's transactions are never pulled until either the first thread re-iterates consents (it iterates all live consents via `list_live_by_application` — see `bank_data_pull.py:633-645`) or the next sync-on-mount fires after 30s.

      Looking closer: `run_submit_saltedge_pull` *does* iterate ALL live consents for the application, including any that landed between the persist call and the time the thread reads from the DB. So in many cases the first thread will pick up the second connection naturally. This is a soft mitigation but only works when the second persist lands BEFORE the first thread reaches `list_live_by_application`. There's a window (typically 100ms-1s) where the second persist could miss the first thread's read and also be dedup-skipped.

      Acceptable risk for this PR if documented in the helper docstring; long-term fix is per-connection dedup or a thread-pool with a per-applicant queue.

- [ ] **Auth-bypass concern partially restated for visibility:** `_post_connect_kick_saltedge_pull` will gladly load `repo.get_by_id(99999)` for any positive integer the body provides. Negative numbers + zero are not rejected by pydantic (`application_id: Optional[int] = None`). The Repository returns `None` for non-existent IDs and the helper logs `[saltedge.post-connect] application_id=... not found` — safe but noisy. A pydantic `Field(gt=0)` constraint on both `SaltEdgePersistConnectionRequest.application_id` and `SaltEdgeSyncCustomerRequest.application_id` (`saltedge_endpoints.py:111, 135`) would surface client-side bugs as 422s instead of silent log spam.

- [ ] **Test coverage gap — no test exercises concurrent `schedule_saltedge_pull_for_application` calls from two threads with the same `application_id`.**
      The lock in `_should_skip_due_to_dedup` makes this unlikely to race, but the dedup map's invariants are not pinned by a test. A simple thread-pool test (two `Thread()` calls hitting the helper simultaneously, asserting only one wins) would lock in the contract.

- [ ] **Test coverage gap — `test_persists_connection_accounts_transactions_holder_info_per_consent` only uses ONE consent.**
      `backend/tests/usecase/test_bank_data_pull_saltedge.py:324-379`. With a single `_build_consent()`, all four product calls naturally share the same `connection_id` — the assertion that each product type appears in `start_calls` is correct but doesn't actually pin the per-connection wiring (the focus-area concern in the prompt). Add a second test with two consents and assert each product type appears for each connection_id (4 × 2 = 8 start_calls).

---

## Minor issues (nice to have)

- [ ] **Module-level dedup state is declared mid-import-block.**
      `backend/src/interface/http_endpoints.py:107-148`. The block goes:
      ```
      import threading                             # line 108
      _SALTEDGE_PULL_DEDUP_LOCK = threading.Lock() # line 115
      ... dedup helpers ...
      from src.usecase.housing_detection import .. # line 148 (back to imports)
      ```
      Stylistically jarring; readers expect all imports to come before any code. Move the dedup block to AFTER all imports (e.g., near the existing `_SALTEDGE_CUSTOMER_CACHE` block at `:335-337`).

- [ ] **Module-level dedup map across pod restarts.** `backend/src/interface/http_endpoints.py:116`. After a Cloud Run revision restart, the in-memory map resets; users hitting persist immediately after a deploy could spawn duplicate threads. Plan acknowledges this; not blocking. Consider a comment in the code referencing the trade-off.

- [ ] **Frontend `applicationId` is recomputed on every render but cheap; would be cleaner via `useMemo`.**
      `frontend/app/application/connect-accounts/pageSalt.tsx:382-385`. Three derived values (`applicationIdParam`, `applicationId`, `hasApplicationId`) are computed on every render. Number coercion is cheap so this is fine, but wrapping them in `useMemo([searchParams])` would avoid even the trivial re-coercion and the redundant `applicationId !== null && Number.isFinite(applicationId)` (the latter alone is sufficient). Cosmetic.

- [ ] **`hasApplicationId && applicationId !== null` is doubly defensive.**
      `frontend/app/application/connect-accounts/pageSalt.tsx:714-716, 860-862, 1127-1128`. `hasApplicationId` already implies `applicationId !== null` (via line 385's `applicationId !== null && Number.isFinite(applicationId) && applicationId > 0`). The `applicationId !== null` part of the conditional is redundant; TypeScript's narrowing requires it because the local check at line 385 isn't a type guard, but that's a code-smell, not a bug. Defining `hasApplicationId` via a type guard `function isValid(x: number | null): x is number {…}` would let you drop the redundancy.

- [ ] **Persist hook fires even when the upsert reported `superseded_existing=True`** (i.e., the user re-linked a connection that already existed). Re-pulling is fine (data is fresh) but slightly wasteful. Not blocking.

- [ ] **Sync endpoint hook gates on `persisted_ids` (only fires when at least one new connection was persisted).** This is correct per the plan but means a sync-on-mount that finds ALL connections already-present will NOT trigger a pull, even when a previous pull failed and `bank_data_snapshots` is empty for the application. In the steady-state this is fine (the previous successful pull populated the snapshots). In the failure-recovery state it means the user has no way to retry from the page besides manually re-linking. Document this in the sync hook's comment.

- [ ] **The `[saltedge.submit] kick-off` log line at `http_endpoints.py:214-219` fires twice for the same application** in the dedup-NOT-skipped case: once at the wrapper `_kick_off_saltedge_submit_pull` and then `[saltedge.submit] thread started application_id=...` inside `_pull`. The second is a different label so this is fine — just a note.

- [ ] **Latent SEK-as-USD bug from Phase 1 is correctly out of scope** and noted in `phase-1.result.md` and `bank_data_pull.py:767-770` (`fx_rates={"USD": 1.0}` comment). No action needed in this PR.

- [ ] **`_post_connect_kick_saltedge_pull` lazy-imports `TxSessionLocal` and `SQLAlchemyHousingApplicationRepository` to avoid circular deps.** Comment explains it. Worth noting that the import-at-top in `http_endpoints.py:68` already imports `SQLAlchemyHousingApplicationRepository`, so the lazy import in `saltedge_endpoints.py` isn't strictly needed for circular-dep reasons, only for test-patching convenience. Minor.

- [ ] **Test patching pattern `mock.patch.object(http_endpoints_module.threading, "Thread")` mutates the global `threading` module attribute.**
      `backend/tests/interface/test_saltedge_post_connect_kick_off.py:317, 347`. Affects any concurrent thread spawn during the test (e.g., FastAPI internals). Restored after the `with` block. Not currently broken but a sharp edge — consider patching `http_endpoints_module.threading.Thread` symbolically, e.g. via `mock.patch("src.interface.http_endpoints.threading.Thread")` to make the patch target explicit.

- [ ] **Frontend dashboard navigation fix at `frontend/app/dashboard/page.tsx:1664-1670`** uses `application?.id ?? user?.applicationId ?? null`. The `null !== undefined` check at `:1666` is redundant (since `??` already converts both to `null`). Cosmetic.

---

## What is good

- Clean separation between `schedule_saltedge_pull_for_application` (the new public helper) and `_kick_off_saltedge_submit_pull` (the legacy wrapper). Existing call site at `http_endpoints.py:2298` is untouched.
- Dedup helper `_should_skip_due_to_dedup` correctly holds the lock across both read and write, so two simultaneous calls cannot both pass.
- Opportunistic prune of expired entries inside the lock keeps map growth bounded.
- `application_id is None` short-circuits dedup and pull scheduling — guards against the legitimate "no application yet" pre-submit flow.
- `_post_connect_kick_saltedge_pull` correctly opens a postgres `TxSessionLocal()` (since `HousingApplicationModel` lives on `TxBase`), not the request's MySQL session. Correct engine routing.
- Frontend gates `application_id` send on `hasApplicationId && applicationId !== null && applicationId > 0`, so `?application_id=0`, `?application_id=-1`, and `?application_id=foo` are all correctly rejected client-side.
- The new logs (`[saltedge.post-connect] kick`, `[saltedge.post-connect] dedup-skip`, `[saltedge.post-connect] skip: postgres tx_engine not configured`, `[saltedge.post-connect] application_id=… not found`, `[saltedge.post-connect] hook failed`) cover all five reachable code paths in `_post_connect_kick_saltedge_pull` and `schedule_saltedge_pull_for_application`. On-call diagnosis at 3am is feasible.
- Test file `test_saltedge_post_connect_kick_off.py` correctly:
  - Patches `_kick_off_saltedge_submit_pull` and `_kick_off_plaid_submit_pull` at submit time so test cases start from a clean dedup state.
  - Uses an `autouse` fixture to clear `_SALTEDGE_PULL_DEDUP` before/after each test.
  - Verifies the dedup-skip branch via `caplog`.
  - Verifies the post-TTL branch via timestamp manipulation + `threading.Thread` mock.
- Test file `test_bank_data_pull_saltedge.py` correctly stubs `partners_cls.return_value.get_customer_reports.return_value = {"reports": []}` to avoid the `_to_serializable` infinite-recursion via MagicMock that bit Phase 5. The fix-commit `7107097` is exactly the right call.
- Frontend `useCallback` dep arrays at `pageSalt.tsx:794-801, 884-892` correctly include `applicationId` and `hasApplicationId` so a URL change between two `?application_id=` values doesn't ship a stale value.
- Dashboard navigation at `dashboard/page.tsx:1664-1670` correctly threads `application_id` into the connect-accounts URL using `URLSearchParams`, gracefully falling back when no id is known.
- Phase-6 verification correctly captured the live "before" state (`apiScore.dashboard` keys missing) and refined the Phase-1 hypothesis from "credit-score returns 202" to "credit-score returns 200 with v7 keys absent" — same root cause, sharper presentation. Good debugging discipline.

---

## Recommendation

NEEDS_CHANGES. The two critical issues (submit-time dedup poisoning and unauthenticated persist/sync hooks) should be addressed before this lands. The first is a correctness regression for the exact scenario this PR is meant to fix; the second is a (mostly pre-existing) authn gap that this PR amplifies by spawning daemon threads on attacker-supplied input. Fix or explicitly defer-with-tracking-issue both, then approve.

If the team decides the auth concern is out of scope (because the persist/sync endpoints are intentionally unauthenticated for the pre-submit flow), please file a follow-up issue and add a comment at `saltedge_endpoints.py:538-545` and `:705-712` documenting the threat model so future readers don't accidentally remove the (non-existent) auth guard while refactoring.
