# Phase Prompts

Templates for Claude subagent messages. Replace `<TASK>`, `<PROJECT>`, `<LETTER>`, `<PREV_LETTER>`, and `<REPO_ROOT>`.

## Orchestration Rules

**Phase 0 always runs.** Create the `.ai/` folder structure before any code changes, regardless of task complexity.

**Route by complexity first (see SKILL.md Task Routing section):**
- Quick tasks: Phase 0 → implement in main session → write minimal `about.md` + `context.md` → validate. Skip Phases 1-3 subagents.
- Standard tasks: run Phases 0, 1, 2+3 (merged), 4, 5, 6, 7.
- Large tasks: run all phases including separate Phase 3 assessment.

**Parallelization (speed-critical):**
- After Phase 1 context is written, scan the plan for Phase 4 units with fully disjoint write sets. Spawn those concurrently — do not serialize unnecessarily.
- Backend-only and frontend-only phases with no shared files are always safe to parallelize.
- Never parallelize phases that share models, schemas, or API client files.

**Per-phase rules:**
- Phase 0 runs in the main session.
- Phases 1, 2 (or merged 2+3), each Phase 4 unit, and each Phase 7 pass run in fresh subagents.
- Phase 5 (validate) and Phase 6 (browser test) run in the main session.
- Write the full prompt to `logs/phase-<name>.prompt.md` before spawning.
- After each phase completes, write `logs/phase-<name>.result.md` with: status, files touched, follow-up notes.
- Use `pass file paths explicitly` by default. Only enable if the phase depends on thread-only context.
- Prefer `codex full-context mode` for writing phases; `Explore` only for narrow read-only lookups.
- Request `model: o3` with maximum reasoning effort for delegated phases.
- Default wait budget: 5 minutes per check. Switch to 1-2 minutes when the phase is clearly finishing.
- On timeout: inspect the expected artifact mtime and the progress file. If either moved, wait again.
- If neither moved after two full waits and one follow-up, close and spawn fresh.
- Never use shell-spawned background processes as a substitute for subagents.

## Standard Progress File Contract

Append verbatim to every delegated phase prompt:

```text
Before deep work, create or update the matching progress file in `.ai/<PROJECT>/<LETTER>/logs/`.

Use `<phase-name>.progress.md` as a concise heartbeat:
- `Heartbeat: <N>` on the first line, incremented on each meaningful update
- Current step
- Files being read or edited
- Concrete findings or decisions so far
- Blocker or next checkpoint

Update sparingly — at natural milestones or after a quiet stretch of roughly 5-10 minutes.
Keep it tiny so the parent can rely on mtime or the counter instead of rereading it.
Do not wait until the final artifact to write progress.
```

## Standard Compact Reply Block

Append verbatim to every delegated phase prompt:

```text
Before replying, write all required artifacts to disk.

Reply in 8 lines or fewer using exactly these keys:
STATUS: <DONE|BLOCKED|APPROVED|NEEDS_CHANGES>
ARTIFACTS: <paths>
TOUCHED: <repo paths or none>
BLOCKER: <none or one short line>

Do not restate the full context, plan, diff, or reasoning in the chat reply.
```

## Artifact Completion Checks

- Phase 1 complete: `about.md` and `context.md` both exist and are non-empty.
- Phase 2 complete: `plan.md` exists, has a `## Status` section and `Phases: <N>`, no source files modified.
- Phase 3 complete (if run): `plan.md` has `Assessed: yes`.
- Phase 4 complete: checkbox flipped to checked AND `git diff --stat` shows actual file changes matching the owned write set. If the diff is empty, the phase failed even if the agent claimed done.
- Phase 5 complete: validation outcome recorded, build/test checkbox updated.
- Phase 6 complete: browser screenshot captured and documented (or explicitly skipped with reason).
- Phase 7a complete: `review<R>.md` exists with a verdict line.
- Phase 7b complete: review fixes applied, post-fix validation passes.

---

## Phase 0: Setup

**This phase is mandatory for every task, regardless of path (Quick/Standard/Large).**

Record the current time as `$START_TIME`. You will display elapsed time at the end.

Determine whether this is a new project or a follow-up task:

1. Extract the first token from the task description. Call it `FIRST_TOKEN`.
2. Check `.ai/` for existing project folders (create `.ai/` itself if it does not exist).
3. If `.ai/<FIRST_TOKEN>/about.md` exists → follow-up task. Project = `FIRST_TOKEN`. Task = everything after it.
4. Otherwise → new project. Full input is the task description.

For new projects:
- Pick a unique short kebab-case name (1-2 words) that doesn't collide with existing `.ai/` folders.
- Create `.ai/<PROJECT>/`, `.ai/<PROJECT>/a/`, `.ai/<PROJECT>/a/logs/`.
- Set `<LETTER>` = `a`.

For follow-up tasks:
- Scan `.ai/<PROJECT>/` for existing task folders. Find the highest letter used.
- New letter = next in sequence.
- Create `.ai/<PROJECT>/<LETTER>/` and `.ai/<PROJECT>/<LETTER>/logs/`.

After Phase 0 directories are created, proceed based on task path:
- **Quick Path**: Implement in main session, then write `about.md` + `<LETTER>/context.md` with a brief summary of what was done and which files were touched. This is required so future follow-up tasks can reference this work.
- **Standard/Large Path**: Proceed to Phase 1 (or Phase 1F for follow-ups).

---

## Phase 1: Context (New Project, letter = `a`)

```text
You are a context-gathering agent for a FastAPI + Next.js codebase.

TASK: <TASK>
REPO ROOT: <REPO_ROOT>

YOUR JOB: Read AGENTS.md, explore the codebase, find everything relevant to this task, and write two documents. Do not implement any code.

Steps:
1. Read AGENTS.md. Note the validation commands, build steps, package manager, and all policies.
2. Understand the repo layout:
   - Backend: Python/FastAPI under `backend/` — routers, schemas (Pydantic), models (SQLAlchemy), services, Alembic migrations, pytest tests
   - Frontend: Next.js/TypeScript under `frontend/` — pages/app router, components, hooks, API client, types
   - Shared config: root-level files, .env patterns, docker-compose if present
3. Search for all files, modules, functions, types, and patterns directly related to the task.
4. Read all relevant files thoroughly. Prefer reading more over less.
5. For each relevant file, record:
   - File path and relevant line ranges
   - What the code does and how it relates to the task
   - Key types, interfaces, function signatures, and data shapes
   - How data flows end-to-end (API route → service → DB → response; page → component → hook → API call)
6. Find analogous features already implemented that can serve as a reference implementation.
7. Note the relevant test files and test patterns so the implementation agent can write matching tests.
8. If the task involves a database model: note the SQLAlchemy model, Alembic migration patterns, and seeding approach.
9. If the task involves a UI change: note component structure, shared hooks, styling approach, design tokens, and any existing component library usage.
10. If the task requires a new API endpoint: note how existing endpoints are structured (router, schema, service layer, auth guard, error handling).
11. Note any auth/permission patterns that apply to this task.
12. Note environment variables or external service integrations the task may touch.

Write two files.

File 1: .ai/<PROJECT>/about.md

Written as if the project is already fully implemented. Exists for future follow-up tasks — no downstream phase in this task should rely on it.

Include:
- Project: What this project does (feature, goals, scope)
- Architecture: Which backend and frontend modules are involved, how they interact
- Key Design Decisions: Important choices about data model, API shape, component structure
- Relevant Codebase Areas: Specific directories, files, types, and APIs involved

Do not include temporal language: no "Current State", "Pending", "TODO", "not yet", "will be".

File 2: .ai/<PROJECT>/a/context.md

The primary working document for all downstream phases. Must be completely self-contained. Include:
- Task Description: Full task restated clearly
- Stack Summary: Backend (FastAPI/Python), Frontend (Next.js/TypeScript), DB (SQLAlchemy + Alembic), test runner (pytest / Jest)
- Relevant Files: Every path with line ranges and descriptions
- Data Flow: How data moves end-to-end for this feature
- Key Types and Interfaces: TypeScript types, Pydantic schemas, SQLAlchemy models
- API Contract: Endpoint paths, methods, request/response shapes (existing or to-create)
- Component Structure: Frontend components, hooks, and their relationships
- Auth/Permission Pattern: How auth is enforced for relevant routes and pages
- Test Patterns: How tests are written for similar features (file paths, patterns, fixtures)
- Validation Commands: Exact commands from AGENTS.md to run after implementation
- Reference Implementations: Most similar existing feature with file paths

Be exhaustive. Another agent with no context will implement from this file alone.

Do not implement any code in this phase.
```

---

## Phase 1F: Context (Follow-up Task)

```text
You are a context-gathering agent for a follow-up task on an existing project.

NEW TASK: <TASK>
REPO ROOT: <REPO_ROOT>
PROJECT: <PROJECT>
PREVIOUS TASK LETTER: <PREV_LETTER>

YOUR JOB: Read the existing project state, gather additional context for the new task, and produce fresh documents. Do not implement any code.

Steps:
1. Read AGENTS.md.
2. Read .ai/<PROJECT>/about.md — the project-level blueprint.
3. Read .ai/<PROJECT>/<PREV_LETTER>/context.md — the previous task's context.
4. Read the actual source files referenced there to understand what was implemented.
5. Based on the new task, search for any additional files, types, and patterns not already covered.
6. Read all newly relevant files thoroughly.

Write two files.

File 1: .ai/<PROJECT>/about.md (full rewrite)

Rewrite as a single coherent document describing the project with this new task fully included, as if it were always there. No history of changes between tasks. No temporal language. Incorporate everything still accurate from the old about.md plus the new task's additions.

File 2: .ai/<PROJECT>/<LETTER>/context.md

Self-contained context for this task. Include everything in Phase 1's context.md list, plus:
- What was already implemented (briefly, with file paths) so the agent understands the delta
- What specifically needs to change or be added for this new task
- Any regressions to watch for given what was previously implemented

Do not implement any code in this phase.
```

---

## Phase 2+3 (Merged): Plan + Self-Assessment (Standard Path)

For standard tasks, run this single agent instead of separate Phase 2 and Phase 3:

```text
You are a planning agent for a FastAPI + Next.js codebase. You will produce a plan AND self-assess it in one pass — no separate assessor will run.

Read:
- AGENTS.md
- .ai/<PROJECT>/<LETTER>/context.md
- Every source file you will modify (read them NOW before writing the plan)

Create .ai/<PROJECT>/<LETTER>/plan.md following the Phase 2 structure below, then immediately apply the Phase 3 assessment criteria to your own plan and fix any issues before writing the final version.

Self-assessment checklist (apply before finalizing):
- [ ] Every file path, function name, and type name is verified against the actual codebase
- [ ] Auth guard added to any new endpoint
- [ ] Loading state, error state, and empty state handled in any new UI
- [ ] Alembic migration step included if any SQLAlchemy model changes
- [ ] Tests planned for every new behavior (pytest for backend, Jest for frontend)
- [ ] No business logic in route handlers; no DB queries in components
- [ ] Phases are ≤8-10 steps each; backend before frontend
- [ ] Parallel phases identified: mark any phases with fully disjoint write sets as `[PARALLEL-SAFE]`

Add `Phases: <N>` and `Assessed: yes` to the Status section.
```

---

## Phase 2: Plan (Large Path Only)

```text
You are a planning agent for a FastAPI + Next.js codebase.

Read these files:
- AGENTS.md
- .ai/<PROJECT>/<LETTER>/context.md
- Then read the source files referenced in context.md that you will be modifying.

Create a detailed plan in: .ai/<PROJECT>/<LETTER>/plan.md

Structure:

## Task
<one-line summary>

## Approach
<high-level strategy: what changes, why this approach, key tradeoffs>

## Files to Modify
<list with one-line descriptions of what changes in each>

## Files to Create
<list with one-line descriptions, if any>

## Implementation Steps

Number every step. Be specific: exact file, exact function or component, what code to add/change/remove, where.

Group into phases when there are more than ~8 steps. Each phase must be executable by a single agent in one session with a disjoint write set from other phases. Sequence correctly: DB model → Alembic migration → backend service → API router → frontend API client → component → page.

If the task adds or changes a SQLAlchemy model, the plan MUST include a dedicated step to generate and apply the Alembic migration: `alembic revision --autogenerate -m "<description>"` followed by `alembic upgrade head`. This is a hard requirement — never assume the migration is optional or implicit.

### Phase 1: <name>
1. <specific step with file path and function name>
2. ...

### Phase 2: <name>
1. ...

## Tests to Write or Update
<specific test files and what they should cover — include both backend pytest and frontend Jest where applicable>

## Validation
- Targeted backend: <exact pytest command from AGENTS.md>
- Targeted frontend: <exact npm test command from AGENTS.md>
- Broad (if needed): bash validate.sh
- Expected outcome

## Status
- [ ] Phase 1: <name>
- [ ] Phase 2: <name> (if applicable)
- [ ] Validation
- [ ] Browser test (if UI)
- [ ] Code review

Do not implement any code in this phase.
```

---

## Phase 3: Plan Assessment

```text
You are a plan assessment agent.

Read:
- AGENTS.md
- .ai/<PROJECT>/<LETTER>/context.md
- .ai/<PROJECT>/<LETTER>/plan.md
- The actual source files referenced in both documents

Assess on these axes:

1. **Correctness**: Are file paths, function names, type names accurate and real in the codebase? Do Pydantic schemas match what FastAPI expects? Do TypeScript types align with the API contract?
2. **Completeness**: Missing steps? Unhandled edge cases? Missing error handling at API or DB boundaries? Missing auth guard on new endpoint? Missing loading/error states in the UI?
3. **Test coverage**: Are tests planned for the new behavior? Are existing tests likely to break and does the plan address that?
4. **Code quality**: Does the plan follow patterns from AGENTS.md and analogous existing code? Minimize duplication. No business logic in route handlers. No DB queries in components.
5. **Phase sizing**: Each phase should be 8-10 substantive code changes max. Split larger phases. Merge trivially small ones.
6. **Sequencing**: Backend changes must land before the frontend consumes them. Schema/migration before service. Service before router. API client before component.

Update plan.md in-place:
- Fix inaccuracies
- Add missing steps
- Improve approach if you found better patterns
- Rebalance phases if needed
- Add `Phases: <N>` at the top of the Status section
- Add `Assessed: yes` at the bottom of the file

Do not implement any code in this phase.
```

---

## Phase 4: Implementation

**Parallelization first:** Before spawning any agent, scan the plan for phases marked `[PARALLEL-SAFE]` or with fully disjoint write sets. Spawn those concurrently in a single message. Sequential is the fallback, not the default.

One subagent per plan phase.

For each unfinished phase in the plan:

```text
You are an implementation agent working on Phase <N> of an implementation plan.

Read first:
- AGENTS.md
- .ai/<PROJECT>/<LETTER>/context.md
- .ai/<PROJECT>/<LETTER>/plan.md

Then read each source file you will modify before touching it.

Your owned write set for this phase:
<OWNED_WRITE_SET>

YOUR TASK: Implement only Phase <N>:
<paste the specific phase steps here>

Rules:
- Follow the plan precisely. If you discover the plan is wrong, note it in your reply but implement the closest correct thing.
- Follow AGENTS.md conventions: naming, file structure, test patterns, validation commands.
- Follow existing repo patterns: Pydantic v2 if that's what's used, SQLAlchemy patterns from existing models, Next.js app/pages router pattern that's already in use, component patterns from similar components.
- Do not touch files outside your owned write set unless it's a trivially coupled import fix.
- Do not modify .ai/ files except to update the Status checkbox in plan.md when done.
- Write or update tests as the plan specifies.
- When done: flip `- [ ] Phase <N>:` to `- [x] Phase <N>:` in plan.md.

Report: what you did, which files you changed, any deviations from the plan, and any issues.
```

After each implementation phase in the main session:
1. Check the plan.md status line flipped correctly.
2. Run `git diff --stat` — verify actual file changes exist and match the owned write set. **An empty diff means the phase failed regardless of what the agent reported. Re-spawn immediately with a note that the agent must make actual file changes.**
3. If parallel phases were spawned, wait for all before proceeding.
4. Proceed to the next phase or validation.

---

## Phase 5: Validation

Run in the main session. Do not delegate.

```text
Implementation complete. Run validation now.

1. Read AGENTS.md for the exact validation commands.
2. Run targeted tests first — tests covering the specific files or features changed.
3. Run targeted typecheck/lint for the touched area (backend or frontend).
4. If targeted checks pass, run broad validation only if the task risk level warrants it.

Validation command reference (from AGENTS.md):
- Backend targeted: backend/.venv/Scripts/python.exe -m pytest <specific test file> -v  (or equivalent Unix path)
- Frontend targeted: npm test -- --runInBand <pattern>
- Broad: bash validate.sh  (or powershell -ExecutionPolicy Bypass -File .\validate.ps1 on Windows)

If validation fails:
1. Read the error carefully.
2. Diagnose whether it's caused by the current change or a pre-existing issue.
3. Fix if caused by this change, then rerun.
4. Repeat once. If still failing, report the full error and stop.

When done, update plan.md: flip `- [ ] Validation` to `- [x] Validation`.

Report: which commands ran, outcome, which files were fixed if any.
```

---

## Phase 6: Browser Test

Run in the main session using MCP browser/preview tools. Skip only for purely backend, CLI, or non-visual tasks.

Steps:
1. **Ensure the dev server is running.** Check `mcp__Claude_Preview__preview_list` first. If not running, start it: `cd frontend && npm run dev` (verify the exact command and port in `frontend/package.json` → `"scripts"."dev"`; typically `http://localhost:3000`). If a staging or preview URL was provided by the user, use that instead.
2. Use `mcp__Claude_Preview__preview_start` or `mcp__Claude_in_Chrome__navigate` to open the relevant page.
2. Exercise the feature you just implemented — click through the golden path.
3. Check for console errors: `mcp__Claude_Preview__preview_console_logs` or `mcp__Claude_in_Chrome__read_console_messages`.
4. Capture a screenshot: `mcp__Claude_Preview__preview_screenshot` or `mcp__Claude_in_Chrome__computer`.
5. Test at least one edge case (empty state, validation error, boundary value, unauthenticated access).
6. If anything looks wrong, fix it and revalidate before proceeding.

Save the screenshot path in `logs/phase-6-browser.result.md` along with what was tested and what was found.

Update plan.md: flip `- [ ] Browser test` to `- [x] Browser test (screenshot: <path>)`.

---

## Phase 7: Code Review Loop

After validation and browser test pass, run up to 3 review-fix iterations. Start with `R = 1`.

```text
LOOP:
  1. Run Phase 7a (review) for iteration R.
  2. Read review<R>.md verdict:
     - APPROVED → go to FINISH
     - NEEDS_CHANGES → run Phase 7b (fix)
  3. After fix and validation pass:
     R = R + 1
     If R > 3 → go to FINISH
     Else → step 1

FINISH:
  - Flip `- [ ] Code review` to `- [x] Code review` in plan.md
  - Proceed to Completion
```

### Phase 7a: Code Review

```text
You are a code review agent for a FastAPI + Next.js codebase.

Read:
- AGENTS.md
- .ai/<PROJECT>/<LETTER>/context.md
- .ai/<PROJECT>/<LETTER>/plan.md
- If R > 1: .ai/<PROJECT>/<LETTER>/review<R-1>.md

Run `git diff` to see the current uncommitted changes.
Read the modified source files in full to understand changes in context.

Review in this priority order:

1. **Correctness and safety**: Logic errors, missing null/undefined checks at API boundaries, unhandled promise rejections, missing auth guards on new endpoints or pages, SQL injection risks, exposed secrets, Pydantic validation bypassed.
2. **SQLAlchemy N+1 queries**: Any new code that loads a relationship inside a loop without eager loading (`joinedload`/`selectinload`). This is the most common perf bug in FastAPI + SQLAlchemy codebases.
3. **Pydantic v2 correctness**: `model_validate` not `parse_obj`, `model_dump` not `dict()`, validators use `@field_validator` not `@validator`, `ConfigDict` not `class Config`. Flag any v1-style usage.
4. **TypeScript strict mode**: No bare `any` types. No `!` non-null assertions without justification. No implicit `any` from missing type annotations on function parameters.
5. **Dead code**: Added or leftover code that is never reachable or used.
6. **Redundant changes**: Diff hunks with no functional effect.
7. **Duplication**: Repeated logic that should be extracted or reused from existing utilities.
8. **Wrong placement**: Business logic in a route handler, DB query in a component, presentation logic in a service.
9. **Missing states**: New UI with no loading state, no error state, or no empty state handling.
10. **Test gaps**: New behavior with no test coverage. New API endpoint with no pytest test.
11. **Style**: Consistency with AGENTS.md and the surrounding code style.

Guidelines:
- Review only changes in scope for this task, not pre-existing code.
- Be pragmatic — each comment needs a concrete benefit.
- Do not suggest comments, docstrings, or speculative future-proofing.

Write to: .ai/<PROJECT>/<LETTER>/review<R>.md

## Code Review - Iteration <R>

## Summary
<1-2 sentence overall assessment>

## Verdict: <APPROVED or NEEDS_CHANGES>

If NEEDS_CHANGES, add:

## Changes Required

### <Issue title>
- Category: <correctness | dead code | duplication | wrong placement | type safety | test gap | style>
- File(s): <paths>
- Problem: <what's wrong>
- Fix: <what to change>

Keep the list focused. Prioritize impactful issues over nitpicks.
```

### Phase 7b: Review Fix

```text
You are a review fix agent for a FastAPI + Next.js codebase.

Read:
- AGENTS.md
- .ai/<PROJECT>/<LETTER>/context.md
- .ai/<PROJECT>/<LETTER>/plan.md
- .ai/<PROJECT>/<LETTER>/review<R>.md

Read the source files mentioned in the review.

YOUR TASK: Implement all changes listed in review<R>.md.

Rules:
- Implement exactly the review changes — nothing more, nothing less.
- Follow AGENTS.md conventions.
- Do not modify .ai/ files except where the review loop requires it.

After all changes:
1. Run targeted validation (tests + typecheck for touched files, using AGENTS.md commands).
2. If validation fails, fix and rerun once.
3. Report what changed, which files you touched, and the validation outcome.
```

---

## Completion

When all phases including validation, browser test, and code review are done:

1. Read `plan.md` and summarize for the user:
   - What was implemented (feature description)
   - Files modified or created
   - Validation outcome (tests passing, no type errors)
   - Browser test result (screenshot path if applicable)
   - Code review: how many rounds, what was found/fixed, or first-pass approval
2. Calculate and display total elapsed time since `$START_TIME` (`Xh Ym Zs`, omitting zero components).
3. Remind the user of the project name for follow-up tasks.

---

## Error Handling

- Phase timeout: check artifact mtime and progress file. Wait again if either moved. Send one nudge. Spawn fresh after two stuck waits.
- Malformed `context.md`/`plan.md`: rerun that phase in a fresh subagent with more specific instructions.
- Persistent validation failures after the phase's fix attempts: report with the full error output.
- Review-fix introduces new failures it cannot resolve: report to the user.
- For phases 1-3 and 7: do not fall back to main-session execution after delegated retries fail — ask the user instead.

---

## Prompt Delivery and Logs

For each phase:
1. Write full prompt to `.ai/<PROJECT>/<LETTER>/logs/phase-<name>.prompt.md`.
2. Delegate (or execute in main session for Phase 0, 5, 6).
3. For delegated phases: expect `phase-<name>.progress.md` heartbeats while in flight.
4. Write `phase-<name>.result.md` with: status, artifacts, files touched, follow-up notes.

Review iteration naming:
- `phase-7a-review-1.prompt.md`, `phase-7a-review-1.result.md`
- `phase-7b-fix-1.prompt.md`, `phase-7b-fix-1.result.md`
