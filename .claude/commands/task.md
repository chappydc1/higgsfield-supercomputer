---
description: Implement a feature or fix using multi-agent workflow with fresh context at each phase
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, TodoWrite
---

# Task - Multi-Agent Implementation Workflow

You orchestrate a multi-phase implementation workflow using fresh agent spawns to work within context window limits.

**Arguments:** `$ARGUMENTS` = "$ARGUMENTS"

If `$ARGUMENTS` is provided, it's the task description. If empty, ask the user what they want implemented.

## Overview

The workflow is organized around **projects**. Each project lives in `.ai/<project-name>/` and can contain multiple sequential **tasks** (labeled `a`, `b`, `c`, ... `z`).

```
.ai/<project-name>/
  about.md              # Project-level blueprint — always describes completed state
  a/                    # First task
    context.md          # Gathered codebase context for this task
    plan.md             # Implementation plan
    review1.md          # Code review documents (up to 3)
    review2.md
    review3.md
  b/                    # Follow-up task
    context.md
    plan.md
    review1.md
```

- `about.md` is the project-level blueprint — written as if everything is already fully implemented. No temporal state ("current state", "pending changes", "not yet implemented"). Rewritten (not appended) each new task.
- Each task folder's `context.md` is the primary document for all downstream agents — self-contained, includes everything needed.

## Phase 0: Setup

**Record the current time now** and store it as `$START_TIME`.

⚠️ **CRITICAL: Follow-up detection MUST happen FIRST.**

### Step 0a: Follow-up detection

Extract the first word/token from `$ARGUMENTS`. Call it `FIRST_TOKEN`.

Run these TWO commands in parallel:
1. `ls .ai/` — see all existing project names
2. `ls .ai/<FIRST_TOKEN>/about.md` — check if this project exists

**Evaluate:**
- Command 2 **succeeds**: follow-up task. Project = `FIRST_TOKEN`. Task = rest of `$ARGUMENTS`.
- Command 2 **fails**: new project. Full `$ARGUMENTS` is the task description.

### Step 0b: Project setup

**New project:**
- Pick a unique short name (1-2 lowercase words, hyphen-separated) that doesn't collide with existing `.ai/` folders.
- Create `.ai/<project-name>/` and `.ai/<project-name>/a/`.
- Task letter = `a`.

**Follow-up task:**
- Scan `.ai/<project-name>/` for existing task folders. Find the latest letter.
- New letter = next in sequence.
- Create `.ai/<project-name>/<new-letter>/`.

Proceed to Phase 1 in both cases. Follow-up tasks use Phase 1F.

## Task Routing (Do This in Phase 0 Before Spawning Anything)

Assess complexity before running any phases:

- **Quick** (≤5 steps, 1-3 files, no new endpoints or DB models): implement directly in the main session — skip Phases 1-3. Target: under 5 minutes.
- **Standard** (5-15 steps, up to ~8 files): run Phase 1 + merged Phase 2+3, then Phase 4 onward. Target: under 30 minutes.
- **Large** (15+ steps, new DB models, many files): full flow. Target: 30-90 minutes.

**Default to Quick or Standard. Never spawn 3 planning agents for a bug fix.**

---

## Progress Heartbeat

For every delegated phase, append this to the spawned agent prompt:

```
Before starting deep work, write `.ai/<project-name>/<letter>/logs/<phase-name>.progress.md`:
- Line 1: `Heartbeat: 1`
- Current step, files being read/edited, concrete findings so far, next checkpoint
Update it at natural milestones. Keep it tiny — the parent reads mtime, not content.
```

After spawning, check the progress file every 5 minutes. If neither it nor the expected artifact has moved after two checks and one nudge, close and respawn.

---

## Phase 1: Context Gathering

### New Projects (letter = `a`)

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`) with this prompt:

```
You are a context-gathering agent for a FastAPI + Next.js codebase.

TASK: <paste the task description here>
REPO ROOT: <repo root path>

YOUR JOB: Read AGENTS.md, inspect the codebase, find all files and code relevant to this task, and write two documents. Do not implement any code.

Steps:
1. Read AGENTS.md for project conventions, validation commands, and build steps.
2. Understand the repo layout:
   - Backend: Python/FastAPI under `backend/` — routers, Pydantic schemas, SQLAlchemy models, services, Alembic migrations, pytest tests
   - Frontend: Next.js/TypeScript under `frontend/` — pages/app router, components, hooks, API client, types
   - Shared config: root-level files, .env patterns
3. Search for all files, modules, functions, types, and patterns related to the task.
4. Read all relevant files thoroughly. Prefer reading more over less.
5. For each relevant file, note:
   - File path and relevant line ranges
   - What the code does and how it relates to the task
   - Key types, interfaces, function signatures, data shapes
   - Data flow: API route → service → DB → response; page → component → hook → API call
6. Find analogous features already implemented that can serve as reference implementations.
7. Note relevant test files and test patterns so the implementation agent can write matching tests.
8. If the task involves a DB model: note the SQLAlchemy model, Alembic migration patterns, seeding.
9. If the task involves UI: note component structure, shared hooks, styling approach, component library usage.
10. If the task requires a new API endpoint: note how existing endpoints are structured (router, schema, service, auth guard, error handling).
11. Note auth/permission patterns that apply to this task.
12. Note any environment variables or external service integrations the task may touch.

Write TWO files:

### File 1: .ai/<project-name>/about.md

Written as if the project is fully implemented. For future follow-up tasks — no downstream phase in this task relies on it.

Include:
- Project: What this project does (feature, goals, scope)
- Architecture: Which backend and frontend modules are involved, how they interact
- Key Design Decisions: Important choices about data model, API shape, component structure
- Relevant Codebase Areas: Specific directories, files, types, APIs involved

No temporal language: no "Current State", "Pending", "TODO", "not yet", "will be".

### File 2: .ai/<project-name>/a/context.md

The primary working document. All downstream agents read ONLY this file. Must be completely self-contained. Include:
- Task Description: Full task restated clearly
- Stack: FastAPI/Python backend, Next.js/TypeScript frontend, SQLAlchemy + Alembic, pytest + Jest
- Relevant Files: Every path with line ranges and descriptions
- Data Flow: End-to-end for this feature
- Key Types and Interfaces: TypeScript types, Pydantic schemas, SQLAlchemy models
- API Contract: Endpoint paths, methods, request/response shapes
- Component Structure: Frontend components, hooks, relationships
- Auth/Permission Pattern: How auth is enforced for relevant routes and pages
- Test Patterns: How tests are written for similar features (file paths, patterns, fixtures)
- Validation Commands: Exact commands from AGENTS.md
- Reference Implementations: Most similar existing feature with file paths

Be exhaustive. Another agent with no context will implement from this file alone.
```

After this agent completes, verify both `about.md` and `a/context.md` exist and are non-empty.

### Follow-up Tasks (letter = `b`, `c`, ...)

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`) with this prompt:

```
You are a context-gathering agent for a follow-up task on an existing project.

NEW TASK: <paste follow-up task description>
REPO ROOT: <repo root path>
PROJECT: <project-name>
PREVIOUS TASK LETTER: <prev-letter>

YOUR JOB: Read the existing project state, gather additional context for the new task, and produce fresh documents. Do not implement any code.

Steps:
1. Read AGENTS.md.
2. Read .ai/<project-name>/about.md — the project-level blueprint.
3. Read .ai/<project-name>/<prev-letter>/context.md — the previous task's context.
4. Read the actual source files referenced there to understand what was implemented.
5. Based on the new task, search for any additional files, types, and patterns not already covered.
6. Read all newly relevant files thoroughly.

Write TWO files:

### File 1: .ai/<project-name>/about.md (REWRITE)

Rewrite as a single coherent document describing the project with this new task fully included, as if it were always there. No temporal language. Incorporate everything still accurate from the old about.md plus the new task's additions.

### File 2: .ai/<project-name>/<new-letter>/context.md

Self-contained for this task. Include everything in Phase 1's context.md list, plus:
- What was already implemented (briefly, with file paths)
- What specifically needs to change or be added for this new task
- Any regressions to watch for given what was previously implemented

Be exhaustive. Another agent with no prior context will implement from this file alone.
```

After this agent completes, verify both files exist and are non-empty.

## Phase 2: Planning

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are a planning agent for a FastAPI + Next.js codebase.

Read these files:
- AGENTS.md
- .ai/<project-name>/<letter>/context.md
- Then read the source files referenced in context.md that you will modify.

Create a detailed plan in: .ai/<project-name>/<letter>/plan.md

Structure:

## Task
<one-line summary>

## Approach
<high-level strategy: what changes, why this approach, key tradeoffs>

## Files to Modify
<list with one-line descriptions>

## Files to Create
<list with one-line descriptions, if any>

## Implementation Steps

Number every step. Be specific: exact file, exact function or component, what code to add/change/remove, where.

Group into phases if >8 steps. Each phase must be executable by a single agent in one session with a disjoint write set. Sequence correctly: DB model → Alembic migration → backend service → router → frontend API client → component → page.

If the task adds or changes a SQLAlchemy model, the plan MUST include a step to generate and apply the Alembic migration: `alembic revision --autogenerate -m "<description>"` followed by `alembic upgrade head`. Include this as a dedicated step, not a footnote.

### Phase 1: <name>
1. <specific step with file path and function name>

### Phase 2: <name>
1. ...

## Tests to Write or Update
<specific test files and what they should cover — backend pytest and frontend Jest>

## Validation
- Targeted backend: <exact pytest command from AGENTS.md>
- Targeted frontend: <exact npm test command from AGENTS.md>
- Broad (if needed): bash validate.sh

## Status
- [ ] Phase 1: <name>
- [ ] Phase 2: <name> (if applicable)
- [ ] Validation
- [ ] Browser test (if UI)
- [ ] Code review

Do not implement any code in this phase.
```

After this agent completes, verify `plan.md` exists and has a Status section.

## Phase 3: Plan Assessment

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are a plan assessment agent.

Read:
- AGENTS.md
- .ai/<project-name>/<letter>/context.md
- .ai/<project-name>/<letter>/plan.md
- The actual source files referenced in both

Assess on these axes:
1. Correctness: Are file paths, function names, type names real in the codebase? Do Pydantic schemas match FastAPI expectations? Do TypeScript types align with the API contract?
2. Completeness: Missing steps? Unhandled edge cases? Missing auth guard on new endpoint? Missing loading/error states in UI?
3. Test coverage: Tests planned for new behavior? Existing tests likely to break?
4. Code quality: Follows AGENTS.md patterns? No business logic in route handlers? No DB queries in components?
5. Phase sizing: Each phase ≤ 8-10 substantive changes. Split larger phases, merge trivially small ones.
6. Sequencing: Backend before frontend. Schema/migration before service. Service before router.

Update plan.md in-place:
- Fix inaccuracies
- Add missing steps
- Add `Phases: <N>` at the top of the Status section
- Add `Assessed: yes` at the bottom of the file

Do not implement any code in this phase.
```

After this agent completes, verify `plan.md` has `Phases:` and `Assessed: yes`.

## Phase 4: Implementation

Read `plan.md` yourself to understand the phases.

For each unfinished phase, spawn an implementation agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are an implementation agent working on Phase <N> of an implementation plan.

Read first:
- AGENTS.md
- .ai/<project-name>/<letter>/context.md
- .ai/<project-name>/<letter>/plan.md

Then read each source file you will modify before touching it.

Your owned write set for this phase:
<OWNED_WRITE_SET>

YOUR TASK: Implement only Phase <N>:
<paste the specific phase steps here>

Rules:
- Follow the plan precisely. If the plan is wrong, note it but implement the closest correct thing.
- Follow AGENTS.md conventions: naming, file structure, test patterns, validation commands.
- Follow existing repo patterns: Pydantic v2 if that's what's used, SQLAlchemy patterns from existing models, Next.js router pattern already in use.
- Do not touch files outside your owned write set (except trivially coupled import fixes).
- Do not modify .ai/ files except to update the Status checkbox in plan.md.
- Write or update tests as the plan specifies.
- When done: flip `- [ ] Phase <N>:` to `- [x] Phase <N>:` in plan.md.

Report: what you did, files changed, deviations from the plan, any issues.
```

After each implementation agent returns:
1. Check the plan.md status line flipped correctly.
2. `git diff --name-only` to verify touched files match the owned write set.
3. Proceed to the next phase or validation.

## Phase 5: Validation

Run in the main session. Do not delegate.

1. Read AGENTS.md for exact validation commands.
2. Run targeted tests first — tests covering the specific files or features changed.
3. Run targeted typecheck/lint for the touched area (backend or frontend).
4. Broaden only if the task risk level warrants it.

Validation command reference (from AGENTS.md):
- Backend targeted: `backend/.venv/Scripts/python.exe -m pytest <specific test file> -v` (or equivalent Unix)
- Frontend targeted: `npm test -- --runInBand <pattern>`
- Broad: `bash validate.sh` (or `powershell -ExecutionPolicy Bypass -File .\validate.ps1` on Windows)

If validation fails:
1. Diagnose whether it's caused by the current change or a pre-existing issue.
2. Fix and rerun once.
3. If still failing, report the full error and stop.

Update plan.md: flip `- [ ] Validation` to `- [x] Validation`.

## Phase 6: Browser Test

Run in the main session using MCP browser/preview tools. Skip for purely backend or non-visual tasks.

1. **Ensure the dev server is running.** Check if a preview URL is already available via `mcp__Claude_Preview__preview_list`. If not, start it:
   - Frontend (Next.js): `cd frontend && npm run dev` (typically serves on `http://localhost:3000`)
   - Check `frontend/package.json` → `"scripts"."dev"` for the exact command and port.
   - If the server is already running externally (e.g., a staging URL the user provided), use that.
2. Use `mcp__Claude_Preview__preview_start` or `mcp__Claude_in_Chrome__navigate` to open the relevant page.
3. Exercise the feature — click through the golden path.
4. Check console errors: `mcp__Claude_Preview__preview_console_logs` or `mcp__Claude_in_Chrome__read_console_messages`.
5. Capture a screenshot: `mcp__Claude_Preview__preview_screenshot` or `mcp__Claude_in_Chrome__computer`.
6. Test at least one edge case (empty state, validation error, boundary value, unauthenticated access).
7. Fix anything wrong, then revalidate.

Update plan.md: flip `- [ ] Browser test` to `- [x] Browser test (screenshot: <path>)`.

## Phase 7: Code Review Loop

After validation and browser test pass, run up to 3 review-fix iterations. Set `R = 1`.

```
LOOP:
  1. Spawn review agent (Step 7a) with iteration R.
  2. Read review<R>.md verdict:
     - APPROVED → go to FINISH
     - NEEDS_CHANGES → spawn fix agent (Step 7b)
  3. After fix agent completes and validation passes:
     R = R + 1
     If R > 3 → go to FINISH
     Otherwise → go to step 1

FINISH:
  - Update plan.md: flip `- [ ] Code review` to `- [x] Code review`
  - Proceed to Completion
```

### Step 7a: Code Review Agent

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are a code review agent for a FastAPI + Next.js codebase.

Read:
- AGENTS.md
- .ai/<project-name>/<letter>/context.md
- .ai/<project-name>/<letter>/plan.md
- If R > 1: .ai/<project-name>/<letter>/review<R-1>.md

Run `git diff` to see current uncommitted changes.
Read modified source files in full to understand changes in context.

Review in priority order:

1. Correctness and safety: Logic errors, missing null/undefined checks at API boundaries, unhandled promise rejections, missing auth guards, SQL injection risks, Pydantic validation bypassed.
2. SQLAlchemy N+1 queries: Any relationship loaded inside a loop without `joinedload`/`selectinload`. Flag it.
3. Pydantic v2 correctness: `model_validate` not `parse_obj`, `model_dump` not `dict()`, `@field_validator` not `@validator`, `ConfigDict` not `class Config`. Flag any v1-style usage.
4. TypeScript strict mode: No bare `any` types, no unjustified `!` non-null assertions.
5. Dead code: Added or leftover code that is never reachable or used.
6. Redundant changes: Diff hunks with no functional effect.
7. Duplication: Repeated logic that should be extracted or reused.
8. Wrong placement: Business logic in a route handler, DB query in a component, presentation logic in a service.
9. Missing UI states: No loading state, no error state, or no empty state on new UI.
10. Test gaps: New behavior or new API endpoint with no test.
11. Style: Consistency with AGENTS.md and surrounding code.

Guidelines:
- Review only changes in scope for this task.
- Be pragmatic — each finding needs a concrete benefit.
- Do not suggest comments, docstrings, or speculative future-proofing.

Write to: .ai/<project-name>/<letter>/review<R>.md

## Code Review - Iteration <R>

## Summary
<1-2 sentence overall assessment>

## Verdict: <APPROVED or NEEDS_CHANGES>

If NEEDS_CHANGES:

## Changes Required

### <Issue title>
- Category: <correctness | dead code | duplication | wrong placement | type safety | test gap | style>
- File(s): <paths>
- Problem: <what's wrong>
- Fix: <what to change>

Keep the list focused. Prioritize impactful issues.
```

### Step 7b: Review Fix Agent

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are a review fix agent for a FastAPI + Next.js codebase.

Read:
- AGENTS.md
- .ai/<project-name>/<letter>/context.md
- .ai/<project-name>/<letter>/plan.md
- .ai/<project-name>/<letter>/review<R>.md

Read the source files mentioned in the review.

YOUR TASK: Implement all changes listed in review<R>.md — nothing more, nothing less.

After all changes:
1. Run targeted validation (tests + typecheck for touched files, using AGENTS.md commands).
2. If validation fails, fix and rerun once.
3. Report what changed, files touched, and validation outcome.
```

## Completion

When all phases are done:
1. Read `plan.md` and summarize:
   - What was implemented
   - Files modified or created
   - Validation outcome (tests passing, no type errors)
   - Browser test result (screenshot path if applicable)
   - Code review: rounds, what was found/fixed, or first-pass approval
2. Calculate and display total elapsed time since `$START_TIME` (`Xh Ym Zs`, omitting zero components).
3. Remind the user of the project name: `/task <project-name> <follow-up description>`.

## Error Handling

- If any agent fails or gets stuck, report the issue to the user.
- If `context.md` or `plan.md` is not written properly, re-spawn that agent with more specific instructions.
- If validation errors persist after the agent's attempts, report remaining errors to the user.
- If a review fix agent introduces new failures it cannot resolve, report to the user.
