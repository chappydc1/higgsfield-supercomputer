# saltedge-fetch — Implementation Plan

## Phase Overview
Phases: 3 (4a backend scheduler+hook, 4b frontend application_id pass-through, 4c tests)
Goal: After-submit SaltEdge connections schedule a transaction pull so dashboard KPIs populate for non-US applicants.
Risk level: medium (new daemon thread spawn site; SALTEDGE_* secrets must be live in Cloud Run before redeploy)
Branch: fix/saltedge-fetch

Working dir: `/Users/chappy/Downloads/old/chappy2/coding/backup/dwilar/lita-ehousing/.claude/worktrees/mystifying-greider-ba1f49`

Naming used below:
- `BE_SE` = `backend/src/interface/saltedge_endpoints.py` (916 lines)
- `BE_HTTP` = `backend/src/interface/http_endpoints.py` (4714 lines)
- `BE_PULL` = `backend/src/usecase/bank_data_pull.py` (1132 lines)
- `FE_PAGE` = `frontend/app/application/connect-accounts/pageSalt.tsx` (1550 lines)
- `BE_DB` = `backend/src/config/database.py`

Atomic-step rule: every step is a single git diff hunk with one verification.
Test-first rule: in Phase 4c, failing test for the post-connect hook is authored
BEFORE the production code in Phase 4a is exercised end-to-end. Within a single
PR the steps are still ordered "tests after the helper they import" so a
unit-test run does not import a non-existent symbol mid-PR; an implementer
running the suite per step will only see RED on the post-connect test until
Phase 4a step 6 lands.

---

## Phase 4a — Backend: extract scheduler + post-connect hook

### Module-level scaffolding

1. **Add dedup map + TTL constant** in `BE_HTTP` near the top of the kick-off
   block (after the `_BankPullSessionLocal` import at `BE_HTTP:107`, before the
   `_kick_off_plaid_submit_pull` definition at `BE_HTTP:130`).
   - Action: insert a module-level `_SALTEDGE_PULL_DEDUP_LOCK = threading.Lock()`,
     `_SALTEDGE_PULL_DEDUP: dict[int, float] = {}`, and a constant
     `_SALTEDGE_PULL_DEDUP_TTL_SECONDS = 30.0`. Add `import time` to the
     existing imports if not already present.
   - Verify: `grep -n "_SALTEDGE_PULL_DEDUP_TTL_SECONDS\|_SALTEDGE_PULL_DEDUP_LOCK" backend/src/interface/http_endpoints.py`
     returns exactly 2 declarations and at least one usage in step 3.

2. **Add `_should_skip_due_to_dedup(application_id)` helper** in `BE_HTTP`,
   immediately after the dedup constants from step 1.
   - Action: define a private function that takes `application_id: int | None`
     and returns `True` if a non-expired entry exists in
     `_SALTEDGE_PULL_DEDUP` for that id; otherwise inserts `time.monotonic()`
     into the map and returns `False`. The whole map read+write must happen
     under `_SALTEDGE_PULL_DEDUP_LOCK`. Expired entries (`now - ts >= TTL`)
     are pruned opportunistically while the lock is held. `application_id is
     None` always returns `False` (no dedup possible without a key).
   - Verify: `python -c "import ast,sys; ast.parse(open('backend/src/interface/http_endpoints.py').read())"`
     succeeds (syntax check); `grep -n "_should_skip_due_to_dedup" backend/src/interface/http_endpoints.py`
     shows the definition.

3. **Add public `schedule_saltedge_pull_for_application` helper** in
   `BE_HTTP`, immediately after `_kick_off_saltedge_submit_pull` at
   `BE_HTTP:165-211`.
   - Action: define
     ```python
     def schedule_saltedge_pull_for_application(
         application,
         *,
         trigger: str = "submit",
     ) -> bool:
         """Schedule a SaltEdge background pull for the given application.

         Returns True when a thread was started, False if dedup-skipped or the
         application is missing an id. Logs a `[saltedge.post-connect]` line on
         every call site that isn't `submit`.
         """
     ```
     The body:
     1. Reads `application.id`; if `None`, log
        `"[saltedge.pull] skip: no application id trigger=%s"` and return `False`.
     2. Calls `_should_skip_due_to_dedup(application.id)`. On hit, log
        `"[saltedge.post-connect] dedup-skip application_id=%s trigger=%s ttl=%ss"`
        at WARNING and return `False`.
     3. If `trigger != "submit"`, log
        `"[saltedge.post-connect] kick application_id=%s trigger=%s"` at INFO.
     4. Reuses the same daemon-thread body as `_kick_off_saltedge_submit_pull`
        (open `_BankPullSessionLocal()`, build `SQLBankDataSnapshotRepository`
        and `SQLSaltEdgeConsentRepository`, call `run_submit_saltedge_pull`,
        `try/except Exception` with logger.exception, `finally session.close()`).
     5. Spawns the thread with name `f"saltedge-pull-{application.id}"`.
     6. Returns `True`.
   - Verify: `grep -n "def schedule_saltedge_pull_for_application" backend/src/interface/http_endpoints.py`
     returns exactly one match; `python -c "from src.interface.http_endpoints import schedule_saltedge_pull_for_application"`
     (run from `backend/`) imports cleanly.

4. **Refactor `_kick_off_saltedge_submit_pull` to delegate** to
   `schedule_saltedge_pull_for_application`, in `BE_HTTP:165-211`.
   - Action: replace the body of `_kick_off_saltedge_submit_pull` so it
     becomes a thin wrapper that calls
     `schedule_saltedge_pull_for_application(application, trigger="submit")`
     and returns `None`. Keep the function name + signature (one positional
     `application`) so the existing call site at `BE_HTTP:2218` is untouched.
     Keep the entry log line `"[saltedge.submit] kick-off application_id=%s
     country=%s email=%s"` (move it inside the wrapper before the delegate
     call so submit-time logs are unchanged).
   - Verify: `grep -n "_kick_off_saltedge_submit_pull(" backend/src/interface/http_endpoints.py`
     still shows the existing call at line ~2218 and the definition; the
     definition body now contains exactly one
     `schedule_saltedge_pull_for_application` call. Existing
     `[saltedge.submit] kick-off …` log line still fires.

### Hook on persist endpoint

5. **Import `schedule_saltedge_pull_for_application` at top of `BE_SE`**,
   adjacent to the existing `from src.interface.auth_endpoints import …`
   block at `BE_SE:20-23`.
   - Action: append
     `from src.interface.http_endpoints import schedule_saltedge_pull_for_application`
     after line 23. The import is module-top-level (not inside the handler)
     because both modules are already loaded eagerly by FastAPI router
     registration; no new circular-import risk because `http_endpoints` does
     not import `saltedge_endpoints`.
   - Verify: `python -c "from src.interface.saltedge_endpoints import router"`
     (from `backend/`) succeeds without ImportError; `grep -n
     "schedule_saltedge_pull_for_application" backend/src/interface/saltedge_endpoints.py`
     shows the import line.

6. **Insert post-persist hook** in `persist_saltedge_connection`, between the
   final log line at `BE_SE:627-633` and the `return …` at `BE_SE:635-644`.
   - Action: insert
     ```python
     if request_data.application_id is not None:
         _post_connect_kick_saltedge_pull(
             db,
             application_id=request_data.application_id,
             trigger="persist",
             connection_id=connection_id,
         )
     ```
     where `_post_connect_kick_saltedge_pull` is the new private helper added
     in step 7 below. Step ordering: step 7 must land in the SAME diff hunk
     because both edits to `BE_SE` reference the helper. (Atomic-step rule
     allowed: this is one logical hook, two collocated edits in the same
     module — keep them in one commit but verifiable via the same grep.)
   - Verify: `grep -n "_post_connect_kick_saltedge_pull" backend/src/interface/saltedge_endpoints.py`
     shows exactly one call inside `persist_saltedge_connection` and one
     definition (the helper from step 7). `grep -n "request_data.application_id is not None"
     backend/src/interface/saltedge_endpoints.py` shows the persist-side guard.

7. **Add `_post_connect_kick_saltedge_pull` private helper** in `BE_SE`,
   immediately after `_compute_account_fingerprint` at `BE_SE:485` (above the
   `@router.post("/api/saltedge/connection/{connection_id}/persist", …)` at
   `BE_SE:488`).
   - Action: define
     ```python
     def _post_connect_kick_saltedge_pull(
         db: Session,
         *,
         application_id: int,
         trigger: str,
         connection_id: Optional[str] = None,
     ) -> None:
         """Load the postgres-backed HousingApplication and schedule a pull.

         Failures are logged and swallowed so a misfired hook never breaks the
         persist/sync HTTP response. The database session passed in is the
         FastAPI request session and may not be the postgres engine; we open
         a TxSessionLocal explicitly to load the application row.
         """
     ```
     Body:
     1. `from src.config.database import TxSessionLocal` (lazy import to
        keep tests' patching simple, mirroring the pattern in
        `BE_PULL:745-746`).
     2. If `TxSessionLocal is None`: log
        `"[saltedge.post-connect] skip: postgres tx_engine not configured application_id=%s trigger=%s"`
        and `return`.
     3. Otherwise open `with TxSessionLocal() as tx_session:` and use
        `SQLAlchemyHousingApplicationRepository(tx_session)` to load by id.
        Lazy-import the repository class to avoid a top-level circular dep.
     4. If the repo returns `None`, log
        `"[saltedge.post-connect] application_id=%s not found trigger=%s"` and
        `return`.
     5. Call `schedule_saltedge_pull_for_application(application, trigger=trigger)`.
     6. Wrap the entire body in `try/except Exception` with
        `logger.exception("[saltedge.post-connect] hook failed application_id=%s trigger=%s connection_id=%s", …)`.
   - Verify: `grep -n "def _post_connect_kick_saltedge_pull" backend/src/interface/saltedge_endpoints.py`
     returns one match; `python -c "from src.interface.saltedge_endpoints import _post_connect_kick_saltedge_pull"`
     (from `backend/`) imports.

### Hook on sync endpoint

8. **Insert post-sync hook** in `sync_saltedge_customer`, between the final
   log line at `BE_SE:766-771` and the `return …` at `BE_SE:773-777`.
   - Action: insert
     ```python
     if request_data.application_id is not None and persisted_ids:
         _post_connect_kick_saltedge_pull(
             db,
             application_id=request_data.application_id,
             trigger="sync",
             connection_id=persisted_ids[0] if persisted_ids else None,
         )
     ```
     The `persisted_ids` guard ensures the hook only fires when sync actually
     wrote a new consent — a no-op poll should not spawn a pull thread (dedup
     handles same-applicant repeats anyway, but skipping the call entirely
     avoids unnecessary log noise). The `connection_id` field is only used
     for log correlation.
   - Verify: `grep -n "trigger=\"sync\"" backend/src/interface/saltedge_endpoints.py`
     returns exactly one match; `grep -c "_post_connect_kick_saltedge_pull("
     backend/src/interface/saltedge_endpoints.py` returns 2 (one persist, one sync).

9. **Smoke check that no schema/route signatures changed.**
   - Action: read `BE_SE` in full from line 100 to line 140 (the pydantic
     models) and confirm `application_id: Optional[int] = None` is still on
     both `SaltEdgePersistConnectionRequest` (`BE_SE:110`) and
     `SaltEdgeSyncCustomerRequest` (`BE_SE:134`).
   - Verify: `grep -n "application_id: Optional\\[int\\]" backend/src/interface/saltedge_endpoints.py`
     returns at least 2 matches. (No change required — verification only.)

---

## Phase 4b — Frontend: pass application_id in persist + sync bodies

### Source the application_id

10. **Read `application_id` from URL query in `FE_PAGE`**, alongside the
    other URL-param reads at `FE_PAGE:379-381`.
    - Action: insert
      ```ts
      const applicationIdParam = searchParams.get("application_id")
      const applicationId = applicationIdParam ? Number(applicationIdParam) : null
      const hasApplicationId =
        applicationId !== null && Number.isFinite(applicationId) && applicationId > 0
      ```
      after the `showBusiness` line at `FE_PAGE:381`. `Number()` returns
      `NaN` for non-numeric strings, which `Number.isFinite` rejects — guards
      against `?application_id=undefined` from a stale callsite.
    - Verify: `grep -n "applicationIdParam\|hasApplicationId" frontend/app/application/connect-accounts/pageSalt.tsx`
      returns 3 lines.

11. **Persist `applicationId` as a query param when leaving for SaltEdge**,
    in the `returnParams` block at `FE_PAGE:1102-1111`.
    - Action: insert
      `if (hasApplicationId && applicationId !== null) returnParams.set("application_id", String(applicationId))`
      between the `if (showBusiness) returnParams.set("showBusiness", "true")`
      line at `FE_PAGE:1107` and the `if (customerIdToUse) …` line at
      `FE_PAGE:1111`. This guarantees the post-redirect render still has
      access to `application_id` even if the originating dashboard navigation
      passed it once and React state was reset by the round-trip.
    - Verify: `grep -n 'returnParams.set("application_id"' frontend/app/application/connect-accounts/pageSalt.tsx`
      returns one line.

### Wire into persist body

12. **Add `application_id` to persist body** in `handleSaltEdgeReturn` at
    `FE_PAGE:706-712`.
    - Action: extend the JSON body object so it becomes
      ```ts
      body: JSON.stringify({
        connection_id: connectionId,
        customer_reference: persistReference,
        categorization:
          accountType === "business" ? "corporate" : "personal",
        ...(hasApplicationId && applicationId !== null
          ? { application_id: applicationId }
          : {}),
      })
      ```
      The spread is gated so the field is omitted (not sent as `null`) when
      no id is known — matches the pydantic `Optional[int] = None` contract
      on the backend (`BE_SE:110`).
    - Verify: `grep -n "application_id: applicationId" frontend/app/application/connect-accounts/pageSalt.tsx`
      returns at least one match; persist body still serialises to valid JSON
      (`node -e "JSON.parse(JSON.stringify({a:1}))"` is a sanity check, not
      file-specific).

13. **Add `application_id` to sync body** in `handleSaltEdgeSync` at
    `FE_PAGE:843-847`.
    - Action: extend the JSON body so it becomes
      ```ts
      body: JSON.stringify({
        customer_reference: email,
        categorization:
          accountType === "business" ? "corporate" : "personal",
        ...(hasApplicationId && applicationId !== null
          ? { application_id: applicationId }
          : {}),
      })
      ```
      Same gating as step 12. The pydantic contract for sync is at `BE_SE:134`.
    - Verify: `grep -c "application_id: applicationId" frontend/app/application/connect-accounts/pageSalt.tsx`
      returns 2 (one persist, one sync).

14. **Refresh closure deps** in `useCallback` arrays for
    `handleSaltEdgeReturn` (closure at `FE_PAGE:790`) and `handleSaltEdgeSync`
    (closure at `FE_PAGE:868-877`).
    - Action: append `applicationId, hasApplicationId` to BOTH dependency
      arrays. Even though `applicationId` is captured-by-value across renders
      (URL-param-derived, stable per render), explicitly listing it keeps
      ESLint happy and ensures a stale closure never sends a wrong id when
      the user navigates between two `?application_id=` values without a
      full page reload.
    - Verify: `grep -nA12 "} =>" frontend/app/application/connect-accounts/pageSalt.tsx | grep -c "applicationId"` ≥ 2 inside dep arrays. (Or simpler: open the file at the two closures and confirm visually — the line numbers move; verify line at implementation time.)

15. **Update dashboard navigation** so post-submit users land on the connect-
    accounts page WITH `application_id`. In `frontend/app/dashboard/page.tsx`
    at the `handleConnectAccountsNavigation` declaration around line 1663.
    - Action: change
      `router.push("/connect-accounts")` to
      ```ts
      const targetApplicationId = application?.id ?? user?.applicationId ?? null
      const params = new URLSearchParams()
      if (targetApplicationId !== null && targetApplicationId !== undefined) {
        params.set("application_id", String(targetApplicationId))
      }
      const query = params.toString()
      router.push(query ? `/connect-accounts?${query}` : "/connect-accounts")
      ```
      The fallback to `user?.applicationId` mirrors the pattern used at
      `frontend/app/dashboard/page.tsx:1449`.
    - Verify: `grep -n 'application_id' frontend/app/dashboard/page.tsx`
      returns at least one match referencing the new query-param write;
      `grep -nA8 "handleConnectAccountsNavigation" frontend/app/dashboard/page.tsx`
      shows the new params logic. (Line will shift; verify line at
      implementation time.)

---

## Phase 4c — Tests

### Use-case test for `run_submit_saltedge_pull` (already partially covered — confirm or extend)

16. **Author `backend/tests/usecase/test_bank_data_pull_saltedge.py` (NEW)**
    if and only if it does not already exist (verified absent at planning
    time via `ls backend/tests/usecase/`).
    - Action: create the file with one test class containing four cases:
      - `test_runs_with_no_consents_short_circuits` — patch
        `SaltEdgeClient` so `__init__` succeeds, pass an empty consent repo,
        assert no `bank_data_snapshots` writes, assert at least one log line
        starting with `[saltedge.pull] no live`.
      - `test_persists_connection_accounts_transactions_holder_info_per_consent`
        — fake repo returns one `SaltEdgeConsent`, fake client returns valid
        connection / accounts / transactions / holder_info dicts, assert
        `BankDataSnapshotRepository.start_attempt` is called four times with
        the expected `(user_id, source, product_type, consent_id)` tuples.
      - `test_canonical_persist_is_invoked_when_tx_engine_present` — patch
        `src.config.database.TxSessionLocal` to return a sqlite-bound session
        with `TxBase.metadata` created (mirror the fixture in
        `backend/tests/interface/test_application_transactions_canonical.py:14-22`),
        run pull, assert `canonical_transactions` row count ≥ 1 with
        `applicant_id == "app-00000028"` for `application.id=28`.
      - `test_canonical_persist_failure_is_swallowed` — patch
        `CanonicalRepository.persist_snapshot` to raise; assert pull still
        completes and `bank_data_snapshots` row exists with
        `status='succeeded'`.
    - Verify: `pytest backend/tests/usecase/test_bank_data_pull_saltedge.py
      --collect-only -q` lists 4 test ids without ImportError. (Implementer
      may run the suite in CI; we do NOT run the tests here per task rules.)

### Interface test for the post-connect hook (CORE NEW COVERAGE)

17. **Author `backend/tests/interface/test_saltedge_post_connect_kick_off.py` (NEW)**.
    - Action: create the file with one `TestClient`-driven test class. Use
      the same SQLite-with-`TxBase.metadata` fixture style as
      `backend/tests/interface/test_application_transactions_canonical.py`.
      Insert one `HousingApplicationModel` row with `id=28`, `country='SE'`,
      `email='tobias@example.com'`. Patch
      `src.interface.saltedge_endpoints.SaltEdgeClient` (the upstream client)
      to return canned `get_connection`/`list_accounts` payloads. Patch
      `src.interface.http_endpoints.schedule_saltedge_pull_for_application`
      with a `Mock`. Cases:
      - `test_persist_with_application_id_schedules_pull` — POST
        `/api/saltedge/connection/conn-1/persist` with body
        `{connection_id:"conn-1", customer_reference:"tobias@example.com",
        categorization:"personal", application_id:28}`. Assert response 200,
        mock called once with first positional arg being the loaded
        application (`application.id == 28`) and `trigger="persist"`.
      - `test_persist_without_application_id_does_not_schedule` — same POST
        but body omits `application_id`. Assert mock NOT called.
      - `test_sync_with_application_id_and_new_connection_schedules_pull` —
        POST `/api/saltedge/customer/cust-1/sync` with `application_id=28`,
        upstream `list_connections` returns one new id; assert mock called
        with `trigger="sync"`.
      - `test_sync_without_new_connections_does_not_schedule` — same POST
        but upstream list matches what's already in DB; assert mock NOT
        called (no new persisted_ids → no kick).
      - `test_dedup_within_30s_window` — patch `time.monotonic` (in the
        `http_endpoints` module's namespace) and the dedup map directly to
        seed an entry for `application_id=28` at `now`; call the persist
        endpoint with `application_id=28`; assert `schedule_…` is NOT called
        (the helper's `_should_skip_due_to_dedup` rejects). Then patch
        `monotonic` to `now + 31` and call again; assert it IS called.
        Asserts a WARNING log starting with `[saltedge.post-connect] dedup-skip`
        on the rejected call (use `caplog`).
    - Verify: `pytest backend/tests/interface/test_saltedge_post_connect_kick_off.py
      --collect-only -q` lists 5 test ids without ImportError. After Phase 4a
      lands, the same command run with `--no-collect-only` should pass for
      all 5 cases.

### Interface test for the dedup guard at the helper level

18. **Add a unit-level test for `_should_skip_due_to_dedup`** by appending a
    small `TestDedupGuard` class to the file from step 17 (same module —
    keeps the dedup contract pinned without spinning up a TestClient).
    - Action: import `_should_skip_due_to_dedup`,
      `_SALTEDGE_PULL_DEDUP`, and `_SALTEDGE_PULL_DEDUP_TTL_SECONDS` from
      `src.interface.http_endpoints`. Cases:
      - `test_first_call_for_id_returns_false`,
        `test_second_call_within_ttl_returns_true`,
        `test_call_after_ttl_returns_false_and_resets_entry`,
        `test_none_application_id_never_dedups` (returns False both times).
    - Verify: same `pytest --collect-only` command from step 17 now lists 9
      total tests in that file (5 hook + 4 guard).

### Existing canonical-read test untouched

19. **Confirm `test_application_transactions_canonical.py` continues to
    pass** — no edits required.
    - Action: none. The fix does not touch the read endpoint or the read-flag
      branch.
    - Verify: implementer runs `pytest backend/tests/interface/test_application_transactions_canonical.py -q`
      after Phase 4a + 4b commits land; expect green.

---

## Rollback Plan

If post-deploy verification (steps 1-5 of Definition of Done from `about.md`)
fails or causes a regression for the existing submit-time pull:

1. `git revert <merge-commit-sha>` on `main`. The persist/sync endpoints
   retain their pre-fix behaviour because both the body field
   (`application_id: Optional[int]`) and the consent-row column already
   exist in production.
2. Rebuild + redeploy via the existing `cloudbuild.yaml` pipeline. No DB
   migration to revert — schema is untouched.
3. Clients that already started sending `application_id` in persist/sync
   bodies will still get a 200; pydantic happily ignores the unknown field
   (it's actually known and just unused after revert).
4. If the dashboard issue persists post-revert (i.e. revert didn't fix it),
   the bug is elsewhere — open an incident referencing
   `[saltedge.submit] thread started application_id=…` log absence as the
   primary signal.

If only the frontend half ships first and the backend revert lands later: no
action — backend pre-fix simply ignores the new request field.

If only the backend half ships first and the frontend pass-through is
delayed: the post-connect hook is dormant (it only fires when
`application_id is not None`), so behaviour is identical to today. Safe.

---

## Deployment Plan

Pre-deploy gate (BLOCKING):

1. Confirm `SALTEDGE_APP_ID`, `SALTEDGE_SECRET`, and one of
   `SALTEDGE_PRIVATE_KEY_PEM` / `SALTEDGE_PRIVATE_KEY_PATH` are bound to the
   `lita-api` Cloud Run service. They are NOT in `backend/cloudbuild.yaml`
   today — out-of-band Secret Manager binding required (`context.md:418-420`).
   Without these, `SaltEdgeClient()` raises `SaltEdgeConfigurationError` and
   the post-connect hook silently no-ops just like the submit-time pull does
   today (`bank_data_pull.py:594-602`). The fix would still ship safely but
   the dashboard would remain blank.
2. Confirm `POSTGRES_*` env vars are set (already in `cloudbuild.yaml:22`
   per `context.md:24-26`). Without `POSTGRES_DB_USER` / `POSTGRES_DB_PASSWORD`,
   `TxSessionLocal` is None and `_post_connect_kick_saltedge_pull` exits via
   the early-return path with the `tx_engine not configured` log. No regression.

Merge order:

A. Land Phase 4a (backend) and Phase 4c (tests) in one PR. CI runs
   `pytest backend/tests/...` and verifies no regressions; new tests pass.
B. Land Phase 4b (frontend) in a second PR. The backend already accepts the
   field (steps 5-9), so even if the frontend deploys slightly ahead of the
   backend during a rollout, the body is no-op-ignored.
C. Optional: flip `INTAKE_CANONICAL_TRANSACTIONS_READ=true` in
   `cloudbuild.yaml` after 24h of green observability data. NOT in scope of
   this fix.

Deploy:

1. Merge PR A → Cloud Build trigger redeploys `lita-api` Cloud Run service.
2. Smoke: `curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/saltedge/connection/conn-fake/persist -H "Content-Type: application/json" -d '{"connection_id":"conn-fake","customer_reference":"x@y.z","categorization":"personal"}'` returns 4xx (upstream call fails for the fake id but the persist code path executes — we want to confirm no NameError / ImportError surfaced from the new helper). Inspect Cloud Logs for `[saltedge.persist] entry` to confirm the handler ran without 5xx.
3. Merge PR B → Vercel (or whatever serves `frontend/`) redeploys.
4. Production verification (per `context.md:458-466` and `about.md:148-167`):
   - For application 28: have the user re-link Swedish bank, OR run
     `curl -X POST $API/api/saltedge/customer/<customer_id>/sync -H "Content-Type: application/json" -d '{"customer_reference":"<email>","application_id":28}'`.
   - Wait ~30s.
   - `GET /api/v1/applications/28/credit-score` → 200 with non-empty
     `dashboard.accounts_liquid_balance` and `dashboard.transactions_avg_net_cashflow`.
   - Visit `/dashboard?id=28` → "Bank Balance", "Average Cash Flow",
     "Total Number of Contracts" tiles render non-zero.

Failure threshold: if any of the four KPIs remains zero after 5 minutes and
two retries, execute Rollback Plan.

---

## Observability Plan

Existing log lines (no change required):

- `[saltedge.submit] kick-off application_id=… country=… email=…`
  (`BE_HTTP:174-179`) — fires from the submit handler only.
- `[saltedge.submit] thread started application_id=…`
  (`BE_HTTP:186-189`) — fires from the daemon thread.
- `[saltedge.submit] thread completed application_id=…`
  (`BE_HTTP:195-198`) — terminal success log.
- `[saltedge.pull] entry application_id=… country=… email=…`
  (`BE_PULL:570-575`).
- `[saltedge.pull] live-by-application … count=…` (`BE_PULL:636-640`).
- `[canonical.saltedge] applicant=… application_id=… connection=… txns=N persisted`
  (`BE_PULL:778-781`).

NEW log lines introduced by this fix:

- `[saltedge.post-connect] kick application_id=… trigger={persist|sync}`
  (helper from step 3) — fires once per non-dedup-skipped post-connect hook
  call. Operators correlate this with the matching `[saltedge.pull] entry`
  ~milliseconds later.
- `[saltedge.post-connect] dedup-skip application_id=… trigger=… ttl=30s`
  (WARNING level, helper step 3) — fires when a second persist/sync within
  30s tries to spawn a duplicate pull. An operator seeing more than ~3 of
  these per minute for the same applicant should investigate (frontend
  retry loop, or load-balancer replays).
- `[saltedge.post-connect] skip: postgres tx_engine not configured application_id=… trigger=…`
  (`_post_connect_kick_saltedge_pull` step 7) — only fires in environments
  without `POSTGRES_*` vars (e.g. local dev). Should NEVER appear in prod.
- `[saltedge.post-connect] application_id=… not found trigger=…`
  (`_post_connect_kick_saltedge_pull` step 7) — fires when the persist/sync
  body claims an application id that doesn't exist in postgres. Indicates
  client-side bug or stale URL state; investigate.
- `[saltedge.post-connect] hook failed application_id=… trigger=… connection_id=…`
  (`_post_connect_kick_saltedge_pull` step 7) — broad `try/except`
  catch-all. If this fires repeatedly, the persist/sync HTTP responses are
  still 200 but the pull never schedules.

Metric to add (out of scope — manual tracking via Cloud Logging):
- Count of `[saltedge.post-connect] kick` per hour ≥ count of new `?id=`
  dashboard loads from non-US users. If far less, the frontend is failing to
  pass `application_id`.

---

## Status

- [ ] Phase 4a step 1 — dedup map + TTL constant in `BE_HTTP`
- [ ] Phase 4a step 2 — `_should_skip_due_to_dedup` helper
- [ ] Phase 4a step 3 — `schedule_saltedge_pull_for_application` public helper
- [ ] Phase 4a step 4 — `_kick_off_saltedge_submit_pull` delegates to new helper
- [ ] Phase 4a step 5 — import the helper in `BE_SE`
- [ ] Phase 4a step 6 — persist endpoint hook insertion
- [ ] Phase 4a step 7 — `_post_connect_kick_saltedge_pull` private helper
- [ ] Phase 4a step 8 — sync endpoint hook insertion
- [ ] Phase 4a step 9 — pydantic-model smoke check (no edit)
- [ ] Phase 4b step 10 — read `application_id` URL param in `FE_PAGE`
- [ ] Phase 4b step 11 — forward `application_id` through SaltEdge return URL
- [ ] Phase 4b step 12 — include `application_id` in persist body
- [ ] Phase 4b step 13 — include `application_id` in sync body
- [ ] Phase 4b step 14 — refresh `useCallback` dep arrays
- [ ] Phase 4b step 15 — dashboard navigation passes `application_id` query
- [ ] Phase 4c step 16 — `test_bank_data_pull_saltedge.py` new tests
- [ ] Phase 4c step 17 — `test_saltedge_post_connect_kick_off.py` new tests
- [ ] Phase 4c step 18 — dedup-guard unit tests appended to step-17 file
- [ ] Phase 4c step 19 — confirm `test_application_transactions_canonical.py` still green

## Assessment

- Assessed: yes
- Paths verified: yes
  - `backend/src/interface/saltedge_endpoints.py` (916 lines) — verified line
    references for pydantic models (`:100-110`, `:124-134`),
    `_compute_account_fingerprint` (`:485`), persist handler entry (`:488`)
    and exit (`:627-644`), sync handler entry (`:647`) and exit (`:766-777`).
  - `backend/src/interface/http_endpoints.py` (4714 lines) — verified
    `_BankPullSessionLocal` import (`:107`), `_kick_off_plaid_submit_pull`
    (`:130-162`), `_kick_off_saltedge_submit_pull` (`:165-211`), submit-site
    call (`:2218`), `SQLAlchemyHousingApplicationRepository` import (`:68`).
  - `backend/src/usecase/bank_data_pull.py` (1132 lines) — verified
    `run_submit_saltedge_pull` definition (`:550`), country gate (`:576`),
    config error catch (`:594-602`), bind back-fill (`:606-624`),
    canonical persist block (`:740-786`).
  - `frontend/app/application/connect-accounts/pageSalt.tsx` (1550 lines) —
    verified `searchParams` reads (`:376-381`), persist call site
    (`:697-732`), sync call site (`:836-866`), return-URL params block
    (`:1102-1116`).
  - `frontend/app/dashboard/page.tsx` — `handleConnectAccountsNavigation`
    (`:1663-1665`) and `user?.applicationId` precedent (`:1449`) confirmed.
  - `backend/cloudbuild.yaml` — env var line (`:22`) confirmed; no
    `SALTEDGE_*` keys present.
  - Repository methods on `SQLSaltEdgeConsentRepository` referenced by the
    plan (`bind_application_by_customer_reference`, `list_live_by_application`,
    `list_live_by_customer_reference`, `list_live_by_customer`,
    `upsert_from_widget_return`) all exist in
    `backend/src/infra/mysql/saltedge_consent_repository.py`.
- Dependency order: ok
  - Step 1 introduces dedup state used by step 2.
  - Step 2 defines guard called inside step 3.
  - Step 3 defines the public helper imported by step 5 (frontend module
    side) and called by step 4 (refactored submit kicker).
  - Step 4 narrows the existing `_kick_off_saltedge_submit_pull` to a
    delegate; the call site at `BE_HTTP:2218` does not need to change.
  - Step 6 references `_post_connect_kick_saltedge_pull` from step 7 — both
    edits are inside the same module; no forward reference across modules.
  - Step 8 reuses the helper from step 7 — already shipped by step 7's PR
    diff hunk.
  - Steps 10-14 within the frontend module are independent of each other
    (they edit different functions / dep arrays); step 15 lives in a
    different file but does not import anything new from `pageSalt.tsx`.
  - Tests in step 17 import `schedule_saltedge_pull_for_application` from
    step 3 and `_should_skip_due_to_dedup` from step 2 — both shipped before
    the test file.
- Risks flagged:
  - SALTEDGE_* secrets not in `backend/cloudbuild.yaml`. If they are absent
    in Cloud Run, the post-connect hook will silently no-op exactly like the
    submit-time pull does today. Mitigation: confirm Secret Manager binding
    in the deploy gate above before merging.
  - Module-level dedup map. If the Cloud Run service scales to >1 instance
    (current `--max-instances=10` per `cloudbuild.yaml`), each instance has
    its own dedup map — a frontend retry could land on instance A then B and
    spawn two threads. Mitigation: 30s TTL + idempotent `bank_data_snapshots`
    upsert keyed on `(user_id, source, product_type, consent_id)` keep the
    blast radius small. Long-term fix is a Redis-backed dedup or DB-row lease;
    out of scope.
  - Pre-existing `fx_rates={"USD": 1.0}` issue (SEK transactions stored
    UNCONVERTED in `amount_usd`). Not caused by this fix; flagged for
    follow-up. Will produce visually-wrong USD numbers on the dashboard
    for non-USD applicants once the pipeline writes data — BUT non-zero
    visually-wrong is still the success criterion improvement target
    over the current "Data pending" / "SEK 0" blank state.
  - Frontend dashboard navigation change (step 15) only updates
    `handleConnectAccountsNavigation`. Other call sites that route into
    `/connect-accounts` (e.g. employment page at
    `frontend/app/application/employment/page.tsx:271`, login-verify at
    `:193`) are pre-submit flows where no `application_id` exists yet, so
    leaving them unchanged is correct.
  - Dedup map memory growth. Map is not bounded; for ~10 applicants/sec
    sustained over 30s the map peaks at ~300 entries. Acceptable. Add
    bounded prune to step 2's helper if desired.
