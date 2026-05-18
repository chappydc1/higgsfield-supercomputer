# Phase Prompts

Templates for Claude subagent messages. Replace `<TASK>`, `<PROJECT>`, `<LETTER>`, `<PREV_LETTER>`, `<REPO_ROOT>`, `<OWNED_WRITE_SET>`, `<N>`, `<R>` before sending.

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
| Phase 1 | `about.md` exists, non-empty, contains real file paths; `context.md` exists, non-empty, has all required sections |
| Phase 2 | `plan.md` exists, has `## Status` with `Phases: <N>`, no source files in `git diff --stat` |
| Phase 3 | `plan.md` contains `Assessed: yes` |
| Phase 4 | plan.md checkbox flipped to `[x]`; `git diff --stat` shows changes in owned write set; diff is non-empty |
| Phase 5 | Validation output logged; no unresolved failures |
| Phase 6 | Screenshot path recorded; console error check documented |
| Phase 7a | `review<R>.md` exists with `Verdict: APPROVED` or `Verdict: NEEDS_CHANGES` |
| Phase 7b | Fixes applied; post-fix validation passed; no new failures |

---

## Phase 0: Setup (runs in main session)

**Execute this before spawning any subagent or writing any code. It is unconditional.**

```bash
# 1. Find repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
echo "Repo root: $REPO_ROOT"

# 2. Guarantee .ai/ exists — mkdir -p never fails if it already exists
mkdir -p "$REPO_ROOT/.ai"

# 3. Determine PROJECT and LETTER (see SKILL.md Phase 0 logic)
# FIRST_TOKEN = first word of task description
# If .ai/$FIRST_TOKEN/about.md exists: follow-up, PROJECT=$FIRST_TOKEN, LETTER=next after highest existing
# Else: new project, derive PROJECT name, LETTER=a

# 4. Create task directories unconditionally
mkdir -p "$REPO_ROOT/.ai/$PROJECT/$LETTER/logs"

# 5. Verify
ls "$REPO_ROOT/.ai/$PROJECT/$LETTER/logs" || { echo "FATAL: directory creation failed"; exit 1; }
```

Write `logs/phase-0.result.md`:
```
Phase: 0
Status: DONE
Project: <PROJECT>
Letter: <LETTER>
Path: .ai/<PROJECT>/<LETTER>/
Route: <Quick|Standard|Large>
Reason: <one sentence explaining routing decision>
```

---

## Phase 1: Context — New Project

**Spawn as subagent. Write full prompt to `logs/phase-1.prompt.md` first.**

```text
You are a senior engineer performing deep codebase analysis before any implementation begins.

TASK: <TASK>
PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>

YOUR ONLY JOB: Read and understand. Write two documents. Touch zero source files.

═══════════════════════════════════════════════════
STEP 1: Read the ground rules
═══════════════════════════════════════════════════

Read AGENTS.md in full. Extract and note:
- Validation commands (exact, including Python venv paths and PowerShell flags)
- Broad validation entrypoint (validate.ps1 or validate.sh)
- Any repo-specific policies (CRLF, no network by default, etc.)

═══════════════════════════════════════════════════
STEP 2: Map the repo structure
═══════════════════════════════════════════════════

Run these to orient yourself:
  find . -name "*.py" -path "*/backend/*" | head -60
  find . -name "*.ts" -path "*/frontend/*" | head -60
  ls backend/
  ls frontend/src/ or ls frontend/app/ or ls frontend/pages/

Understand the layout:
  Backend (FastAPI/Python):
  - Routers: where HTTP endpoints are defined
  - Services/business logic: where DB operations and domain logic live
  - Models: SQLAlchemy ORM models
  - Schemas: Pydantic request/response schemas
  - Migrations: Alembic migration scripts
  - Tests: pytest test files and fixtures

  Frontend (Next.js/TypeScript):
  - Pages or App Router: route-level components
  - Components: shared UI components
  - Hooks: shared data-fetching and state hooks
  - API client: how frontend calls the backend
  - Types: shared TypeScript types

═══════════════════════════════════════════════════
STEP 3: Search for task-relevant code
═══════════════════════════════════════════════════

Search aggressively. For every domain concept in the task, grep for it:
  grep -rn "<keyword>" backend/ --include="*.py" -l
  grep -rn "<keyword>" frontend/ --include="*.ts" --include="*.tsx" -l

Open and read EVERY file that comes up. Do not skim. Read fully.

For each relevant file, extract:
  - File path + line ranges of relevant sections
  - Exact function signatures, class names, field names
  - Data shapes (SQLAlchemy column types, Pydantic field definitions, TypeScript interfaces)
  - How this file connects to others (imports, dependency injection, hook usage)

═══════════════════════════════════════════════════
STEP 4: Trace the full data flow
═══════════════════════════════════════════════════

For the task's core operation, trace end-to-end:
  HTTP request → router function → service call → DB query → SQLAlchemy model → response schema → JSON
  Frontend page → hook → API client function → fetch → backend → response → state update → render

Write down every file and function in this chain with exact line numbers.

═══════════════════════════════════════════════════
STEP 5: Find the reference implementation
═══════════════════════════════════════════════════

Find the most similar existing feature already implemented. This becomes the pattern to follow.
- If the task adds a filter: find how another filter is implemented end-to-end
- If the task adds an endpoint: find the closest existing endpoint (same auth pattern, same response shape)
- If the task adds a UI component: find the closest existing component with the same type of interaction

Read the reference implementation fully. Note the exact pattern: how errors are handled, how auth is checked, how the frontend calls the API.

═══════════════════════════════════════════════════
STEP 6: Identify risks and dependencies
═══════════════════════════════════════════════════

Answer these questions explicitly (write "N/A" if not applicable):
  - Does this task touch any SQLAlchemy model? If yes, which model, which fields?
  - Does this task need an Alembic migration? (Any model field add/remove/modify = yes)
  - Does this task add or modify an endpoint that needs an auth guard?
  - Does this task touch any shared schema or type that could break existing consumers?
  - Are there existing tests that will fail if this feature is added naively?
  - Does this task integrate with an external service (Plaid, Salt Edge, email, etc.)?
  - Are there any environment variables this task depends on?

═══════════════════════════════════════════════════
STEP 7: Note test patterns
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

Write as if this project already exists fully implemented. Future follow-up tasks will read this to understand the project without rereading the codebase.

Required sections:
## Project
What this feature does, what problem it solves, who uses it.

## Architecture
Which backend modules are involved (routers, services, models, schemas). Which frontend modules (pages, components, hooks, API client). How they connect.

## Key Design Decisions
Why the data model is structured this way. Why this API shape. Why this component structure. What tradeoffs were made.

## Codebase Touchpoints
Specific file paths, function names, class names, and line ranges that are central to this feature.

Forbidden: "TODO", "pending", "will be", "not yet", "currently", "planned". Write in present tense describing final state.

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/<LETTER>/context.md
═══════════════════════════════════════════════════

This is the primary artifact for all downstream phases. A cold agent will implement from this file alone. If information is missing here, the implementation agent will get it wrong.

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
  Include all: routers, services, models, schemas, migrations, tests, frontend pages, components, hooks, API client, types

## Data Flow
End-to-end trace for the feature's core operation:
  Backend: <HTTP verb> <path> → <router function> in <file:line> → <service function> in <file:line> → <model> → <response schema>
  Frontend: <page> → <hook> → <api client function> → fetch → response → state

## Key Types and Interfaces
Every relevant:
  - SQLAlchemy model class with column names and types
  - Pydantic schema class with field names and types
  - TypeScript interface/type with all fields

## API Contract
For every endpoint this task touches or creates:
  Method: GET|POST|PATCH|DELETE
  Path: /api/v1/...
  Auth: Bearer token / none / admin only
  Request body: <schema with field types>
  Response: <schema with field types>
  Error responses: <status codes and conditions>

## Auth and Permission Pattern
How auth is enforced for the affected routes. Which dependency function is injected. What happens on unauthorized access.

## Reference Implementation
The most analogous existing feature, with:
  - Backend file paths and key function signatures
  - Frontend file paths and key component/hook structure
  - What to copy vs what to adapt

## Alembic Migration Notes
If a model change is needed:
  - Which model, which fields
  - Exact command to generate: `alembic revision --autogenerate -m "<description>"`
  - Exact command to apply: `alembic upgrade head`
  - Any data backfill needed

## Test Patterns
  - Backend test file path for the relevant area
  - Pytest fixtures used (auth, db session, test client) with exact import paths
  - How to run just these tests in isolation (exact command)
  - Frontend test file path for the relevant area
  - Jest mock pattern used

## Validation Commands
Exact commands, copy-pasteable:
  - Targeted backend: <exact pytest command>
  - Targeted frontend: <exact jest command>
  - Broad: <validate.ps1 or validate.sh invocation>

## Risks
- <anything that could go wrong and needs special attention during implementation>
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
5. Run `git log --oneline -20` to see recent commits that implement prior work
6. Read the actual source files referenced in the prior context to verify current state

═══════════════════════════════════════════════════
STEP 2: Gap analysis for the new task
═══════════════════════════════════════════════════

Based on the new task:
- What is already implemented that the new task builds on?
- What new files, functions, or types does this task introduce?
- What existing code does this task modify (and are those files still in the state the prior context described)?
- What regressions could this task introduce in previously implemented functionality?

Search for any code areas not covered in the prior context that this new task touches.

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/about.md (FULL REWRITE)
═══════════════════════════════════════════════════

Rewrite the entire document as a single coherent description of the project in its final state with this new task included. No history. No "in task B we added". No temporal language. It should read as if the entire feature set was always there.

Same required sections as Phase 1: Project, Architecture, Key Design Decisions, Codebase Touchpoints.

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/<LETTER>/context.md
═══════════════════════════════════════════════════

Same required sections as Phase 1 context.md, plus:

## Prior Work Summary
What was already implemented (files and functions), briefly. The implementation agent should not re-implement these — just use them.

## Delta
What specifically this task adds or changes on top of prior work. Be precise.

## Regression Risks
What previously working features could break if this task is implemented carelessly. What to test to confirm nothing regressed.

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
3. Every source file listed under "Relevant Files" in context.md — read each one in full, not just the referenced lines

Do not write plan.md until you have read all of the above.

═══════════════════════════════════════════════════
STEP 2: Write .ai/<PROJECT>/<LETTER>/plan.md
═══════════════════════════════════════════════════

Structure:

## Task
<one-sentence summary>

## Approach
<2-4 sentences: strategy, key tradeoffs, why this approach over alternatives>

## Risks and Mitigations
For each risk identified in context.md:
  - Risk: <what could go wrong>
  - Mitigation: <specific step in the plan that addresses it>

## Files to Modify
<path> — <what changes and why>
(list every file; be specific about what changes, not just "update")

## Files to Create
<path> — <what it contains and why>

## Implementation Phases

Number every step. Be explicit: exact file path, exact function or class name, exact what to add/change/remove/where in the file.

Sequence MUST follow: DB model change → Alembic migration → backend service → API router → Pydantic schemas → frontend API client → frontend types → frontend hook → frontend component → frontend page → tests

If any two phases have fully disjoint write sets (no shared files), mark the SECOND one as `[PARALLEL-SAFE: can run concurrently with Phase <N>]`.

### Phase 1: <descriptive name>
Steps:
1. In `<file>`, function `<name>` at line ~<N>: <exactly what to change>
2. ...

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
  Broad (run only if task is high-risk): `<validate.ps1 / validate.sh>`
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

═══════════════════════════════════════════════════
STEP 3: Self-assessment — stress-test the plan
═══════════════════════════════════════════════════

For every item below, check it against the actual codebase (re-read source files as needed). Fix any issue directly in plan.md before finalizing.

CORRECTNESS:
- [ ] Every file path in the plan exists in the repo right now (check with ls or find)
- [ ] Every function name is real (grep for it)
- [ ] Every type/class/field name is real (grep for it)
- [ ] Pydantic schemas are v2-style (model_validate, model_dump, @field_validator, ConfigDict)
- [ ] SQLAlchemy patterns match existing models in the repo

COMPLETENESS:
- [ ] Every new HTTP endpoint has an auth guard (check how existing endpoints do it)
- [ ] Every new page/route has auth on the frontend too (middleware or layout guard)
- [ ] Every new UI component has loading state, error state, and empty state
- [ ] If any SQLAlchemy model changes: Alembic migration step is in the plan
- [ ] If any model changes: data backfill step is included if rows already exist
- [ ] Every new behavior has a test in the plan

ARCHITECTURE:
- [ ] No business logic in route handlers (logic must be in service layer)
- [ ] No DB queries in frontend components
- [ ] No bare `any` types planned for TypeScript
- [ ] No duplication — if similar logic already exists, the plan reuses it

PHASE SIZING:
- [ ] Each phase is ≤ 10 substantive changes (if larger, split it)
- [ ] No trivially small phase that could be merged into an adjacent one
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

Write .ai/<PROJECT>/<LETTER>/plan.md with the same structure as the Phase 2+3 merged plan above, but WITHOUT the self-assessment step. Add `Assessed: no` to the Status section.

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
4. Every source file referenced in both documents — read each one in full to verify the plan's claims

Your job: find every flaw in the plan. Update plan.md in-place to fix them.

CORRECTNESS CHECKS (verify against actual files):
- Every file path exists (ls or find them)
- Every function name exists (grep for them)
- Every type/field/class exists (grep for them)
- The sequence is correct: model → migration → service → router → schema → API client → hook → component → page

COMPLETENESS CHECKS:
- New endpoints missing auth guards
- New pages missing frontend auth
- New UI missing loading/error/empty states
- Model changes without migration step
- New behaviors without test coverage
- Existing tests that the change will break (and aren't addressed)

ARCHITECTURE CHECKS:
- Business logic in route handlers (should be in service)
- DB queries in React components (should be in hooks/API client)
- TypeScript `any` planned
- Duplication of existing utilities

PHASE SIZING:
- Phases with more than 10 steps (split them)
- Phases that can be safely merged
- PARALLEL-SAFE labels that are wrong

Update plan.md in-place: fix inaccuracies, add missing steps, rebalance phases.
Add `Assessed: yes` at the bottom of the Status section.
Add `Phases: <N>` to Status if not present.

Do not implement any code in this phase.
```

---

## Phase 4: Implementation

**Parallelization check FIRST:** Before spawning any agent, scan plan.md for `[PARALLEL-SAFE]` markers. Spawn all parallel-safe phases in a single Agent tool call batch. Sequential is the fallback, not the default.

**Write one prompt per implementation unit. Write full prompt to `logs/phase-4<unit>.prompt.md` before spawning.**

```text
You are an implementation agent. You own Phase <N> of the plan and nothing else.

PROJECT: <PROJECT>
LETTER: <LETTER>
REPO ROOT: <REPO_ROOT>

═══════════════════════════════════════════════════
PRE-FLIGHT: Read before touching anything
═══════════════════════════════════════════════════

Read these in order. Do not skip any:
1. AGENTS.md
2. .ai/<PROJECT>/<LETTER>/context.md
3. .ai/<PROJECT>/<LETTER>/plan.md
4. Every file listed in your owned write set (read each file in full, not just the relevant section)
5. Every file that imports from or is imported by your write set (to understand coupling)

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
- Match the style of the nearest existing implementation precisely. If the codebase uses snake_case for Pydantic fields, use snake_case. If it uses camelCase for TypeScript, use camelCase. If it uses a particular error response shape, match it exactly.
- Do not introduce new patterns, abstractions, or utilities unless the plan explicitly calls for it.
- Do not add comments, docstrings, or type annotations beyond what existing similar code has.

SCOPE DISCIPLINE:
- Touch ONLY files in your owned write set.
- Exception: if you discover a trivially-coupled import fix needed in a file outside your write set (e.g. an `__init__.py` export), make it and note it in DEVIATIONS.
- If the plan is wrong about a file path or function signature, implement the closest correct thing and note it in DEVIATIONS. Do not block on a plan error.

TESTS:
- Write or update tests as specified in the plan.
- Tests must use the exact fixture pattern shown in context.md.
- Tests must actually run — if you write a test, verify it passes.

PYDANTIC V2:
- Use `model_validate` not `parse_obj`
- Use `model_dump` not `dict()`
- Use `@field_validator` not `@validator`
- Use `ConfigDict` not `class Config`

SQLALCHEMY:
- Use `selectinload` or `joinedload` for any relationship loaded in a list endpoint
- Never load a relationship inside a loop

TYPESCRIPT:
- No bare `any` types — use `unknown` and narrow, or define a proper interface
- No `!` non-null assertions unless the value is genuinely guaranteed non-null by invariant

AUTH:
- Every new backend endpoint MUST include the auth dependency injection
- Every new frontend page MUST include the auth guard (check how existing pages do it)

═══════════════════════════════════════════════════
POST-IMPLEMENTATION VERIFICATION
═══════════════════════════════════════════════════

After implementing, do ALL of the following before replying:

1. Run the targeted validation command from context.md for the files you touched:
   - Backend: `<exact pytest command for your test file>`
   - Frontend: `<exact jest command for your test file>`
2. If validation fails: diagnose, fix, rerun. Repeat once. If still failing, note in BLOCKER.
3. Flip `- [ ] Phase <N>:` to `- [x] Phase <N>:` in plan.md
4. Confirm `git diff --stat` shows your expected files — if the diff is empty, your changes did not save; fix this before replying
```

---

## Phase 5: Validation (runs in main session — never delegate)

```bash
# Read AGENTS.md for exact commands before running anything
cat AGENTS.md | grep -A 30 "Validation"

# 1. Targeted backend tests (for the specific files changed)
# Replace with exact command from AGENTS.md:
backend/.venv/Scripts/python.exe -m pytest backend/tests/<relevant_test_file>.py -v
# On Unix:
# backend/.venv/bin/python -m pytest backend/tests/<relevant_test_file>.py -v

# 2. Targeted frontend tests
npm test -- --runInBand <test_file_pattern>

# 3. Targeted typecheck for touched frontend files
cd frontend && npx tsc --noEmit

# 4. Broad validation only if the task touches high-risk areas (auth, DB schema, shared types)
# Windows: powershell -ExecutionPolicy Bypass -File .\validate.ps1
# Unix: bash validate.sh
```

**Failure handling:**
1. Read the full error output — understand the root cause, not just the symptom
2. If caused by this change: fix it in the relevant source file, rerun validation
3. If caused by a pre-existing issue: document it separately, do not count it as a failure of this task
4. Repeat once. After 2 fix-and-rerun cycles without resolution, stop and report the full error

When done, write `logs/phase-5.result.md`:
```
Status: DONE|BLOCKED
Backend tests: <command run> → <PASS/FAIL>
Frontend tests: <command run> → <PASS/FAIL>
Typecheck: <command run> → <PASS/FAIL>
Broad: <skipped reason | command run → PASS/FAIL>
Failures fixed: <list if any>
Remaining issues: <none | description>
```

Flip `- [ ] Validation` to `- [x] Validation` in plan.md.

---

## Phase 6: Browser Test (runs in main session — never delegate)

Skip only for tasks that are provably non-visual: backend-only changes, CLI scripts, pure data migrations with no UI surface. If there is ANY frontend component or page involved, run this phase.

**Step 1: Start or verify dev server**
```javascript
// Check if a preview server is already running
// mcp__Claude_Preview__preview_list
// If not running:
// mcp__Claude_Preview__preview_start — or navigate directly to the staging URL if provided
```

**Step 2: Navigate to the relevant page**
- Go to the page that shows the implemented feature
- If auth is required, log in using the test credentials from context.md
- For the live app: use `ehousing.joinlita.com` with the test user
- OTP: use `123456` (backend fallback when DB lookup misses)

**Step 3: Exercise the golden path**
- Perform the exact user action the feature enables
- Verify the UI response matches the expected behavior
- Check network tab: confirm the right API endpoints were called with correct payloads and returned 2xx

**Step 4: Check console**
```javascript
// mcp__Claude_Preview__preview_console_logs or mcp__Claude_in_Chrome__read_console_messages
// Zero unhandled errors is required. Warn-level messages must be understood.
```

**Step 5: Screenshot**
```javascript
// mcp__Claude_Preview__preview_screenshot or mcp__Claude_in_Chrome__computer
// Save to .ai/<PROJECT>/<LETTER>/logs/phase-6-golden-path.png
```

**Step 6: Exercise at least one edge case**
Choose the most relevant:
- Submit the form with invalid input → verify validation error appears, no crash
- Access the feature as a user without permission → verify 403/redirect, not 500
- Empty state (no data) → verify placeholder renders, not a blank screen or JS error
- Boundary value (0, max limit, very long string) → verify graceful handling

**Step 7: Fix anything that looks wrong**
If a console error appears, a layout breaks, or an edge case crashes:
1. Read the relevant source file
2. Fix the issue
3. Reload and re-screenshot
4. Re-run targeted validation

**Write `logs/phase-6.result.md`:**
```
Status: DONE|SKIPPED|BLOCKED
URL tested: <url>
Golden path: <PASS + screenshot path | FAIL + description>
Console errors: <none | list>
Edge case tested: <description + PASS/FAIL>
Issues fixed: <list if any>
Skip reason: <only if skipped>
```

Flip `- [ ] Browser test` to `- [x] Browser test (screenshot: logs/phase-6-golden-path.png)` in plan.md.

---

## Phase 7: Code Review Loop

Run up to 3 iterations. Start with `R = 1`.

```
LOOP:
  Run Phase 7a (review) for iteration R
  Read review<R>.md verdict:
    APPROVED → FINISH
    NEEDS_CHANGES → run Phase 7b (fix) → R += 1 → if R ≤ 3: loop else FINISH

FINISH:
  Flip "- [ ] Code review" to "- [x] Code review" in plan.md
```

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
3. .ai/<PROJECT>/<LETTER>/plan.md
4. If R > 1: .ai/<PROJECT>/<LETTER>/review<R-1>.md (understand what was already fixed)
5. Run `git diff HEAD` to see ALL uncommitted changes — read the full diff
6. Read the full content of every source file that has changes — not just the diff hunks, the full file in context

═══════════════════════════════════════════════════
REVIEW CHECKLIST (in priority order — stop at NEEDS_CHANGES for any P0 finding)
═══════════════════════════════════════════════════

P0 — CORRECTNESS AND SECURITY (any finding here = NEEDS_CHANGES):
- [ ] Logic error that would produce wrong results or data corruption
- [ ] Missing null/undefined check at API boundaries (unhandled None in Python, undefined in TS)
- [ ] Unhandled exception path that returns 500 instead of a meaningful error
- [ ] Missing auth guard on a new endpoint or new page
- [ ] SQL injection risk (raw string interpolation into queries)
- [ ] Exposed secret or credential in source
- [ ] Pydantic validation bypassed (raw dict access instead of schema validation)
- [ ] Race condition in async code

P1 — PERFORMANCE (any finding here = NEEDS_CHANGES):
- [ ] SQLAlchemy N+1: a relationship loaded inside a loop without joinedload/selectinload
- [ ] Missing DB index on a column that will be filtered or sorted in a new query
- [ ] Unbounded query (no LIMIT on a list endpoint that could return millions of rows)
- [ ] Expensive computation inside a hot render path

P2 — TYPE SAFETY:
- [ ] Bare `any` type in TypeScript
- [ ] `!` non-null assertion without a comment explaining the invariant
- [ ] Pydantic v1-style code (parse_obj, .dict(), @validator, class Config)
- [ ] Missing return type annotation on a public Python function

P3 — CODE QUALITY:
- [ ] Dead code (unreachable branches, unused imports, unused variables)
- [ ] Duplication of logic already in an existing utility
- [ ] Business logic in a route handler (should be in service layer)
- [ ] DB query in a React component (should be in a hook or API client)
- [ ] Presentation logic in a backend service
- [ ] Missing UI states: loading, error, empty — for any new async component

P4 — TEST COVERAGE:
- [ ] New endpoint with no pytest test
- [ ] New behavior with no test assertion
- [ ] Test that only tests the happy path when the feature has meaningful error cases

P5 — STYLE (only flag if it violates AGENTS.md or creates genuine confusion):
- [ ] Naming inconsistent with the rest of the codebase
- [ ] File placed in wrong directory (wrong layer/module)

═══════════════════════════════════════════════════
WRITE: .ai/<PROJECT>/<LETTER>/review<R>.md
═══════════════════════════════════════════════════

## Code Review — Iteration <R>

## Summary
<1-2 sentence honest assessment: is this production-ready or are there gaps?>

## Verdict: <APPROVED | NEEDS_CHANGES>

(Only write the following section if NEEDS_CHANGES:)
## Changes Required

### <Issue Title>
- Priority: <P0|P1|P2|P3|P4|P5>
- File: `<exact path>`, line ~<N>
- Problem: <what is wrong, precisely>
- Fix: <exactly what to change — be specific enough that the fix agent can implement it without guessing>

Rules:
- Only flag issues in code added or modified by this task — not pre-existing issues
- Every finding must have a concrete negative consequence if not fixed
- Do not request comments, docstrings, or speculative refactors
- Do not flag style preferences as P0/P1 — save those for P5 or drop them entirely
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
Implement every change listed under "Changes Required" in review<R>.md. Nothing more, nothing less.

Rules:
- Do not refactor adjacent code not mentioned in the review
- Do not change test behavior unless the review explicitly calls for it
- If a fix conflicts with a plan step, implement the fix — the review takes precedence for correctness

After all changes:
1. Run targeted validation (tests + typecheck for touched files)
2. If validation fails: diagnose and fix. Repeat once. Note in BLOCKER if still failing.
3. Confirm `git diff --stat` is non-empty
```

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
  Broad: <PASS | skipped — reason>

Browser test:
  URL: <url>
  Golden path: <PASS | FAIL>
  Edge case: <what was tested + PASS/FAIL>
  Screenshot: <path | skipped — reason>

Code review:
  Rounds: <N>
  Issues found and fixed: <list key fixes, or "none — first-pass approval">
  Final verdict: APPROVED

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
