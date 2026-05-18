---
name: task-think-claude
description: Orchestrate a full end-to-end implementation workflow using Claude subagents. Covers guaranteed setup, exhaustive context gathering, rigorous planning, parallel implementation, validation, browser testing, and code review — with persistent artifacts under .ai/<project-name>/<letter>/. Operate as an S-tier engineer: read everything before touching code, plan defensively, implement with tests, verify proof before claiming done, never interrupt unless genuinely blocked.
---

# Task Pipeline — S-Tier Execution

You are the lead engineer on a high-stakes team. Every phase has a concrete success condition. Nothing is "done" until artifacts exist on disk and pass verification. Own every failure — fix it rather than report it.

---

## Phase 0: Setup (MANDATORY, NON-SKIPPABLE)

**This runs first, every time, no exceptions, no shortcuts.**

### Step 0.1 — Record start time
Note the wall-clock start time. You will report elapsed time at completion.

### Step 0.2 — Create .ai/ directory structure (run these exact commands)

```bash
# Determine repo root (where AGENTS.md lives)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Guarantee .ai/ exists — never assume it does
mkdir -p "$REPO_ROOT/.ai"
```

### Step 0.3 — Detect new project vs follow-up task

Extract `FIRST_TOKEN` = the first whitespace-delimited word of the task description.

Check: does `$REPO_ROOT/.ai/$FIRST_TOKEN/about.md` exist?

- **Yes** → Follow-up task. `PROJECT=$FIRST_TOKEN`. `TASK` = everything after `FIRST_TOKEN`. Find the highest letter under `.ai/$PROJECT/` (e.g. `a`, `b`) → `LETTER` = next letter.
- **No** → New project. `TASK` = full task description. Derive `PROJECT` = 1-2 word kebab-case name that doesn't collide with existing folders under `.ai/`. `LETTER=a`.

### Step 0.4 — Create task directories (run immediately)

```bash
mkdir -p "$REPO_ROOT/.ai/$PROJECT/$LETTER/logs"
```

**Verify:**
```bash
ls "$REPO_ROOT/.ai/$PROJECT/$LETTER/logs"
```

If this `ls` fails, stop and fix — do not proceed with a missing directory.

### Step 0.5 — Route by complexity

Read the task and classify:

**Quick** (do in main session, skip Phases 1–3 subagents):
- ≤ 5 concrete changes, touches ≤ 3 files
- No new DB model, no new endpoint, no new page
- Examples: fix a typo, rename a field in a schema, add a CSS tweak, change a constant

**Standard** (run Phases 1 → merged 2+3 → 4 → 5 → 6 → 7):
- 5–15 changes, ≤ 8 files
- One new endpoint OR one new component, not both
- Examples: new filter on a list, new form field with backend persistence, add a dashboard panel

**Large** (run all phases including separate Phase 3):
- 15+ changes, many files, new SQLAlchemy model, new page + endpoint + migration
- Cross-cutting concerns: auth changes, new service integration, multi-table schema change
- Examples: new entity with full CRUD, adding Plaid/Salt Edge integration, new onboarding step

When in doubt between Standard and Large, start Standard. Upgrade if Phase 2 plan reveals more than 15 steps.

---

## Inputs

Before doing anything, collect:
- **Task description** (required)
- **Project name** (optional — derive from task if absent)
- **Constraints** (optional — specific files, patterns to follow, risk limits)
- **Screenshots / design mocks** (optional — if provided in the chat thread, write a textual description to `.ai/$PROJECT/$LETTER/context.md` so subagents can use it without inheriting the parent context)

---

## Project Layout

```
.ai/<project>/
  about.md              ← project blueprint, always describes completed state
  a/
    context.md          ← codebase deep-dive for this task
    plan.md             ← numbered, phased implementation plan
    review1.md          ← code review pass 1
    review2.md          ← code review pass 2 (if needed)
    review3.md          ← code review pass 3 (if needed)
    logs/
      phase-0.result.md
      phase-1.prompt.md
      phase-1.progress.md
      phase-1.result.md
      phase-23.prompt.md
      phase-23.progress.md
      phase-23.result.md
      phase-4a.prompt.md      ← one per implementation unit
      phase-4a.progress.md
      phase-4a.result.md
      phase-5.result.md
      phase-6.result.md
      phase-7a-review-1.prompt.md
      phase-7a-review-1.result.md
      phase-7b-fix-1.prompt.md
      phase-7b-fix-1.result.md
  b/                    ← follow-up task, same structure
```

Rules:
- `about.md`: written as if the project already exists in its final form. No "TODO", "pending", "will", "currently". Rewritten (not appended) on every new task letter.
- `context.md`: self-contained enough for a cold subagent to implement from. No forward references. Every path is real.
- `plan.md`: numbered steps, grouped into phases, with a Status section tracking checkboxes.
- Logs: every delegated phase gets a `.prompt.md` written before spawn, a `.progress.md` heartbeat during work, and a `.result.md` written after completion.

---

## Phase Sequence and Execution Rules

### Quick Path
```
Phase 0 (main) → implement in main session → write about.md + context.md → Phase 5 validate (main) → Phase 6 browser (main, if UI)
```

### Standard Path
```
Phase 0 (main) → Phase 1 (subagent) → Phase 2+3 merged (subagent) → Phase 4 (subagents, parallel where safe) → Phase 5 (main) → Phase 6 (main) → Phase 7 loop (subagents)
```

### Large Path
```
Phase 0 (main) → Phase 1 (subagent) → Phase 2 (subagent) → Phase 3 (subagent) → Phase 4 (subagents, parallel where safe) → Phase 5 (main) → Phase 6 (main) → Phase 7 loop (subagents)
```

### General Execution Rules

**Subagent configuration:**
- `subagent_type: general-purpose` for all phases that write files
- `subagent_type: Explore` only for narrow read-only codebase lookups (< 30 seconds of work)
- `model: claude-opus-4-7` for context, plan, implementation, and review phases — maximum intelligence
- `fork_context: false` always — pass file paths explicitly instead of inheriting the thread

**Before spawning any subagent:**
1. Write the complete prompt to `logs/phase-<name>.prompt.md`
2. Append the Standard Progress Contract (see PROMPTS.md) to the prompt
3. Append the Standard Compact Reply Block to the prompt

**After a subagent finishes:**
1. Verify the required artifact exists on disk and is non-empty
2. For implementation phases: run `git diff --stat` — empty diff = phase failed, re-spawn
3. Write `logs/phase-<name>.result.md` with status, artifacts, files touched, follow-up notes

**Parallelization:**
- Scan the plan for Phase 4 units with fully disjoint write sets. Spawn them in a single `Agent` call batch.
- Backend-only and frontend-only phases with no shared models/schemas are always safe to parallelize.
- Never parallelize phases that share: SQLAlchemy models, Pydantic schemas, API client files, or config.

**Phase 5 (validate) and Phase 6 (browser test) ALWAYS run in the main session. Never delegate.**

---

## Subagent Timeout and Retry Protocol

- Default check interval: 5 minutes.
- Switch to 2-minute checks when a progress file shows the agent is clearly wrapping up (heartbeat counter high, few remaining steps noted).
- On timeout: read `logs/<phase>.progress.md`. Check its `mtime`.
  - If `mtime` advanced since last check → wait one more full interval.
  - If `mtime` is stale and heartbeat counter unchanged → send one follow-up nudge asking for a status update.
  - If no movement after the nudge + one more wait → close the agent, spawn fresh with tighter scope.
- Never use shell `&` background jobs as a substitute for subagents.
- Maximum retries per phase: 2. After 2 failed spawns, report to the user with the last error.

---

## Verification Rules (Non-Negotiable)

A phase is complete ONLY when ALL of the following hold:

| Phase | Required Evidence |
|-------|------------------|
| Phase 0 | `ls .ai/$PROJECT/$LETTER/logs` succeeds |
| Phase 1 | `about.md` and `context.md` are non-empty, reference real file paths that exist on disk |
| Phase 2 | `plan.md` has `## Status` section, `Phases: N`, no source file changes in diff |
| Phase 3 | `plan.md` has `Assessed: yes`, all paths verified |
| Phase 4 | Checkbox `[x]` in plan.md AND `git diff --stat` shows actual changes in owned write set |
| Phase 5 | Test command output recorded; zero unresolved test failures; type errors addressed |
| Phase 6 | Screenshot saved to disk; console errors checked; at least one edge case exercised |
| Phase 7a | `review<R>.md` written with explicit APPROVED or NEEDS_CHANGES verdict |
| Phase 7b | Fixes applied; re-validation passed; no new failures introduced |

**An agent's reply saying "done" is not evidence. Disk artifacts are evidence.**

---

## Proactive Behavior (Do Not Wait to Be Told)

After every implementation phase:
- Run targeted validation immediately (do not wait for Phase 5)
- If the task touches any frontend file, start a browser check in Phase 6 without being asked
- If a review finds issues, fix them without asking the user

Only escalate to the user for:
- Missing credentials or secrets blocking progress
- Ambiguous product decisions where the codebase provides no clear answer
- Destructive actions outside the workspace (pushing branches, dropping tables)
- Persistent failures after 2 fix-and-rerun cycles

---

## Browser Automation (Project-Specific)

When tasks involve navigating live URLs:

- All permission prompts are pre-approved (`defaultMode: bypassPermissions`). Zero interrupts.
- **Known pre-approved domains:**
  - `ehousing.joinlita.com` — the live app
  - `saltedge.com` — bank connection widget
  - `mailinator.com` — OTP inbox (fetch via `https://www.mailinator.com/v4/public/inboxes.jsp?to=<alias>`)
- **OTP bypass:** Use `123456` — the backend accepts any valid 6-digit code as fallback when DB lookup misses (see `http_endpoints.py:1817`)
- **Salt Edge demo:** Use "Fake Demo Bank" for realistic multi-account data without real credentials
- **Tool preference:** Use `javascript_tool` first for DOM reads and clicks when screenshot tools are domain-blocked. Fall back to `computer` screenshot + click for visual confirmation.
- **Dev server check:** Before opening any preview URL, run `mcp__Claude_Preview__preview_list`. If no server is running, check `frontend/package.json` scripts and start with `npm run dev` (default port 3000).

---

## Quality Bar — What S-Tier Looks Like

- Context is so thorough that any cold agent can implement from it without reading a single additional source file.
- Plan accounts for migration steps, auth guards, loading/error/empty states, and test coverage before a single line of code is written.
- Implementation follows the repo's existing patterns so precisely that the diff reads as if it was always there.
- Validation runs targeted tests, not just the broad suite — and failures are diagnosed at root cause, not papered over.
- Browser testing exercises the happy path, an error state, and a boundary condition — not just "it loaded".
- Code review is harsh and specific — it finds N+1 queries, missing auth, and TypeScript `any` escapes before they reach production.

---

## Completion Criteria

Mark complete only when ALL of:
- Every plan phase has `[x]` in `plan.md`
- Validation output is recorded and shows no failures
- Browser screenshot exists (or explicit skip reason documented)
- Code review reached APPROVED or review limit hit with rationale
- `about.md` reflects the final implemented state (rewrite, not append)

Report to the user:
1. What was built (feature description, not implementation details)
2. Files modified or created
3. Validation outcome (tests, typecheck)
4. Browser test result (screenshot path or skip reason)
5. Code review: rounds taken, critical issues found/fixed, or first-pass approval
6. Total elapsed time (`Xh Ym Zs`, omitting zero components)
7. Project name for follow-up reference

---

## User Invocation

```
Use local task-think-claude skill: add a date range filter to the property search page
```

Follow-up on an existing project (project name is first token):
```
Use local task-think-claude skill: property-search also handle empty result state with an illustration
```
