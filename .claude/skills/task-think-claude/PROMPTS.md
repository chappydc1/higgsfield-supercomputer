# Phase Prompts

Templates for Claude subagent messages. Replace `<TASK>`, `<PROJECT>`, `<LETTER>`, `<PREV_LETTER>`, `<REPO_ROOT>`, `<OWNED_WRITE_SET>`, `<N>`, `<R>` before sending.

## Global rule: AGENTS.md → digested-agents.md

Every phase prompt below says **"Read AGENTS.md"** in its setup. The actual instruction is:

> Read `.ai/<PROJECT>/<LETTER>/digested-agents.md` first. Fall back to `<REPO_ROOT>/AGENTS.md` only if a needed detail is missing from the digest.

The digest is written once in Phase 0.5b and contains validation commands, repo conventions, and tooling constraints — everything subagents typically need. Reading the digest instead of the full `AGENTS.md` saves ~50K tokens across the ~10 reads per task.

When you replace `<...>` placeholders in the prompts below, automatically prepend `.ai/<PROJECT>/<LETTER>/digested-agents.md` to the "read first" list.

## Per-Phase Subagent Defaults

When spawning, set `subagent_type` and `model` per the table below (see SKILL.md "General Execution Rules" for rationale):

| Phase | subagent_type | model |
|-------|---------------|-------|
| 1 (new) | `Explore` for mapping → `general-purpose` for synthesis | `claude-haiku-4-5-20251001` |
| 1F (follow-up) | `general-purpose` | `claude-haiku-4-5-20251001` |
| 2 / 3 / 2+3 merged | `general-purpose` | `claude-opus-4-7` |
| 4 (implementation) | `general-purpose` | `claude-opus-4-7` |
| 7a (review) | `general-purpose` | `claude-haiku-4-5-20251001` |
| 7b (review fix) | `general-purpose` | `claude-opus-4-7` |

Phases 0, 5, 6, 8 run in the main session — no subagent.

---

## Standard Progress Contract

Append verbatim to every delegated phase prompt:

```text
PROGRESS HEARTBEAT REQUIREMENT:
Before starting deep work, write .ai/<PROJECT>/<LETTER>/logs/<phase-name>.progress.md with:
  Heartbeat: 1
  Step: <what you are about to do>
  Next: <first checkpoint>

Update this file at every natural milestone (not every action) by incrementing Heartbeat and noting:
  - Current step
  - Files being read or modified
  - Key findings or decisions made
  - Next checkpoint or blocker

Keep it concise — under 20 lines. The orchestrator reads mtime and the counter to know you are alive. Do not wait until done to write it.
```

---

## Standard Compact Reply Block

Append verbatim to every delegated phase prompt:

```text
REPLY FORMAT (strict):
Before replying, write all required artifacts to disk.
Then reply in ≤10 lines using exactly these keys — no prose, no restatements:

STATUS: <DONE|BLOCKED|NEEDS_CHANGES|APPROVED>
ARTIFACTS: <comma-separated paths written>
TOUCHED: <repo source paths changed, or "none">
DEVIATIONS: <any departure from the plan, or "none">
BLOCKER: <none, or one precise line describing what is missing>
```

---

## Artifact Completion Checks (orchestrator verifies these after each phase)

| Phase | Check |
|-------|-------|
| Phase 1 | `about.md` exists, non-empty, contains real file paths; `context.md` exists, non-empty, has all required sections including Deployment Safety |
| Phase 2 | `plan.md` exists, has `## Status` with `Phases: <N>`, has Rollback Plan section, no source files in `git diff --stat` |
| Phase 3 | `plan.md` contains `Assessed: yes` |
| Phase 4 | plan.md checkbox flipped to `[x]`; `git diff --stat` shows changes in owned write set; at least one conventional commit |
| Phase 5 | Validation output logged; no unresolved failures; EXPLAIN ANALYZE clean or seq scan fixed; observability gap check done; migration reversibility checked; dependency audit clean or documented; CHANGELOG updated |
| Phase 6 | `screenshots/phase-6-golden-path.png` exists; console error check documented. **Standard/Large:** also `phase-6-mobile.png` + 1+ edge-case screenshots. **Large:** also slow-network + a11y findings in result file |
| Phase 7a | `review<R>.md` exists with `Verdict: APPROVED` or `Verdict: NEEDS_CHANGES` |
| Phase 7b | Fixes applied; post-fix validation passed; no new failures |
| Phase 8 | `logs/phase-8.result.md` exists with PR URL; plan.md PR checkbox flipped |

---

## Phase 0: Setup (runs in main session)

**Execute this before spawning any subagent or writing any code. It is unconditional.**

```bash
# 1. Find repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
echo "Repo root: $REPO_ROOT"

# 2. Guarantee .ai/ exists and list existing projects
mkdir -p "$REPO_ROOT/.ai"
EXISTING=$(ls "$REPO_ROOT/.ai" 2>/dev/null | sort)
echo "Existing projects under .ai/: $EXISTING"

# 3. Determine PROJECT and LETTER. Match in this order:
#    a. Explicit prefix: TASK starts with "continue:NAME ", "followup:NAME ", "project:NAME ", or "[NAME] "
#       → PROJECT=NAME, TASK=remainder
#    b. Exact folder match: FIRST_TOKEN of TASK exactly matches a folder in .ai/
#       → PROJECT=FIRST_TOKEN, TASK=remainder
#    c. Case-insensitive match: lowercase(FIRST_TOKEN) matches lowercase folder name uniquely
#       → PROJECT=that folder, TASK=remainder. If multiple match → ask user.
#    d. No match → new project. PROJECT=derived kebab-case name (no collision), TASK=full input, LETTER=a
#
#    For follow-up (a, b, c): scan .ai/$PROJECT/ for highest existing letter; LETTER = next.
#
#    Then echo a confirmation line so the user can interrupt:
#      "Resuming project '$PROJECT' as task $LETTER (prior: $PREV_LETTER)."
#    or for new project:
#      "Starting new project '$PROJECT' as task a."

# 4. Create task directories unconditionally
mkdir -p "$REPO_ROOT/.ai/$PROJECT/$LETTER/logs"
mkdir -p "$REPO_ROOT/.ai/$PROJECT/$LETTER/screenshots"

# 5. Verify
ls "$REPO_ROOT/.ai/$PROJECT/$LETTER/logs" || { echo "FATAL: directory creation failed"; exit 1; }

# 6. Determine branch prefix from task type (feat/fix/refactor/chore)
#    Create the branch: git checkout -b <prefix>/<project>[-<LETTER> if collision]
```

Write `logs/phase-0.result.md`:
```
Phase: 0
Status: DONE
Project: <PROJECT>
Letter: <LETTER>
Mode: <NEW | FOLLOWUP>
Match method: <explicit-prefix | exact-folder | case-insensitive | new>
Prior letter: <only if FOLLOWUP, else N/A>
Existing projects on entry: <comma-separated list>
Branch: <branch-name>
Path: .ai/<PROJECT>/<LETTER>/
Route: <Quick|Standard|Large>
Reason: <one sentence explaining routing decision>
```

---

## Phase 1: Context — New Project (PARALLEL)

**Run as 3 concurrent `Explore` agents + 1 synthesis pass. Total wall time ~1/3 of sequential.**

### Step 1A — Parallel mapping (single message, 3 Agent calls)

Spawn three `Explore` subagents simultaneously. Each writes a slim findings file under `.ai/<PROJECT>/<LETTER>/logs/`:

| Agent | Scope | Output file |
|-------|-------|-------------|
| explore-backend | `backend/` only — routers, services, models, schemas, Alembic migrations | `logs/phase-1.findings-backend.md` |
| explore-frontend | `frontend/` only — pages, components, hooks, API client, types | `logs/phase-1.findings-frontend.md` |
| explore-tests | All test files relevant to the task domain (backend pytest + frontend Jest) | `logs/phase-1.findings-tests.md` |

Each agent gets the same task description and is told to:
- Find files relevant to the task in its assigned area
- For each file: path, line ranges, function/type names, what it does, why it's relevant
- Note the closest reference implementation in its area
- Write its findings file and reply with the path

Use `subagent_type=Explore`, `model=claude-haiku-4-5-20251001` for all three. Spawn in one message with multiple Agent tool blocks.

### Step 1B — Synthesis (single subagent)

After all three findings files exist, spawn one `general-purpose` subagent (`model=claude-haiku-4-5-20251001`) with the full Phase 1 prompt below. It reads the three findings files (not the whole codebase), runs the validation/risk/observability questions, and writes the final `about.md` + `context.md`.

**Write the synthesis prompt to `logs/phase-1.prompt.md` first.**

### Parallel Explore prompt template (use for each of the 3 Step 1A agents)

```text
You are an `Explore` subagent mapping a specific area of a FastAPI + Next.js codebase for an upcoming task. Read excerpts only, do not implement anything.

TASK: <TASK>
PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>
YOUR AREA: <backend | frontend | tests>

YOUR JOB:
1. Search your assigned area for code relevant to the task.
2. For each relevant file, capture: path, line ranges, function/class/type names, one-line description of relevance.
3. Identify the closest reference implementation in your area — the most analogous existing feature.
4. Note any obvious risks specific to your area (large tables for backend, missing loading states for frontend, brittle test patterns for tests).

WRITE TO: .ai/<PROJECT>/<LETTER>/logs/phase-1.findings-<AREA>.md

Format:
## Relevant Files
- `<path>` (lines X-Y): <relevance>

## Key Symbols
- `<function/class/type name>` in `<file:line>`: <what it does>

## Reference Implementation
- Closest analogous feature: <description + file paths>

## Area-Specific Risks
- <bullet list, or "none">

REPLY FORMAT (≤6 lines):
STATUS: DONE
FINDINGS: <full path to your findings file>
FILES_SCANNED: <approximate count>
KEY_REFERENCE: <one-line description of the best reference implementation found>
```

```text
You are a senior engineer synthesizing pre-gathered findings into the project's working documents.

TASK: <TASK>
PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>

PRE-GATHERED FINDINGS (read first, then verify against actual files for anything you cite):
- .ai/<PROJECT>/<LETTER>/logs/phase-1.findings-backend.md
- .ai/<PROJECT>/<LETTER>/logs/phase-1.findings-frontend.md
- .ai/<PROJECT>/<LETTER>/logs/phase-1.findings-tests.md

YOUR ONLY JOB: Synthesize. Write two documents. Touch zero source files.

═══════════════════════════════════════════════════
STEP 0: Validate the approach before committing to it
═══════════════════════════════════════════════════

Before reading any code, spend 2 minutes on this question: **Is the stated task the right solution to the underlying problem?**

Ask yourself:
- Is there an existing library, utility, or feature in this repo that already does this?
  Search: `grep -rn "<core concept>" backend/ frontend/ --include="*.py" --include="*.ts" -l`
- Is there a simpler approach with lower maintenance cost that achieves the same user outcome?
- Does this task introduce a new abstraction where a direct implementation would be clearer?
- Is this task scoped correctly — or is it trying to solve too many things at once?

Write your conclusion in context.md under "Approach Validation":
- Confirmed approach: <why this is the right solution>
- Alternatives considered: <what was rejected and why>
- Simpler alternative ruled out: <what it was and why it doesn't work here> (or "none found")

If you find a substantially simpler or already-existing solution: stop, write a one-paragraph note in context.md describing it, and flag it in your compact reply under DEVIATIONS. The orchestrator will decide whether to proceed with the original task or adopt the simpler path.

═══════════════════════════════════════════════════
STEP 1: Read the ground rules
═══════════════════════════════════════════════════

Read `.ai/<PROJECT>/<LETTER>/digested-agents.md` first (slim ~50-100 line digest written in Phase 0). Fall back to full `AGENTS.md` only if a needed detail is missing from the digest. Extract:
- Validation commands (exact, including Python venv paths and PowerShell flags)
- Broad validation entrypoint (validate.ps1 or validate.sh)
- Repo-specific policies (CRLF, no network by default, branch naming, etc.)

═══════════════════════════════════════════════════
STEP 2: Read the pre-gathered findings (do NOT re-search)
═══════════════════════════════════════════════════

The Step 1A parallel `Explore` agents already mapped the repo and found relevant code. Read each findings file in full:
- `logs/phase-1.findings-backend.md`
- `logs/phase-1.findings-frontend.md`
- `logs/phase-1.findings-tests.md`

These contain: relevant file paths with line ranges, key symbols (functions/classes/types), reference implementations, and area-specific risks. Trust the findings — do not re-walk the repo.

═══════════════════════════════════════════════════
STEP 3: Spot-check the findings (verify, don't rediscover)
═══════════════════════════════════════════════════

Pick 3-5 of the most central files cited across all findings. For each:
- `ls` or `stat` the path → confirm it exists
- `grep -n "<function_or_type_name>"` → confirm cited symbols are real

If any cited file is missing or any symbol doesn't exist:
- Try a quick `grep` to fix the path/name yourself
- If still wrong, note it in your compact reply under DEVIATIONS and flag the affected finding as `UNVERIFIED` in context.md

Do NOT re-do the entire mapping — that work is already done. Spot-check is enough.

═══════════════════════════════════════════════════
STEP 4: Understand the history of what you're touching
═══════════════════════════════════════════════════

For the 3-5 most central files you will modify:

  git log --oneline -15 -- <file>

For any file with complex or surprising logic, check why it was written that way:

  git log -p --follow -S "<function_name>" -- <file> | head -80

Check for open PRs that touch the same files (avoid conflicting in-flight work):

  gh pr list --state open --json number,title,headRefName | head -20

If you find an open PR touching your files, note it in context.md under Risks — the implementation agent must know about it.

Check what has shipped recently to understand the current trajectory and avoid conflicting with in-flight merges:

  gh pr list --state merged --limit 10 --json number,title,mergedAt
  cat CHANGELOG.md 2>/dev/null | head -60

Note anything recently merged that touches your domain — if someone just merged a related feature, the patterns it introduced are now the canonical ones to follow.

═══════════════════════════════════════════════════
STEP 5: Trace the full data flow
═══════════════════════════════════════════════════

For the task's core operation, trace end-to-end:
  HTTP request → router function → service call → DB query → SQLAlchemy model → response schema → JSON
  Frontend page → hook → API client function → fetch → backend → response → state update → render

Write down every file and function in this chain with exact line numbers.

═══════════════════════════════════════════════════
STEP 6: Find the reference implementation
═══════════════════════════════════════════════════

Find the most similar existing feature already implemented. This becomes the pattern to follow.
- If the task adds a filter: find how another filter is implemented end-to-end
- If the task adds an endpoint: find the closest existing endpoint (same auth pattern, same response shape)
- If the task adds a UI component: find the closest existing component with the same type of interaction

Read the reference implementation fully. Note the exact pattern: how errors are handled, how auth is checked, how the frontend calls the API.

═══════════════════════════════════════════════════
STEP 7: Identify risks, dependencies, and deployment safety
═══════════════════════════════════════════════════

Answer these questions explicitly (write "N/A" if not applicable):
  - Does this task touch any SQLAlchemy model? If yes, which model, which fields?
  - DATA SCALE: How many rows are in the affected tables? Run these NOW — the answer changes everything:
    ```sql
    -- Connect to the DB and check (use alembic env or existing test connection)
    SELECT COUNT(*) FROM <affected_table>;
    ```
    - < 10k rows: any migration approach is safe
    - 10k–1M rows: avoid full table scans; index creation takes seconds
    - > 1M rows: migration must be carefully staged; index requires CONCURRENTLY; backfills must be batched
    - > 10M rows: treat as a major operational event; consult team before proceeding
    Note the row count in context.md — it directly affects the Deployment Safety classification.
  - Does this task need an Alembic migration? (Any model field add/remove/modify = yes)
  - DEPLOYMENT SAFETY: Can the migration run while the old app version is still serving traffic?
    - Adding a nullable column or column with default → safe (online migration)
    - Adding a NOT NULL column without default → unsafe (requires maintenance window or 3-phase deploy)
    - Dropping a column → unsafe (old app will crash) — must remove from code first
    - Adding an index on a large table → use CREATE INDEX CONCURRENTLY, never block
    - Renaming a column → always unsafe; use add + backfill + remove pattern
  - Does this task add or modify an endpoint that needs an auth guard?
  - Does this task change an existing API contract? (changed response shape, removed fields, changed types)
    If yes: what existing clients depend on it? Is this a breaking change?
  - Does this task touch any shared schema or type that could break existing consumers?
  - Are there existing tests that will fail if this feature is added naively?
  - Does this task integrate with an external service (Plaid, Salt Edge, email, etc.)?
  - Are there any environment variables this task depends on?

═══════════════════════════════════════════════════
STEP 8: Note test patterns
═══════════════════════════════════════════════════

  Find the test files most similar to what this task will need:
  - Exact pytest fixtures used for auth, DB session, test client
  - How mock objects or test data are set up
  - How API responses are asserted
  - Frontend: how Jest mocks are structured, how components are rendered in tests
  - Exact commands to run the relevant tests in isolation

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/about.md
═══════════════════════════════════════════════════

Write as if this project already exists fully implemented.

Required sections:
## Project
What this feature does, what problem it solves, who uses it.

## Architecture
Which backend modules are involved (routers, services, models, schemas). Which frontend modules (pages, components, hooks, API client). How they connect.

## Key Design Decisions
Why the data model is structured this way. Why this API shape. Why this component structure. What tradeoffs were made.

## Codebase Touchpoints
Specific file paths, function names, class names, and line ranges central to this feature.

Forbidden: "TODO", "pending", "will be", "not yet", "currently", "planned". Write in present tense.

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/<LETTER>/context.md
═══════════════════════════════════════════════════

This is the primary artifact for all downstream phases. A cold agent implements from this file alone.

Required sections:

## Task Description
Full task restated clearly and completely. No ambiguity.

## Stack
Backend: Python <version>, FastAPI, SQLAlchemy <version>, Alembic, pytest
Frontend: Node.js, Next.js <version>, TypeScript, Jest, npm
Validation: <exact commands from AGENTS.md>

## Relevant Files
For every file relevant to this task:
  - `path/to/file.py` (lines X–Y): <what it does and how it relates to this task>

## Data Flow
End-to-end trace for the feature's core operation:
  Backend: <HTTP verb> <path> → <router function> in <file:line> → <service function> in <file:line> → <model> → <response schema>
  Frontend: <page> → <hook> → <api client function> → fetch → response → state

## Key Types and Interfaces
Every relevant SQLAlchemy model, Pydantic schema, and TypeScript interface with all fields and types.

## API Contract
For every endpoint this task touches or creates:
  Method: GET|POST|PATCH|DELETE
  Path: /api/v1/...
  Auth: Bearer token / none / admin only
  Request body: <schema with field types>
  Response: <schema with field types>
  Error responses: <status codes and conditions>
  Breaking change: yes/no — <what changed if yes>

## Auth and Permission Pattern
How auth is enforced for the affected routes. Which dependency function is injected.

## Reference Implementation
The most analogous existing feature with exact file paths, function signatures, and what to copy vs adapt.

## Alembic Migration Notes
If a model change is needed:
  - Which model, which fields, what column type
  - Deployment safety: <SAFE (online) | UNSAFE — requires 3-phase deploy | UNSAFE — requires maintenance window>
  - Generate: `alembic revision --autogenerate -m "<description>"`
  - Apply: `alembic upgrade head`
  - Rollback: `alembic downgrade -1`
  - Any data backfill needed

## Deployment Safety
  Risk level: <LOW | MEDIUM | HIGH>
  Table row counts: <table_name: N rows — for every table the migration or new query touches>
  Notes: <one paragraph on what could go wrong in production during/after deploy>

## Production Observability
  If this feature breaks silently in production, what would the on-call engineer do to find it?
  Write the exact log queries / grep commands they would run:
  - To confirm the feature is being used: <log pattern or DB query>
  - To find errors from this feature: <grep pattern or log level + message prefix>
  - To diagnose the most likely failure mode: <specific query>
  This section forces you to verify that the implementation will actually emit useful logs.

## Success Metrics
  How do we know this feature is working correctly in production (beyond tests passing)?
  - Expected change in user behaviour: <what metric/log changes when the feature works>
  - Error rate baseline: <what's an acceptable error rate for new endpoints — flag anything > 1%>
  - Latency expectation: <what p95 latency is acceptable for new API endpoints — flag > 500ms>

## Open PRs That Touch These Files
  <list from gh pr list, or "none">

## Test Patterns
  - Backend test file path, pytest fixtures used, exact run command
  - Frontend test file path, Jest mock pattern used

## Validation Commands
  - Targeted backend: <exact pytest command>
  - Targeted frontend: <exact jest command>
  - Broad: <validate.ps1 or validate.sh invocation>

## Risks
  - <anything that could go wrong and needs special attention>
  - <existing tests that might fail from this change>
  - <edge cases the implementation must handle>

Do not implement any code in this phase.
```

---

## Phase 1F: Context — Follow-up Task

**Spawn as subagent. Write full prompt to `logs/phase-1.prompt.md` first.**

```text
You are a senior engineer picking up a follow-up task on an existing project.

NEW TASK: <TASK>
PROJECT: <PROJECT>
LETTER: <LETTER>
PREVIOUS LETTER: <PREV_LETTER>
REPO ROOT: <REPO_ROOT>

YOUR ONLY JOB: Read existing state, gather delta context, produce fresh documents. Touch zero source files.

═══════════════════════════════════════════════════
STEP 1: Read the ground rules and prior work
═══════════════════════════════════════════════════

1. Read AGENTS.md
2. Read .ai/<PROJECT>/about.md — the project blueprint
3. Read .ai/<PROJECT>/<PREV_LETTER>/context.md — the previous task's context
4. Read .ai/<PROJECT>/<PREV_LETTER>/plan.md — what was planned and executed
5. Run `git log --oneline -20` to see recent commits
6. Read the actual source files referenced in the prior context to verify current state
7. Check for open PRs touching these files: `gh pr list --state open --json number,title,headRefName`

═══════════════════════════════════════════════════
STEP 1.5: DRIFT CHECK — what changed since the prior task shipped
═══════════════════════════════════════════════════

The prior `about.md` may be stale. Other developers may have merged changes between task <PREV_LETTER> and now. Detect drift:

```bash
# Find when the prior task's PR was merged (look in .ai/<PROJECT>/<PREV_LETTER>/logs/phase-8.result.md for the PR URL or merge date)
# Then list everything merged to main since then that touches files in prior context.md:

PRIOR_FILES=$(grep -oE '`[^`]+\.(py|ts|tsx|sql)`' .ai/<PROJECT>/<PREV_LETTER>/context.md | tr -d '`' | sort -u)
SINCE=<merge date of prior task — read from phase-8.result.md or use prior task's last commit>

git log --oneline --since="$SINCE" -- $PRIOR_FILES
```

For each commit in that list:
- Read the diff: `git show <sha> -- <file>`
- If it touched a file central to the new task, record it under `## Drift Since Prior Task` in context.md
- If it changes an API/schema/type the new task depends on, the plan must accommodate

Drift findings must be reflected in:
- `## Drift Since Prior Task` section in context.md (new section, see below)
- `## Regression Risks` section (existing)
- `about.md` rewrite (must reflect current reality, not the state at prior task)

═══════════════════════════════════════════════════
STEP 2: Gap analysis for the new task
═══════════════════════════════════════════════════

- What is already implemented that the new task builds on?
- What new files, functions, or types does this task introduce?
- What existing code does this task modify (still in the state the prior context described)?
- What regressions could this task introduce in previously implemented functionality?
- Does this task change any API contract that the previous task established?

Search for any code areas not covered in the prior context that this new task touches.

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/about.md (FULL REWRITE)
═══════════════════════════════════════════════════

Rewrite the entire document as a single coherent description of the project in its final state with this new task included. No history. No temporal language. Same required sections as Phase 1.

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/<LETTER>/context.md
═══════════════════════════════════════════════════

Same required sections as Phase 1 context.md, plus:

## Prior Work Summary
What was already implemented (files and functions), briefly.

## Delta
What specifically this task adds or changes on top of prior work. Be precise.

## Drift Since Prior Task
List every commit merged to main between the prior task and now that touches files in scope. For each:
  - SHA + commit message
  - Files affected
  - Why it matters for this task (or "no impact" with brief reason)
If empty, write "No drift detected — main has not advanced on relevant files since prior task."

## Regression Risks
What previously working features could break. What to test to confirm nothing regressed.

Do not implement any code in this phase.
```

---

## Phase 2+3 Merged: Plan + Self-Assessment (Standard Path)

**Spawn as subagent. Write full prompt to `logs/phase-23.prompt.md` first.**

```text
You are a senior engineer writing an implementation plan and immediately stress-testing it.

PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>

═══════════════════════════════════════════════════
STEP 1: Read everything before writing a single word
═══════════════════════════════════════════════════

Read in order:
1. AGENTS.md
2. .ai/<PROJECT>/<LETTER>/context.md — the full context doc
3. Every source file listed under "Relevant Files" in context.md — read each in full

Do not write plan.md until you have read all of the above.

═══════════════════════════════════════════════════
STEP 2: Write .ai/<PROJECT>/<LETTER>/plan.md
═══════════════════════════════════════════════════

## Task
<one-sentence summary>

## Approach
<2-4 sentences: strategy, key tradeoffs, why this approach over alternatives>

## Risks and Mitigations
For each risk from context.md:
  - Risk: <what could go wrong>
  - Mitigation: <specific step in the plan that addresses it>

## Breaking Change Analysis
  - API contract changes: <yes — describe / no>
  - Clients affected: <list / none>
  - Migration path for existing clients: <describe / N/A>

## Deployment Safety
  - Risk level: <LOW | MEDIUM | HIGH>
  - Can deploy without downtime: <yes / no — explain>
  - 3-phase deploy needed: <yes — describe phases / no>
  - Concurrent index required: <yes — list columns / no>
  - Staged rollout recommended: <yes — describe strategy (e.g. deploy to staging first, then 10% prod, then 100%) / no>
    Signals that warrant staged rollout: touches auth, touches payment flow, changes a shared DB model used by multiple features, new external service integration (Salt Edge, email), or HIGH risk level above

## External Service Resilience
  (Complete this if the task calls Salt Edge, email, Plaid, or any HTTP service outside the app)
  - Timeout: <what timeout value and where it is set — every external call MUST have one>
  - Retry: <retry strategy — exponential backoff, max attempts, which errors are retryable>
  - Fallback: <what happens to the user if the external service is down — degrade gracefully or fail loudly?>
  - Circuit breaker: <yes — describe / no — explain why not needed>
  If this section is N/A: write "N/A — no external service calls"

## Rate Limiting
  - Do new endpoints need rate limiting? <yes — describe limits per user/IP / no — explain>
  - Are there existing rate limiting patterns in the codebase to follow? <file:line>

## CHANGELOG
  - Entry to add to CHANGELOG.md: `## [Unreleased] — <one-line description of what shipped>`
  - Section: <Added | Changed | Fixed | Removed>

## Rollback Plan
  - How to revert if production breaks after deploy:
    1. <step-by-step rollback procedure>
  - Database rollback: `alembic downgrade -1` (verify this is safe given data written)
  - Feature flag to disable without redeploy: <yes — describe / no>

## Commit Strategy
  Number of commits planned: <N>
  Each commit (in order):
  1. `<type>(<scope>): <description>` — <what this commit contains>
  2. ...
  Convention: feat/fix/refactor/chore/test/docs. Each commit must pass tests independently.

## Files to Modify
<path> — <what changes and why>

## Files to Create
<path> — <what it contains and why>

## Implementation Phases

Number every step. Be explicit: exact file path, exact function or class name, exact what to change.

Sequence MUST follow: DB model → Alembic migration → backend service → API router → Pydantic schemas → frontend API client → frontend types → frontend hook → frontend component → frontend page → tests

If any two phases have fully disjoint write sets, mark the SECOND as `[PARALLEL-SAFE: can run concurrently with Phase <N>]`.

### Phase 1: <descriptive name>
Steps:
1. In `<file>`, function `<name>` at line ~<N>: <exactly what to change>

### Phase 2: <descriptive name>
Steps:
1. ...

## Tests to Write or Update
For each new behavior:
  - File: `<test file path>`
  - Test name: `test_<what it tests>`
  - What it asserts: <specific assertion>
  - Fixture needed: <exact fixture name>

## Validation Plan
  Targeted backend: `<exact pytest command>`
  Targeted frontend: `<exact jest command>`
  Broad (only if high-risk): `<validate.ps1 / validate.sh>`
  Expected output: <what passing looks like>

## Status
Phases: <N>
Assessed: no
- [ ] Phase 1: <name>
- [ ] Phase 2: <name>
- [ ] ...
- [ ] Validation
- [ ] Browser test
- [ ] Code review
- [ ] PR

═══════════════════════════════════════════════════
STEP 3: Self-assessment — stress-test the plan
═══════════════════════════════════════════════════

CORRECTNESS (verify against actual files):
- [ ] Every file path in the plan exists (ls or find)
- [ ] Every function name is real (grep for it)
- [ ] Every type/class/field name is real (grep for it)
- [ ] Pydantic schemas are v2-style (model_validate, model_dump, @field_validator, ConfigDict)
- [ ] SQLAlchemy patterns match existing models in the repo

COMPLETENESS:
- [ ] Every new HTTP endpoint has an auth guard
- [ ] Every new page/route has auth on the frontend
- [ ] Every new UI component has loading state, error state, and empty state
- [ ] If any SQLAlchemy model changes: Alembic migration step is in the plan
- [ ] If any model changes: data backfill step is included if rows already exist
- [ ] Every new behavior has a test
- [ ] Deployment safety plan matches the migration type identified in context.md
- [ ] Staged rollout decision is explicit (yes or no, with reasoning — not left blank)
- [ ] External service calls have timeout + retry + fallback (or explicitly N/A)
- [ ] Rate limiting decision is explicit for every new endpoint
- [ ] CHANGELOG entry is planned
- [ ] Rollback plan is reversible (alembic downgrade is safe given what data may exist)
- [ ] Commit strategy produces a clean, readable history (no "fix", "WIP", "temp")

ARCHITECTURE:
- [ ] No business logic in route handlers (logic must be in service layer)
- [ ] No DB queries in frontend components
- [ ] No bare `any` types planned for TypeScript
- [ ] No duplication of existing utilities
- [ ] New imports don't create circular dependencies

PHASE SIZING:
- [ ] Each phase is ≤ 10 substantive changes (if larger, split it)
- [ ] No trivially small phase that could merge with adjacent one
- [ ] Backend phases come before frontend phases that consume them
- [ ] PARALLEL-SAFE labels are correct (truly disjoint write sets)

After applying all fixes, set `Assessed: yes` in the Status section.

Do not implement any code in this phase.
```

---

## Phase 2: Plan — Large Path Only

**Spawn as subagent. Write full prompt to `logs/phase-2.prompt.md` first.**

```text
You are a senior engineer writing a detailed implementation plan.

PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>

Read:
1. AGENTS.md
2. .ai/<PROJECT>/<LETTER>/context.md
3. Every source file listed under "Relevant Files" in context.md — read each in full

Write .ai/<PROJECT>/<LETTER>/plan.md with the same structure as Phase 2+3 merged above (including Breaking Change Analysis, Deployment Safety, Rollback Plan, Commit Strategy sections), but WITHOUT the self-assessment step. Add `Assessed: no` to Status.

Do not implement any code in this phase.
```

---

## Phase 3: Plan Assessment — Large Path Only

**Spawn as subagent. Write full prompt to `logs/phase-3.prompt.md` first.**

```text
You are a plan assessment agent performing an adversarial review of an implementation plan.

PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>

Read:
1. AGENTS.md
2. .ai/<PROJECT>/<LETTER>/context.md
3. .ai/<PROJECT>/<LETTER>/plan.md
4. Every source file referenced in both documents — read each in full

Your job: find every flaw in the plan. Update plan.md in-place to fix them.

CORRECTNESS CHECKS:
- Every file path exists (ls or find)
- Every function name exists (grep)
- Every type/field/class exists (grep)
- Sequence is correct: model → migration → service → router → schema → API client → hook → component → page

COMPLETENESS CHECKS:
- New endpoints missing auth guards
- New pages missing frontend auth
- New UI missing loading/error/empty states
- Model changes without migration step
- New behaviors without test coverage
- Existing tests the change will break (not addressed)
- Deployment safety section missing or incomplete
- Rollback plan missing or unsafe (would data written after deploy block alembic downgrade?)
- Commit strategy missing or has "fix"/"WIP" messages

ARCHITECTURE CHECKS:
- Business logic in route handlers
- DB queries in React components
- TypeScript `any` planned
- Duplication of existing utilities
- Circular imports

PHASE SIZING:
- Phases > 10 steps (split them)
- Phases safe to merge
- Incorrect PARALLEL-SAFE labels

Update plan.md in-place. Set `Assessed: yes` and `Phases: <N>` in Status.

Do not implement any code in this phase.
```

---

## Phase 4: Implementation

**Parallelization check FIRST:** Before spawning, scan plan.md for `[PARALLEL-SAFE]` markers. Spawn all parallel-safe phases in a single Agent call batch.

**Write one prompt per implementation unit. Write to `logs/phase-4<unit>.prompt.md` before spawning.**

```text
You are an implementation agent. You own Phase <N> of the plan and nothing else.

PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>

═══════════════════════════════════════════════════
PRE-FLIGHT: Read before touching anything
═══════════════════════════════════════════════════

Read in order — no skipping:
1. AGENTS.md
2. .ai/<PROJECT>/<LETTER>/context.md
3. .ai/<PROJECT>/<LETTER>/plan.md
4. Every file in your owned write set (read each in full, not just relevant sections)
5. Every file that imports from or is imported by your write set

═══════════════════════════════════════════════════
YOUR OWNED WRITE SET (touch ONLY these files):
═══════════════════════════════════════════════════

<OWNED_WRITE_SET>

═══════════════════════════════════════════════════
YOUR TASK: Implement Phase <N> exactly as specified
═══════════════════════════════════════════════════

<paste the exact Phase <N> steps from plan.md here>

═══════════════════════════════════════════════════
IMPLEMENTATION RULES (non-negotiable)
═══════════════════════════════════════════════════

PATTERN FIDELITY:
- Match the style of the nearest existing implementation precisely.
- Do not introduce new patterns, abstractions, or utilities unless the plan explicitly calls for it.
- Do not add comments beyond what existing similar code has.

SCOPE DISCIPLINE:
- Touch ONLY files in your owned write set.
- Exception: trivially-coupled import fix in a file outside your write set (e.g. `__init__.py` export) — make it and note it in DEVIATIONS.
- If the plan is wrong about a file path or function signature, implement the closest correct thing and note it in DEVIATIONS. Do not block on a plan error.

TESTS:
- Write or update tests as specified in the plan.
- Tests must use the exact fixture pattern shown in context.md.
- Tests must actually run — if you write a test, verify it passes.
- Tests must be meaningful — asserting `status_code == 200` alone is not a test:
  - Assert the response payload fields and values, not just the status
  - Assert the database state changed (or didn't) as expected
  - Assert error responses contain the right error shape, not just a non-200 status
  - Test the sad path: what happens with invalid input, missing auth, missing data?
- Tests must be deterministic: no `time.sleep()`, no random data without a fixed seed, no dependency on wall clock time
- Never test implementation details — test through the public interface (endpoint or component)

COMMIT DISCIPLINE:
- Follow the commit strategy from plan.md.
- Conventional commits only: `feat(scope): description`, `fix(scope): description`, `test(scope): description`, etc.
- Each commit must be atomic: one logical change, passes tests independently.
- No "fix", "WIP", "temp", "update", or vague messages.
- After each commit: `git diff --stat HEAD~1 HEAD` to confirm it contains exactly what you intended.

CIRCULAR IMPORT CHECK:
- After adding new imports: verify no circular dependency by importing the module in a Python shell or checking the import graph mentally.

PYDANTIC V2:
- `model_validate` not `parse_obj`
- `model_dump` not `dict()`
- `@field_validator` not `@validator`
- `ConfigDict` not `class Config`

SQLALCHEMY:
- `selectinload` or `joinedload` for any relationship in a list endpoint
- Never load a relationship inside a loop
- All writes (INSERT/UPDATE/DELETE) must be in an explicit transaction or use the session context manager
- For any new query on a table with > 10k rows: run EXPLAIN ANALYZE and verify index usage.
  A seq scan on a large table in a hot path is a P1 bug. Fix it now, not in production.
  ```python
  # In a test or migration shell:
  result = db.execute(text("EXPLAIN ANALYZE <your query>")).fetchall()
  # Look for "Seq Scan" on large tables — it means no index is being used
  ```

INPUT VALIDATION:
- Every new endpoint that accepts user input must have explicit maximum size guards:
  - String fields: max length defined in Pydantic schema (e.g. `max_length=500`)
  - Array fields: max items defined (e.g. `max_items=100`)
  - File uploads: max size checked before processing
  - No unbounded string or array accepted from the client — without limits, one malicious request can exhaust memory

TYPESCRIPT:
- No bare `any` — use `unknown` and narrow, or define a proper interface
- No `!` non-null assertions unless the invariant is genuinely guaranteed

AUTH:
- Every new backend endpoint MUST include the auth dependency injection
- Every new frontend page MUST include the auth guard

═══════════════════════════════════════════════════
POST-IMPLEMENTATION VERIFICATION
═══════════════════════════════════════════════════

1. Run targeted validation for your files:
   - Backend: `<exact pytest command for your test file>`
   - Frontend: `<exact jest command for your test file>`
2. If validation fails: diagnose, fix, rerun. Repeat once. Note in BLOCKER if still failing.
3. Flip `- [ ] Phase <N>:` to `- [x] Phase <N>:` in plan.md
4. Confirm `git diff --stat` (or `git log --oneline -3`) shows your expected commits
```

---

## Phase 5: Validation (runs in main session — never delegate)

```bash
# Read AGENTS.md for exact commands before running anything
grep -A 30 "Validation" AGENTS.md

# 1. Targeted backend tests
backend/.venv/Scripts/python.exe -m pytest backend/tests/<relevant_test_file>.py -v  # Windows
# backend/.venv/bin/python -m pytest backend/tests/<relevant_test_file>.py -v         # Unix

# 2. Targeted frontend tests
npm test -- --runInBand <test_file_pattern>

# 3. Typecheck for touched frontend files
cd frontend && npx tsc --noEmit

# 4. EXPLAIN ANALYZE — verify new queries use indexes (if tables > 10k rows)
# For every new DB query introduced by this task, run the query plan:
#   backend/.venv/bin/python -c "
#   from backend.database import get_db
#   db = next(get_db())
#   from sqlalchemy import text
#   print(db.execute(text('EXPLAIN ANALYZE <your query>')).fetchall())
#   "
# A "Seq Scan" on a table with > 10k rows = index missing = P1 bug before it even ships.
# Fix: add the missing index in the migration; use CREATE INDEX CONCURRENTLY if table is large.

# 4b. Observability gate — verify new error paths are logged
# For every new except block, error return, or failure branch added by this task:
#   grep -n "logger\.\|log\.\|logging\." <changed_backend_files>
# A new error path with zero logging = invisible failure in production.
# If any new error path has no log statement: add one before proceeding.
# Frontend: check that new async hooks log or surface errors — silent catch blocks are P3.

# 5. Migration reversibility (if a migration was added)
alembic downgrade -1   # verify no errors — data written after upgrade must not block this
alembic upgrade head   # apply again to restore state

# 6. Dependency audit (if new packages were added to requirements.txt or package.json)
# Backend:
pip-audit 2>/dev/null || echo "pip-audit not installed — run: pip install pip-audit && pip-audit"
# Frontend:
cd frontend && npm audit --audit-level=high 2>/dev/null
# If HIGH or CRITICAL CVEs found: do not proceed — find an alternative or patch version.
# Informational/low severity: document in phase-5.result.md and continue.

# 7. Update CHANGELOG.md
# Add the entry planned in plan.md to CHANGELOG.md under ## [Unreleased]:
#   grep -n "Unreleased" CHANGELOG.md  # find the section
#   Add: "- <Added|Changed|Fixed|Removed>: <one-line description from plan.md CHANGELOG section>"
# If CHANGELOG.md doesn't exist, create it with standard Keep-a-Changelog format.

# 8. Broad validation only if task touches high-risk areas (auth, DB schema, shared types)
# Windows: powershell -ExecutionPolicy Bypass -File .\validate.ps1
# Unix: bash validate.sh
```

**Failure handling:**
1. Read the full error output — understand root cause, not just symptom
2. If caused by this change: fix in the source file, rerun
3. If caused by a pre-existing issue: document separately, do not count against this task
4. Repeat once. After 2 cycles without resolution: stop and report the full error

When done, write `logs/phase-5.result.md`:
```
Status: DONE|BLOCKED
Backend tests: <command run> → <PASS/FAIL>
Frontend tests: <command run> → <PASS/FAIL>
Typecheck: <command run> → <PASS/FAIL>
EXPLAIN ANALYZE: <index used — PASS | seq scan found — fixed: describe | skipped — no large tables>
Observability: <all new error paths have log statements | gaps found and fixed: list | skipped — no new error paths>
Migration reversibility: <tested — PASS | skipped — no migration | FAIL + detail>
Dependency audit: <clean | CVEs found: list severity + package | skipped — no new deps>
CHANGELOG: <updated | skipped — reason>
Broad: <skipped reason | command run → PASS/FAIL>
Failures fixed: <list if any>
Remaining issues: <none | description>
```

Flip `- [ ] Validation` to `- [x] Validation` in plan.md.

---

## Phase 6: Browser Test (runs in main session — never delegate)

### Step 0: Auto-detect whether browser test is needed

Run this FIRST before any browser setup:

```bash
UI_CHANGES=$(git diff --name-only main...HEAD | grep -E '^(frontend/|.*\.(tsx|jsx|css|scss|html|svg)$)' || true)

if [ -z "$UI_CHANGES" ]; then
  echo "No UI files in branch diff — skipping Phase 6 cleanly."
  cat > .ai/<PROJECT>/<LETTER>/logs/phase-6.result.md <<EOF
Status: SKIPPED
Reason: No UI files in branch diff. \`git diff --name-only main...HEAD\` shows no frontend/ files and no .tsx/.jsx/.css/.scss/.html/.svg extensions.
Files changed: $(git diff --name-only main...HEAD | wc -l) (all non-UI)
EOF
  # Flip "- [ ] Browser test" to "- [x] Browser test (skipped: no UI changes)" in plan.md
  # Skip the rest of Phase 6 entirely
fi
```

If `UI_CHANGES` is non-empty, proceed with Step 1 below.

**Override:** if the task touches ONLY backend files but the user knows it changes user-facing behavior (e.g. an API response shape change that the existing UI consumes), the orchestrator can manually opt back into Phase 6 by removing the auto-skip line and proceeding. This should be rare.

Skip only for tasks that are provably non-visual: backend-only changes, CLI scripts, pure data migrations with no UI surface.

**Route-aware battery — only run what the route requires:**

| Route | Required steps | Skipped |
|-------|----------------|---------|
| Quick | 1, 2, 3, 4, 5 (golden path desktop only), 10, write result | 6 (mobile), 7 (edge cases), 8 (slow network), 9 (a11y) |
| Standard | Quick + 6 (mobile) + 7 (one edge case) | 8 (slow network), 9 (a11y) |
| Large | All 10 steps | nothing |

For Quick path, `phase-6-mobile.png` is NOT required by the verification rules — only `phase-6-golden-path.png` is mandatory.

**Step 1: Start or verify dev server**
```javascript
// mcp__Claude_Preview__preview_list
// If no server running: mcp__Claude_Preview__preview_start
// Or navigate directly to staging URL if provided
```

**Step 2: Navigate and authenticate**
- Go to the page showing the implemented feature
- For the live app: `ehousing.joinlita.com` with the test user
- OTP: `123456` (backend fallback)

**Step 3: Exercise the golden path — desktop**
- Perform the exact user action the feature enables
- Verify UI response matches expected behavior
- Check network tab: correct API endpoints called, correct payloads, 2xx responses
- **Performance budget check:** Look for regressions introduced by this feature:
  - Any new synchronous blocking requests before first render? (scripts/stylesheets loaded serially)
  - Any API call that takes > 1s that wasn't there before?
  - Any new waterfall (request B only starts after request A finishes, when they could be parallel)?
  - Any significantly larger response payload than expected?
  Note findings — don't block on minor ones, but document anything > 500ms unexpected.

**Step 4: Check console**
```javascript
// mcp__Claude_Preview__preview_console_logs or mcp__Claude_in_Chrome__read_console_messages
// Zero unhandled errors required. Warn-level messages must be understood and documented.
```

**Step 5: Screenshot — golden path (mandatory)**

```bash
mkdir -p "$REPO_ROOT/.ai/$PROJECT/$LETTER/screenshots"
```

Single-state feature — take screenshot and save:
```javascript
// mcp__Claude_Preview__preview_screenshot with save_to_disk: true
// OR mcp__Claude_in_Chrome__computer action:"screenshot" save_to_disk: true
// Save to: .ai/<PROJECT>/<LETTER>/screenshots/phase-6-golden-path.png
```

Multi-step flow — record a GIF:
```javascript
// 1. gif_creator action: "start_recording"
// 2. computer action: "screenshot"   ← initial state frame
// 3. Perform each step (navigate, fill, click)
// 4. computer action: "screenshot"   ← final state frame
// 5. gif_creator action: "stop_recording"
// 6. gif_creator action: "export" download: true, filename: "phase-6-flow.gif"
// Also save static end-state: screenshots/phase-6-golden-path.png
```

**Step 6: Mobile viewport test (mandatory)**

Resize the browser to 375px width and verify the feature is usable on mobile:
```javascript
// mcp__Claude_in_Chrome__resize_window width: 375, height: 812
// OR mcp__Claude_Preview__preview_resize width: 375, height: 812
```

Navigate to the feature, exercise the golden path at mobile size, screenshot:
```
// Save to: screenshots/phase-6-mobile.png
```

Check: does it overflow? Are buttons reachable? Does the layout break?

Restore to desktop size after.

**Step 7: Exercise at least one edge case — screenshot each**
- Invalid input → verify validation error, no crash → `phase-6-edge-1.png`
- Unauthorized user → verify 403/redirect, not 500 → `phase-6-edge-2.png`
- Empty state → verify placeholder, not blank screen → `phase-6-edge-3.png`
- Boundary value (0, max, very long string) → verify graceful → `phase-6-edge-4.png`

**Step 8: Slow network test — verify loading states actually work**

Enable network throttling (Slow 3G / Fast 3G) and repeat the golden path:
```javascript
// mcp__Claude_in_Chrome__javascript_tool:
// document.title  // confirm you're on the right page first
// Then use DevTools network throttling via javascript or navigate to the feature again
```

What to verify:
- Loading skeletons/spinners actually appear (not just a blank screen)
- Partial data states render correctly (first batch loads, more loads on scroll)
- The user cannot double-submit a form while a request is in flight (button disabled/loading)
- No JS errors from race conditions (response arrives after component unmounts)

If any loading state is missing or broken: fix it before proceeding.

Restore network to "No throttling" after this step.

**Step 9: Quick accessibility check**
Tab through all interactive elements on the feature. Verify:
- Focus indicators are visible (not invisible outline)
- Buttons and inputs are reachable by keyboard
- No interactive element is keyboard-trapped
Note any failures — do not block on minor issues, but document them.

**Step 10: Fix anything that looks wrong**
If console error, layout break, or edge case crash:
1. Read the source file
2. Fix the issue
3. Reload and re-screenshot → `screenshots/phase-6-after-fix.png`
4. Re-run targeted validation

**Write `logs/phase-6.result.md`:**
```
Status: DONE|SKIPPED|BLOCKED
URL tested: <url>
Golden path desktop: <PASS | FAIL + description>
Golden path mobile (375px): <PASS | FAIL + description>
Performance: <clean | issues noted: list any requests > 500ms or new blocking resources>
Console errors: <none | list>
Edge cases tested: <list each with PASS/FAIL>
Accessibility: <pass | issues found: list>
Issues fixed: <list if any>
Skip reason: <only if skipped>
Screenshots:
  - screenshots/phase-6-golden-path.png — <one-line description>
  - screenshots/phase-6-mobile.png — <one-line description>
  - screenshots/phase-6-edge-1.png — <one-line description> (omit if not taken)
  - screenshots/phase-6-flow.gif — <one-line description> (omit if not recorded)
  - screenshots/phase-6-after-fix.png — <one-line description> (omit if no fixes applied)
```

Flip `- [ ] Browser test` to `- [x] Browser test (screenshots: screenshots/)` in plan.md.

---

## Phase 7: Code Review Loop

Run up to 3 iterations. Start with `R = 1`.

```
LOOP:
  Run Phase 7a (review) for iteration R
  Read review<R>.md verdict:
    APPROVED → FINISH
    NEEDS_CHANGES → check P0 ESCALATION GATE below → run Phase 7b (fix) → R += 1 → if R ≤ 3: loop else FINISH

FINISH:
  Flip "- [ ] Code review" to "- [x] Code review" in plan.md
```

### P0 ESCALATION GATE (after R=1 only)

If iteration 1's review finds **≥ 3 P0 findings**, this signals Phase 4 had structural problems — autonomous fixing will paper over the real issue. Halt the loop:

```bash
P0_COUNT=$(grep -c '^- Priority: P0$' .ai/<PROJECT>/<LETTER>/review1.md 2>/dev/null || echo 0)
if [ "$P0_COUNT" -ge 3 ]; then
  echo "ESCALATION: review1.md flagged $P0_COUNT P0 issues."
  echo "Phase 4 implementation has structural problems autonomous fixing will not resolve."
  echo "STOPPING the review loop. Decide:"
  echo "  1. Read review1.md and fix manually in this branch."
  echo "  2. Discard Phase 4 work (git reset --hard <pre-phase-4-sha>) and re-run Phase 4 with a different approach."
  echo "  3. Override: explicitly tell the orchestrator to continue ('continue review loop despite P0 count')."
  # Write logs/phase-7-escalated.md with the count and review path; do NOT spawn Phase 7b.
  # Flip "- [ ] Code review" to "- [/] Code review (escalated: <N> P0)" in plan.md.
  exit
fi
```

This gate runs **only after iteration 1**. Subsequent iterations should find fewer issues (the diff is smaller); if they don't, the 3-iteration cap catches it. The R=1 gate specifically catches "Phase 4 wrote bad code" before sinking more autonomous time into fixing it.

---

### Phase 7a: Code Review

**Spawn as subagent. Write full prompt to `logs/phase-7a-review-<R>.prompt.md` first.**

```text
You are an adversarial code reviewer. Your job is to find every real defect before this ships.

PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>
REVIEW ITERATION: <R>

Read:
1. AGENTS.md
2. .ai/<PROJECT>/<LETTER>/context.md
3. .ai/<PROJECT>/<LETTER>/plan.md — especially Deployment Safety, Rollback Plan, Breaking Change Analysis
4. If R > 1: .ai/<PROJECT>/<LETTER>/review<R-1>.md (what was already fixed)
5. Run `git diff main...HEAD` to see ALL changes on this branch — read the full diff
6. Read the full content of every changed source file — not just the diff hunks
7. Read .ai/<PROJECT>/<LETTER>/logs/phase-6.result.md and view the screenshots:
   - Read phase-6-golden-path.png visually — if the UI looks wrong or inconsistent, flag it P3
   - Read phase-6-mobile.png — flag layout issues even if code looks correct
8. Run `git log main...HEAD --oneline` — review commit messages for quality and atomicity

═══════════════════════════════════════════════════
REVIEW CHECKLIST (stop at NEEDS_CHANGES for any P0 finding)
═══════════════════════════════════════════════════

P0 — CORRECTNESS AND SECURITY (any finding = NEEDS_CHANGES):
- [ ] Logic error producing wrong results or data corruption
- [ ] Missing null/undefined check at API boundaries (unhandled None in Python, undefined in TS)
- [ ] Unhandled exception path returning 500 instead of meaningful error
- [ ] Error response leaks internal details to the client: stack trace, file path, DB column name, internal user ID format — these are both a security issue and a support liability
- [ ] Missing auth guard on a new endpoint or new page
- [ ] SQL injection risk (raw string interpolation into queries)
- [ ] Exposed secret or credential in source
- [ ] Pydantic validation bypassed (raw dict access instead of schema validation)
- [ ] Race condition in async code
- [ ] DB write (INSERT/UPDATE/DELETE) outside an explicit transaction or session context manager
- [ ] Missing idempotency on a POST that could be retried (double-submit creates duplicate data)
- [ ] Missing input size validation on user-controlled fields (unbounded string/array = memory exhaustion vector)

P1 — PERFORMANCE AND RELIABILITY (any finding = NEEDS_CHANGES):
- [ ] SQLAlchemy N+1: relationship loaded inside a loop without joinedload/selectinload
- [ ] Missing DB index on a column that will be filtered or sorted by the new query
- [ ] Adding index on a large table without CONCURRENTLY (will lock the table)
- [ ] New query on a large table without EXPLAIN ANALYZE verification (seq scan risk)
- [ ] Unbounded list query (no LIMIT — could return millions of rows)
- [ ] Expensive computation in a hot render path (recalculated on every render)
- [ ] Missing pagination on a new list endpoint
- [ ] External HTTP call (Salt Edge, email, Plaid, etc.) without a timeout — one network hiccup hangs the request handler indefinitely
- [ ] External HTTP call without retry logic — one transient failure permanently breaks the user's action
- [ ] External HTTP call without a fallback or graceful degradation path

P2 — TYPE SAFETY AND API CONTRACTS:
- [ ] Bare `any` type in TypeScript
- [ ] `!` non-null assertion without a comment explaining the invariant
- [ ] Pydantic v1-style code (parse_obj, .dict(), @validator, class Config)
- [ ] Missing return type annotation on a public Python function
- [ ] Breaking API change not flagged in plan.md Breaking Change Analysis
- [ ] Response schema has removed or renamed a field that existing clients read

P3 — CODE QUALITY AND OBSERVABILITY:
- [ ] Dead code (unreachable branches, unused imports, unused variables)
- [ ] Duplication of logic already in an existing utility
- [ ] Business logic in a route handler (should be in service layer)
- [ ] DB query in a React component (should be in hook or API client)
- [ ] New error path with no logging — if this fails in production, will it be invisible?
- [ ] New feature with no observability: no log line on success, no log line on failure
- [ ] "3am diagnosability" failure: if this feature silently misbehaves at 3am, can the on-call engineer identify the problem in under 5 minutes using only logs? If not, the log messages are insufficient.
- [ ] Hardcoded magic values: numeric IDs, hardcoded user emails, hardcoded env-specific URLs, hardcoded secrets or tokens, hardcoded role names — anything that should be config, env var, or constant
- [ ] Missing UI states: loading, error, empty — for any new async component
- [ ] Mobile layout broken (from screenshots)
- [ ] UI inconsistency with the rest of the app (from screenshots)
- [ ] Performance regression noted in phase-6.result.md left unaddressed

P4 — TEST COVERAGE AND QUALITY:
- [ ] New endpoint with no pytest test
- [ ] New behavior with no test assertion
- [ ] Test only covers happy path when meaningful error cases exist
- [ ] Missing test for the auth guard (unauthenticated request should get 401/403)
- [ ] Test only asserts `status_code == 200` — no assertions on response payload fields or values
- [ ] Test asserts on implementation details instead of observable behaviour (brittle to refactor)
- [ ] Non-deterministic test: uses `time.sleep()`, wall-clock time, or unseeded random data

P5 — COMMIT QUALITY AND HOUSEKEEPING (flag only if it will confuse future git blame):
- [ ] Commit message is vague ("fix", "update", "changes") — should be conventional commit
- [ ] Multiple unrelated changes in one commit
- [ ] File placed in wrong directory (wrong layer/module)
- [ ] Naming inconsistent with the rest of the codebase
- [ ] CHANGELOG.md not updated — every user-visible change must be documented

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/<LETTER>/review<R>.md
═══════════════════════════════════════════════════

## Code Review — Iteration <R>

## Summary
<1-2 sentence honest assessment: production-ready or gaps?>

## Commit Quality
<clean history / issues found: list>

## Verdict: <APPROVED | NEEDS_CHANGES>

(Only if NEEDS_CHANGES:)
## Changes Required

### <Issue Title>
- Priority: <P0|P1|P2|P3|P4|P5>
- File: `<exact path>`, line ~<N>
- Problem: <what is wrong, precisely>
- Fix: <exactly what to change — specific enough to implement without guessing>

Rules:
- Only flag issues in code added or modified by this task
- Every finding must have a concrete negative consequence
- Do not request comments, docstrings, or speculative refactors
- Do not flag style preferences as P0/P1
```

---

### Phase 7b: Review Fix

**Spawn as subagent. Write full prompt to `logs/phase-7b-fix-<R>.prompt.md` first.**

```text
You are a fix agent implementing specific changes from a code review.

PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>
FIXING REVIEW: <R>

Read:
1. AGENTS.md
2. .ai/<PROJECT>/<LETTER>/context.md
3. .ai/<PROJECT>/<LETTER>/review<R>.md — this is your work order
4. Every source file mentioned in review<R>.md — read each in full before touching

YOUR TASK:
Implement every change listed under "Changes Required". Nothing more, nothing less.

Rules:
- Do not refactor adjacent code not in the review
- Do not change test behavior unless the review explicitly calls for it
- If a fix conflicts with a plan step, implement the fix — review takes precedence for correctness
- Commit each fix atomically: `fix(<scope>): <what was wrong>`

After all changes:
1. Run targeted validation (tests + typecheck for touched files)
2. If validation fails: diagnose and fix. Repeat once. Note in BLOCKER if still failing.
3. Confirm `git log main...HEAD --oneline` shows clean, conventional commit history
```

---

## Phase 8: Create PR (runs in main session — never delegate)

**Gate: only run after Phase 5 passes, Phase 6 completes, and Phase 7 reaches APPROVED (or review limit with documented rationale). Do not open a PR on broken work.**

**Step 1: Check for related issues**
```bash
# Search for issues related to this task
gh issue list --state open --search "<2-3 keywords from task>" --json number,title | head -10
```

Note any matching issue number — it will go in the PR body.

**Step 2: Clean commit history**

Review the commits on this branch:
```bash
git log main...HEAD --oneline
```

If there are any fix/WIP/temp commits that should be squashed into their parent:
```bash
# Interactive rebase to squash/rename — only if commits haven't been shared/pushed yet
git rebase -i main
```

After rebase, all commits must follow the convention from plan.md Commit Strategy. Push:
```bash
git push -u origin HEAD
```

If push fails due to upstream divergence, do NOT force-push without understanding why. Report to user.

**Step 3: Read all artifacts to compose the PR body**

Read these to populate the template:
- `.ai/<PROJECT>/<LETTER>/context.md` → Task Description, API Contract, Deployment Safety
- `.ai/<PROJECT>/<LETTER>/plan.md` → Approach, Rollback Plan, files modified/created
- `logs/phase-5.result.md` → validation results
- `logs/phase-6.result.md` → browser test results and screenshot paths
- `review<R>.md` → review rounds, issues found and fixed

**Step 4: Read the repo's actual PR template, then create the PR**

```bash
# Find the template — GitHub looks for these in order
TEMPLATE=""
for path in .github/pull_request_template.md \
            .github/PULL_REQUEST_TEMPLATE.md \
            .github/PULL_REQUEST_TEMPLATES/pull_request_template.md \
            docs/pull_request_template.md; do
  if [ -f "$path" ]; then TEMPLATE="$path"; break; fi
done

# If found, use it as the base. Fill placeholder sections from artifacts.
# If not found, fall back to the embedded default below.
```

PR title: under 70 chars, conventional commit prefix, imperative mood:
- `feat: add date range filter to property search`
- `fix: populate outstanding debt panel for income_history applicants`
- `chore: rename task-think → task-think-claude, remove codex from .claude`

**Body construction:**

1. If `$TEMPLATE` is non-empty, read it. The template usually has section headers (issue, what/why, screenshots, deployment, etc.). Fill each section using artifacts:
   - **Issue / Linked issue** ← Step 1's `gh issue list` result (or `N/A`)
   - **What does this PR do** ← `plan.md` `## Task` + `## Approach`
   - **Screenshots / Video** ← every file in `.ai/<PROJECT>/<LETTER>/screenshots/`
   - **Impact / Risk** ← `plan.md` `## Risks and Mitigations`
   - **Rollback plan** ← `plan.md` `## Rollback Plan`
   - **Deployment instructions** ← `plan.md` `## Deployment Safety` + migration commands if any
   - **Validation / Tests** ← `phase-5.result.md` summary line
   - **Checklist** ← check every item that's actually true; leave unchecked ones unchecked (do not lie)
2. If no template exists, use the embedded fallback below.
3. Always append the generated-by footer.

**Fallback body (only if no template found):**

```bash
gh pr create --title "<title>" --body "$(cat <<'PRBODY'
## Summary
<1-3 bullets — what was built and why>

## Screenshots
.ai/<PROJECT>/<LETTER>/screenshots/phase-6-golden-path.png
<list any others>

## Validation
- Backend tests: <PASS | SKIP>
- Frontend tests: <PASS | SKIP>
- Typecheck: <PASS | SKIP>
- Migration reversibility: <PASS | N/A>

## Code review
<N round(s) — key issues fixed, or first-pass approval>

## Rollback
<from plan.md Rollback Plan>

🤖 Generated with [Claude Code](https://claude.com/claude-code) via task-think-claude
PRBODY
)"
```

**With template (preferred path):**

```bash
# Compose body by filling the template placeholders, then create PR
gh pr create --title "<title>" --body "$(envsubst < /tmp/pr_body_filled.md || cat /tmp/pr_body_filled.md)"
```

Always end the body with: `🤖 Generated with [Claude Code](https://claude.com/claude-code) via task-think-claude`

Never check a checklist item that isn't actually true — reviewers trust filled checkboxes.

**Step 5: Record and verify**

The `gh pr create` command prints the PR URL. Capture it.

Write `logs/phase-8.result.md`:
```
Phase: 8
Status: DONE
PR: <URL>
PR number: <#N>
Branch: <branch name>
Title: <PR title>
Issue linked: <#N | none>
Commits on branch: <N>
```

Flip `- [ ] PR` to `- [x] PR (<URL>)` in plan.md.

---

## Completion Report

When all phases are done:

```
═══════════════════════════════════════════════
TASK COMPLETE: <PROJECT> / <LETTER>
═══════════════════════════════════════════════

What was built:
  <1-2 sentence feature description — what a user experiences, not what code was written>

Files changed:
  Modified: <list>
  Created: <list>

Validation:
  Backend tests: <PASS | FAIL + detail>
  Frontend tests: <PASS | FAIL + detail>
  Typecheck: <PASS | FAIL + detail>
  Migration reversibility: <PASS | skipped | FAIL + detail>
  Broad: <PASS | skipped — reason>

Browser test:
  URL: <url>
  Desktop golden path: <PASS | FAIL>
  Mobile golden path (375px): <PASS | FAIL>
  Edge cases: <list each + PASS/FAIL>
  Accessibility: <pass | issues noted>
  Screenshots captured:
    - .ai/<PROJECT>/<LETTER>/screenshots/phase-6-golden-path.png
    - .ai/<PROJECT>/<LETTER>/screenshots/phase-6-mobile.png
    - <any additional screenshots>
    (or: skipped — <reason>)

Code review:
  Rounds: <N>
  Issues found and fixed: <list key fixes, or "none — first-pass approval">
  Final verdict: APPROVED

PR: <URL>
Branch: <branch-name>
Commits: <N> (<summary of commit history>)

Time: <Xh Ym Zs>

Follow-up project name: <PROJECT>
  (Use "Use local task-think-claude skill: <PROJECT> <next task description>" for follow-ups)
═══════════════════════════════════════════════
```

---

## Error Handling Ladder

**Phase fails to produce artifact:**
1. Re-read the phase prompt and tighten it (add explicit file paths, add "write the file NOW before replying")
2. Spawn a fresh subagent with the tightened prompt
3. After 2 failed spawns: report to user with last error

**Phase times out:**
1. Check `logs/<phase>.progress.md` mtime
2. If mtime advanced: wait one more interval
3. If mtime stale + heartbeat unchanged: send one nudge ("Please write your progress file and continue")
4. If still no movement after nudge + wait: close and spawn fresh

**Validation fails after 2 fix cycles:**
Report to user with full command output and error. Do not guess further fixes.

**Review-fix introduces new failures:**
Report to user — do not attempt a third layer of fixes autonomously.

**Implementation diff is empty (agent claimed done but wrote nothing):**
Re-spawn immediately. Add to the new prompt: "Your previous run produced an empty git diff. You MUST write actual code changes to source files. Do not reply until `git diff --stat` shows your changes."

**Push fails due to upstream divergence:**
Do NOT force-push. Report to user with `git status` and `git log --oneline -10` output. The user decides how to resolve.
