---
description: Implement a feature using multi-agent workflow, then iteratively test and fix it in-app
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, TodoWrite, mcp__Claude_Preview__preview_start, mcp__Claude_Preview__preview_screenshot, mcp__Claude_Preview__preview_console_logs, mcp__Claude_Preview__preview_click, mcp__Claude_Preview__preview_fill, mcp__Claude_Preview__preview_snapshot, mcp__Claude_in_Chrome__navigate, mcp__Claude_in_Chrome__read_console_messages, mcp__Claude_in_Chrome__computer, mcp__Claude_in_Chrome__find, mcp__Claude_in_Chrome__javascript_tool
---

# WithTest - Multi-Agent Implementation + In-App Testing

You orchestrate a multi-phase implementation workflow followed by an iterative in-app testing loop using MCP browser/preview tools.

**Arguments:** `$ARGUMENTS` = "$ARGUMENTS"

If `$ARGUMENTS` is provided, it's the task description. If empty, ask the user what they want implemented.

## Overview

Two major stages:
1. **Implementation** (Phases 0-5) — same as `/task`, produces working code
2. **Testing Loop** (Phase 6) — iterative browser test → diagnose → fix cycle using MCP tools

Artifacts live in `.ai/<feature-name>/`:
- `context.md`, `plan.md` — from implementation
- `test<N>.md` — test plan for iteration N
- `result<N>.md` — test result report for iteration N

---

## STAGE 1: IMPLEMENTATION (Phases 0-5)

### Phase 0: Setup

Record the current time as `$START_TIME`.

**Follow-up detection (MANDATORY FIRST):**

Extract the first token from `$ARGUMENTS`. Call it `FIRST_TOKEN`.

Run in parallel:
1. `ls .ai/` — existing projects
2. `ls .ai/<FIRST_TOKEN>/about.md` — check if project exists

- File exists → follow-up task. Project = `FIRST_TOKEN`. Task = rest of `$ARGUMENTS`. Skip to Phase 2F.
- File missing → new task. Full `$ARGUMENTS` is the task description.

For new tasks: pick a unique short name, create `.ai/<feature-name>/` and `.ai/<feature-name>/a/`.

### Phase 1: Context Gathering (New Tasks)

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are a context-gathering agent for a FastAPI + Next.js codebase.

TASK: <paste task description>
REPO ROOT: <repo root path>

YOUR JOB: Read AGENTS.md, explore the codebase, find everything relevant to this task, and write two documents. Do not implement any code.

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
7. Note relevant test files and test patterns so the implementation agent can write matching tests (pytest fixtures, Jest patterns, mock strategies).
8. If the task involves a DB model: note the SQLAlchemy model, Alembic migration patterns, and any existing migration files to understand naming and structure.
9. If the task involves UI: note component structure, shared hooks, styling approach, component library usage.
10. If the task requires a new API endpoint: note how existing endpoints are structured (router, schema, service layer, auth guard, error handling).
11. Note auth/permission patterns that apply to this task.
12. Note any environment variables or external service integrations the task may touch.

Write TWO files:

### File 1: .ai/<feature-name>/about.md
Written as if fully implemented. No temporal language. Include: Project, Architecture, Key Design Decisions, Relevant Codebase Areas.

### File 2: .ai/<feature-name>/a/context.md
Self-contained. All downstream agents read ONLY this file. Include:
- Task Description: full task restated
- Stack: FastAPI/Python, Next.js/TypeScript, SQLAlchemy + Alembic, pytest + Jest
- Relevant Files: every path with line ranges and descriptions
- Data Flow: end-to-end for this feature
- Key Types and Interfaces: TypeScript types, Pydantic schemas, SQLAlchemy models
- API Contract: endpoint paths, methods, request/response shapes
- Component Structure: frontend components, hooks, relationships
- Auth/Permission Pattern: how auth is enforced
- Test Patterns: file paths, patterns, fixtures
- Validation Commands: exact commands from AGENTS.md
- Reference Implementations: most similar existing feature with file paths

Be exhaustive. Another agent with no context will implement from this file alone.
```

### Phase 2: Planning

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are a planning agent for a FastAPI + Next.js codebase.

Read AGENTS.md, .ai/<feature-name>/a/context.md, then the source files referenced.

Write .ai/<feature-name>/a/plan.md with: Task, Approach, Files to Modify, Files to Create, numbered Implementation Steps grouped into phases (sequence: DB model → Alembic migration → backend service → router → frontend API client → component → page), Tests to Write or Update, Validation commands (targeted backend pytest, targeted frontend npm test, broad validate.sh), and Status checkboxes including Validation, Browser test, Code review.

If the task adds or changes a SQLAlchemy model, the plan MUST include a dedicated step to generate and apply the Alembic migration: `alembic revision --autogenerate -m "<description>"` followed by `alembic upgrade head`. This is not optional.

Do not implement code.
```

### Phase 2F: Follow-up Planning (Follow-up Tasks Only)

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are a planning agent for a follow-up task.

Read AGENTS.md, .ai/<feature-name>/context.md, .ai/<feature-name>/plan.md, and the source files already implemented.

FOLLOW-UP TASK: <paste follow-up description>

Append a new section to plan.md (keep existing content as history):

---
## Follow-up Task
<description>

## Follow-up Approach
<strategy>

## Follow-up Files to Modify / Create
<list>

## Follow-up Implementation Steps

### Phase F1: <name>
1. <specific step>
...

## Follow-up Status
Phases: <N>
- [ ] Phase F1: <name>
- [ ] Validation
- [ ] Browser test
Assessed: yes
```

### Phase 3: Plan Assessment

Spawn an agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are a plan assessment agent.

Read AGENTS.md, .ai/<feature-name>/a/context.md, .ai/<feature-name>/a/plan.md, and the actual source files.

Assess: correctness of paths/types, completeness (edge cases, auth guards, loading states), test coverage, code quality (no business logic in route handlers, no DB queries in components), phase sizing (≤8-10 steps each), sequencing (backend before frontend).

Update plan.md in-place: fix inaccuracies, add missing steps, add `Phases: <N>` and `Assessed: yes` to Status.

Do not implement code.
```

### Phase 4: Implementation

For each unfinished phase in plan.md, spawn an implementation agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`):

```
You are an implementation agent for Phase <N>.

Read AGENTS.md, .ai/<feature-name>/a/context.md, .ai/<feature-name>/a/plan.md, then each source file you will modify.

Owned write set: <OWNED_WRITE_SET>

Implement only Phase <N> steps. Follow the plan precisely. Follow AGENTS.md conventions and existing repo patterns (Pydantic v2, SQLAlchemy patterns, Next.js router, component patterns). Write or update tests as the plan specifies. Flip `- [ ] Phase <N>:` to `- [x] Phase <N>:` in plan.md when done.

Report: files changed, deviations, issues.
```

After each phase: verify the checkbox flipped, run `git diff --name-only` to verify the write set.

### Phase 5: Validation

Run in the main session. Do not delegate.

1. Read AGENTS.md for exact commands.
2. Run targeted tests (pytest for touched backend, npm test for touched frontend).
3. Run targeted typecheck/lint.
4. Broaden only if needed.

If validation fails: diagnose, fix, rerun once. Report if still failing.

Update plan.md: flip `- [ ] Validation` to `- [x] Validation`.

---

## STAGE 2: TESTING LOOP (Phase 6)

Test the implementation in-app using MCP browser/preview tools. Maintain iteration counter `N = 1`.

### Step 6a: Test Plan

Write `.ai/<feature-name>/test<N>.md` with:

```
## Test Iteration <N>

## What We're Testing
<what feature or behavior this iteration verifies>

## Test Steps
1. <action>: what we do, what we expect, how to verify
2. ...

## Golden Path
<the ideal happy path flow>

## Edge Cases to Test
- <empty state>
- <validation error>
- <unauthenticated access if applicable>
- <boundary values>

## Success Criteria
- <criterion 1>
- <criterion 2>
```

If N > 1, also read `result<N-1>.md` and `test<N-1>.md` to understand what was found previously and what to re-verify or add.

### Step 6b: Browser Test Execution

Run tests in the main session using MCP tools:

1. **Ensure the dev server is running.** Check `mcp__Claude_Preview__preview_list` first. If not already running:
   - Frontend (Next.js): `cd frontend && npm run dev` — check `frontend/package.json` → `"scripts"."dev"` for the exact command and port (typically `http://localhost:3000`).
   - If a staging/preview URL is already available, use that instead.
2. **Navigate to the app:**
   - Use `mcp__Claude_Preview__preview_start` if a preview server is available, or
   - Use `mcp__Claude_in_Chrome__navigate` to open the relevant page in the browser.

2. **Exercise the golden path:**
   - Use `mcp__Claude_Preview__preview_click` / `mcp__Claude_in_Chrome__find` to interact with UI elements.
   - Use `mcp__Claude_Preview__preview_fill` / `mcp__Claude_in_Chrome__form_input` to fill forms.
   - Use `mcp__Claude_in_Chrome__javascript_tool` to check state or trigger actions when needed.

3. **Capture screenshot:**
   - `mcp__Claude_Preview__preview_screenshot` or `mcp__Claude_in_Chrome__computer`
   - Read and assess the screenshot visually.

4. **Check console errors:**
   - `mcp__Claude_Preview__preview_console_logs` or `mcp__Claude_in_Chrome__read_console_messages`
   - Any errors that are caused by this feature are a failure.

5. **Test edge cases** from the test plan (empty state, error state, auth boundary).

6. **Capture final screenshot** after edge case testing.

### Step 6c: Test Assessment

Write `.ai/<feature-name>/result<N>.md`:

```
## Test Result - Iteration <N>
## Outcome: <PASS | FAIL | PARTIAL>

## Screenshots
- <path or description>: <what is shown, whether it matches expectations>

## Console Errors
<none, or list of errors found>

## Test Steps Summary
- ✓ <step that passed>
- ✗ <step that failed — describe what happened vs expected>

## Issues Found
<specific bugs or unexpected behaviors>

## Verdict
<PASS | NEEDS_FIX>
```

### Step 6d: Decision

Read `result<N>.md`:

- **PASS**: all test steps passed, no console errors caused by this feature, screenshots look correct → go to FINISH.
- **NEEDS_FIX**: bugs found in the implementation.
  1. Spawn a fix agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`) with the specific issues from `result<N>.md`.
  2. Fix agent reads: AGENTS.md, context.md, plan.md, result<N>.md, then the failing source files. Implements only the required fixes. Runs targeted validation after.
  3. `N = N + 1`. Go to Step 6a.
  4. Safety: if N > 5, stop and report to user — something fundamental may be wrong.

### Finish

```
FINISH:
  - Update plan.md: flip `- [ ] Browser test` to `- [x] Browser test (iteration <N>)`
  - Proceed to Phase 7 (Code Review)
```

### Phase 7: Code Review Loop

After testing passes, run up to 3 review-fix iterations (`R = 1`).

Spawn a review agent (`Task` tool, `subagent_type=general-purpose`, `model=claude-opus-4-7`) for each review pass, reading AGENTS.md, context.md, plan.md, and running `git diff`. Review priority: correctness/safety, dead code, redundant changes, duplication, wrong placement, type safety, test gaps, style. Write `review<R>.md` with APPROVED or NEEDS_CHANGES + specific fixes.

After review: if APPROVED → flip `- [ ] Code review` checkbox, proceed to Completion. If NEEDS_CHANGES → spawn fix agent, rerun targeted validation, R++. If R > 3 → stop reviewing, accept current state.

---

## Completion

1. Read `plan.md` and summarize:
   - What was implemented
   - Files modified or created
   - Validation outcome
   - Testing: how many iterations, what was found and fixed
   - Code review: rounds, findings, or first-pass approval
2. Elapsed time: `$START_TIME` → now, format `Xh Ym Zs`.
3. Remind the user of the project name: `/withtest <feature-name> <follow-up description>`.

## Error Handling

- Agent fails or gets stuck: report to user.
- `context.md`/`plan.md` not written properly: re-spawn with more specific instructions.
- Validation errors persist: report to user with full output.
- MCP tools unavailable: note that browser testing was skipped, explain why.
- Testing loop exceeds 5 iterations: stop and report — something fundamental may be wrong.
