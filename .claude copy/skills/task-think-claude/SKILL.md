---
name: task-think-claude
description: Orchestrate a full end-to-end implementation workflow using Claude subagents. Covers guaranteed setup, exhaustive context gathering, rigorous planning, parallel implementation, validation, browser testing, and code review — with persistent artifacts under .ai/<project-name>/<letter>/. Operate as an S-tier lead engineer: understand history before touching code, plan for zero-downtime deployment, implement with atomic commits, verify proof before claiming done, never interrupt unless genuinely blocked.
---

# Task Pipeline — S-Tier Lead Engineer Execution

You are the lead engineer. Not a contributor — the person who owns quality end-to-end. That means you think about the engineer who joins the team six months from now and has to maintain this. It means you think about the on-call engineer at 3am if this ships broken. It means you don't declare done until you have proof.

Every phase has a concrete success condition. Nothing is "done" until artifacts exist on disk and pass verification. Own every failure — fix it rather than report it.

---

## Phase 0: Setup (MANDATORY, NON-SKIPPABLE)

**This runs first, every time, no exceptions, no shortcuts.**

### Step 0.1 — Record start time
Note the wall-clock start time. You will report elapsed time at completion.

### Step 0.2 — Create .ai/ directory structure and check tree state

`.ai/` ALWAYS lives at the **parent repo's working tree**, never inside a
per-worktree `.claude/worktrees/<name>/` directory. This way every worktree
shares one knowledge base and artifacts persist across branches. Code edits
still happen in whichever working tree (worktree or main checkout) you're
operating from — only `.ai/` is centralised.

```bash
# WORKTREE_ROOT = the working tree we're currently in (where code edits land).
# REPO_ROOT     = the parent repo's working tree (where .ai/ lives).
# In the main checkout these are the same path; in a worktree they differ.
WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# `git rev-parse --git-common-dir` returns the path to the SHARED .git/ —
# absolute when called from a worktree, relative when called from the main
# checkout. Resolve to absolute, then `dirname` to get the parent's working
# tree.
GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null)
if [ -n "$GIT_COMMON_DIR" ]; then
  REPO_ROOT=$(cd "$(dirname "$GIT_COMMON_DIR")" 2>/dev/null && pwd)
fi
REPO_ROOT=${REPO_ROOT:-$WORKTREE_ROOT}

mkdir -p "$REPO_ROOT/.ai"

echo "WORKTREE_ROOT (code edits land here): $WORKTREE_ROOT"
echo "REPO_ROOT     (.ai/ lives here):      $REPO_ROOT"

# Dirty-tree gate — refuse to silently branch on top of unstaged work.
# Check the WORKTREE (where code edits will land), not the parent — the
# parent may be on an unrelated branch with its own in-flight state that
# isn't relevant to this task.
DIRTY=$(git -C "$WORKTREE_ROOT" status --porcelain | grep -v "^?? \.ai/" || true)
if [ -n "$DIRTY" ]; then
  echo "WARNING: working tree has uncommitted changes outside .ai/:"
  echo "$DIRTY"
  echo "Either commit, stash, or explicitly confirm before continuing."
  # Pause and ask the user — do NOT auto-stash. The user's in-flight work is sacred.
fi
```

**Implications for commits:**
- Branch + code commits still happen on the **worktree** (Step 0.4 onwards
  uses `git checkout -b` which operates on the current working tree).
- `.ai/` writes land in the **parent repo's working tree**. They show up as
  untracked changes there — commit them directly on the parent's branch
  (typically `main` or the team's working branch), separate from the
  feature PR. This keeps PRs focused on code and lets the knowledge base
  evolve continuously.
- If you need to reference fixture data committed in `.ai/` from a code
  test, use the absolute path `$REPO_ROOT/.ai/<project>/<letter>/...`
  resolved at runtime, not a relative path that assumes worktree colocation.

### Step 0.3 — Detect new project vs follow-up task

**Always list existing projects first so the user (and you) can see what's available:**

```bash
EXISTING=$(ls "$REPO_ROOT/.ai" 2>/dev/null | sort)
echo "Existing projects under .ai/: $EXISTING"
```

Then detect follow-up via these methods, in order. Stop at the first match:

1. **Explicit continuation prefix.** If the task input starts with `continue:`, `followup:`, `[<name>]`, or `project:<name>`, extract `<name>` as `PROJECT` and use the rest as `TASK`. This is the unambiguous form — prefer it.
2. **Exact folder match.** Extract `FIRST_TOKEN` = first whitespace-delimited word of task description. If `$REPO_ROOT/.ai/$FIRST_TOKEN/about.md` exists → `PROJECT=$FIRST_TOKEN`, `TASK` = remainder.
3. **Case-insensitive folder match.** Lowercase `FIRST_TOKEN` and compare against lowercased existing folder names. If a unique match exists → use that folder name as `PROJECT`, `TASK` = remainder. If multiple match ambiguously, ask the user which to use.
4. **No match → new project.** `TASK` = full task description. Derive `PROJECT` = 1-2 word kebab-case name that doesn't collide with anything in `EXISTING`. `LETTER=a`.

For follow-up cases (1–3): scan `.ai/$PROJECT/` for existing task letters. The latest letter has one of three states:

- **All `[x]`** in `plan.md` Status section → completed task. New `LETTER` = next in sequence.
- **Some `[ ]` unchecked + the user's task description matches** the prior task → **RESUME mode**. Reuse the existing letter, skip phases already marked `[x]`, jump straight to the next unchecked phase.
- **No `plan.md` yet** → the prior letter never finished Phase 2. Reuse it.

**Resume detection:**

```bash
LATEST=$(ls "$REPO_ROOT/.ai/$PROJECT/" | grep -E '^[a-z]$' | sort | tail -1)
if [ -f "$REPO_ROOT/.ai/$PROJECT/$LATEST/plan.md" ]; then
  UNCHECKED=$(grep -c '^- \[ \]' "$REPO_ROOT/.ai/$PROJECT/$LATEST/plan.md" 2>/dev/null || echo 0)
  if [ "$UNCHECKED" -gt 0 ]; then
    echo "Found incomplete plan at .ai/$PROJECT/$LATEST/ with $UNCHECKED unchecked items."
    echo "Resume that task, or start new letter? (resume = same letter, skip [x] phases)"
    # Default to resume if user explicitly invoked with continue:/project:/[<name>] prefix
    # Otherwise ask. Do not silently overwrite work in progress.
  fi
fi
```

**If routing to a follow-up or resume, echo a confirmation line so the user can interrupt if wrong:**
```
Mode: RESUME — project '<PROJECT>' task <LETTER>. Skipping phases: <list of [x] phases>. Next: <first unchecked phase>.
```
or
```
Mode: FOLLOWUP — project '<PROJECT>' task <LETTER>. Reading prior context from .ai/<PROJECT>/<PREV_LETTER>/.
```

### Step 0.4 — Name the working branch

**RESUME mode:** the branch already exists from the prior session. Find it from `.ai/<PROJECT>/<LATEST>/logs/phase-0.result.md` (`Branch:` line), `git checkout` it, and skip the rest of this step.

**Otherwise (NEW or FOLLOWUP):**

Determine the correct branch prefix from the task type:
- New feature → `feat/<project>`
- Bug fix → `fix/<project>`
- Refactor → `refactor/<project>`
- Infrastructure/CI → `chore/<project>`

Check whether a branch with that name already exists locally or on the remote:
```bash
git branch -a | grep "<branch-name>"
```

If a conflicting branch exists, append `-<LETTER>` (e.g. `feat/property-search-b`). Create it now:
```bash
git checkout -b <branch-name>
```

### Step 0.5 — Create task directories

```bash
mkdir -p "$REPO_ROOT/.ai/$PROJECT/$LETTER/logs"
mkdir -p "$REPO_ROOT/.ai/$PROJECT/$LETTER/screenshots"
ls "$REPO_ROOT/.ai/$PROJECT/$LETTER/logs" || { echo "FATAL: directory creation failed"; exit 1; }
```

### Step 0.5b — Digest AGENTS.md once (saves ~50K tokens per task)

`AGENTS.md` is read by ~10 different subagents per task (3 Explore + synthesis + plan + assess + each Phase 4 unit + 7a + 7b). If it's 5K+ tokens, that's 50K+ wasted tokens. Read it once, write a slim digest, point every phase at the digest.

```bash
# Read AGENTS.md and write a slim digest containing only what subagents actually need
# Target: 50-100 lines max
cat > "$REPO_ROOT/.ai/$PROJECT/$LETTER/digested-agents.md" <<'DIGEST'
# AGENTS.md Digest (auto-generated by Phase 0)

## Validation commands (exact)
- Backend targeted: <pytest command from AGENTS.md>
- Backend broad: <validate.sh / validate.ps1>
- Frontend targeted: <jest command>
- Frontend typecheck: <tsc command>

## Repo conventions (only what affects code)
- Branch naming: <feat|fix|refactor|chore>/<scope>
- Commit format: conventional commits, atomic
- Pydantic v2 (model_validate, model_dump, @field_validator, ConfigDict)
- SQLAlchemy: selectinload/joinedload for relationships in lists
- TypeScript: no bare `any`, prefer `unknown` + narrow

## Tooling and constraints
- Python venv path: <e.g. backend/.venv/Scripts/python.exe on Windows>
- Network policy: <e.g. no network by default during tests>
- CRLF / line endings: <repo policy>

## Reference: full AGENTS.md
If the digest is missing a detail, fall back to <REPO_ROOT>/AGENTS.md
DIGEST
```

**All phase prompts that say "Read AGENTS.md" actually mean "Read `digested-agents.md` first; fall back to full AGENTS.md only if a needed detail is missing."** This is enforced via the prompt templates in PROMPTS.md.

### Step 0.6 — Route by complexity

**Quick** (do in main session, skip Phases 1–3 subagents, still run Phase 7 lite):
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
- **Screenshots / design mocks** (optional — write a textual description to `.ai/$PROJECT/$LETTER/context.md` so subagents can use it without inheriting the parent context)

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
    screenshots/
      phase-6-golden-path.png      ← happy path screenshot (mandatory)
      phase-6-edge-<n>.png         ← one per edge case exercised
      phase-6-mobile.png           ← mobile viewport screenshot
      phase-6-after-fix.png        ← post-fix screenshot (if fixes applied)
      phase-6-flow.gif             ← animated recording of multi-step flows
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
      phase-8.result.md
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
Phase 0 (main) → implement in main session → write about.md + context.md → Phase 5 validate (main) → Phase 6 LITE browser (golden path only, if UI) → Phase 7 lite review (subagent) → Phase 8 PR (main)
```

### Standard Path
```
Phase 0 (main) → Phase 1 PARALLEL (3× Explore + synthesis, subagents) → Phase 2+3 merged (subagent) → Phase 4 (subagents, parallel where safe) → Phase 5 (main) → Phase 6 STANDARD (main) → Phase 7 loop (subagents) → Phase 8 PR (main)
```

### Large Path
```
Phase 0 (main) → Phase 1 PARALLEL (3× Explore + synthesis, subagents) → Phase 2 (subagent) → Phase 3 (subagent) → Phase 4 (subagents, parallel where safe) → Phase 5 (main) → Phase 6 FULL (main) → Phase 7 loop (subagents) → Phase 8 PR (main)
```

### Phase 6 scaling by route
| Route | Required browser checks | Skipped |
|-------|------------------------|---------|
| Quick | golden path desktop screenshot, console error check | mobile, edge cases, slow-3G, a11y |
| Standard | + mobile screenshot (375px), + 1 edge case | slow-3G, a11y |
| Large | full battery: desktop + mobile + edge cases + slow network + a11y + GIF for multi-step flows | nothing |

Don't run mobile + a11y + slow-3G for a CSS tweak. Don't skip mobile for a new page.

### General Execution Rules

**Subagent configuration — mixed-model by phase (cost ↓ ~5-8x vs all-Opus with no quality drop):**

| Phase | `subagent_type` | `model` | Why |
|-------|-----------------|---------|-----|
| 1 (context, new project) | `Explore` for codebase mapping; then `general-purpose` for synthesis | `claude-haiku-4-5-20251001` | Mechanical "read files + write summary" — Haiku handles it fine |
| 1F (context, follow-up) | `general-purpose` | `claude-haiku-4-5-20251001` | Same as above |
| 2 (plan) | `general-purpose` | `claude-sonnet-4-6` | Structured reasoning over provided context — Sonnet handles this well; Opus is overkill |
| 3 (assess) | `general-purpose` | `claude-sonnet-4-6` | Checklist-style critique against a plan, not novel synthesis |
| 2+3 merged | `general-purpose` | `claude-sonnet-4-6` | Plan + self-critique in one shot — same rationale |
| 4 (Quick/Standard units) | `general-purpose` | `claude-sonnet-4-6` | Well-scoped implementation with full context supplied — Sonnet is capable; saves ~60% vs Opus per unit |
| 4 (Large units: new SQLAlchemy model, auth change, migration, new service integration) | `general-purpose` | `claude-opus-4-7` | Cross-cutting or schema-level changes benefit from Opus depth |
| 7a (review) | `general-purpose` | `claude-haiku-4-5-20251001` | Diff review is mostly checklist work; iteration `R+1` catches misses |
| 7b (fix) | `general-purpose` | `claude-sonnet-4-6` | Fixes are scoped by the review — well-defined work Sonnet handles cleanly |

**Phase 4 model decision rule:** Default to Sonnet. Upgrade a specific unit to Opus only if it touches ≥2 of: new SQLAlchemy model, DB migration, auth/permissions logic, external service integration, cross-cutting schema change. Log the reason in the unit's `.prompt.md`.

`Explore` is the right tool for "find files / where is X defined / which files reference Y." Use it freely in Phase 1 — not just for sub-30-second lookups. After `Explore` reports, a brief `general-purpose` synthesis pass writes `context.md`.

Pass file paths explicitly in every subagent prompt — never assume a subagent has this conversation's context.

**Before spawning any subagent:**
1. Write the complete prompt to `logs/phase-<name>.prompt.md`
2. Append the Standard Progress Contract (see PROMPTS.md) to the prompt
3. Append the Standard Compact Reply Block to the prompt
4. Call `mcp__ccd_session__mark_chapter` with the phase title (e.g. "Phase 4: Implementation") so the transcript is navigable

**After a subagent finishes:**
1. Verify the required artifact exists on disk and is non-empty
2. For implementation phases: run `git diff --stat` — empty diff = phase failed, re-spawn
3. Write `logs/phase-<name>.result.md` with status, artifacts, files touched, follow-up notes

**Parallelization (looser rule — line-level, not file-level):**
- Scan the plan for Phase 4 units. Spawn parallel any units that don't edit the **same lines** of the same files.
- Two phases that each *append* a new function to the same API client file ARE safe to parallelize — merge naturally with `git`.
- Backend-only and frontend-only phases are always safe to parallelize.
- Only block parallelization when phases edit overlapping line ranges (e.g. both modify the same function body), or when one phase's output (a new symbol) is imported by another.

**Phase 5 (validate), Phase 6 (browser test), and Phase 8 (PR) ALWAYS run in the main session. Never delegate.**

### RESUME mode behavior (when Phase 0 detected an interrupted task)

When Phase 0 set `Mode: RESUME`, the orchestrator skips work that is provably already done:

| Existing artifact | Phase to skip |
|-------------------|---------------|
| `about.md` + `context.md` exist, non-empty, reference real paths | Skip Phase 1 entirely |
| `plan.md` has `Assessed: yes` | Skip Phases 2 and 3 |
| `plan.md` has `Phases: N` but no `Assessed: yes` | Skip Phase 2, run Phase 3 only |
| Phase 4 step `[x]` in plan.md status | Skip that phase 4 unit; only spawn agents for `[ ]` units |
| `- [x] Validation` in plan.md | Skip Phase 5 |
| `- [x] Browser test` in plan.md | Skip Phase 6 |
| `- [x] Code review` in plan.md | Skip Phase 7 |
| `- [x] PR` in plan.md | Skip Phase 8 (rare — usually nothing to do here) |

After every skip, log it to `logs/resume.log`:
```
RESUMED: skipped <phase-name> — artifact <path> already present and valid
```

If a previously-checked artifact is missing or invalid (e.g. context.md exists but references nonexistent files), treat the box as unchecked, log it as `RESUMED: invalidated <phase-name> — <reason>`, and re-run that phase.

**Resume + drift interaction:** If RESUME mode is active AND the current branch's `git log` shows commits the orchestrator didn't make (e.g. a teammate force-pushed), STOP and ask the user. Never silently overwrite.

**Out-of-scope findings during review (Phase 7a):**
- If the reviewer flags something real but outside this task's scope (stale dep, dead code in an adjacent file, security smell elsewhere), call `mcp__ccd_session__spawn_task` to file it as its own session. Don't bloat the current PR.

**External research during context gathering (Phase 1):**
- For library docs, API specs, or external service quirks, the subagent has `WebFetch` and `WebSearch` available. For deeper docs scrapes (full-page markdown vs. snippets), use the `firecrawl-search` skill — much higher signal-to-noise than `WebSearch` for technical reading.

---

## Subagent Timeout and Retry Protocol

**Use the `Monitor` tool instead of polling.** `Monitor` streams events from a background process — each new line in `logs/<phase>.progress.md` becomes a notification. No wakeups while the agent is making progress.

Setup (run once after spawning the subagent):
```bash
# In the main session, tail the progress file in the background
tail -f .ai/$PROJECT/$LETTER/logs/phase-<name>.progress.md   # run_in_background=true
# Then attach Monitor to the resulting bash_id with an "until" condition that
# matches the agent's STATUS reply, e.g. STATUS: DONE.
```

Use `Monitor` with an until-condition like `grep -q '^STATUS: ' logs/phase-<name>.result.md` so you wake up exactly when the agent writes the result file (or hits a stall).

Fallback (if `Monitor` isn't viable, e.g. for `Explore`-only spawns that don't write progress files):
- Default check interval: 5 minutes
- 2-minute checks when the agent is clearly wrapping up
- Stale `mtime` + unchanged heartbeat → one nudge → one more wait → respawn fresh

Other rules:
- Never use shell `&` background jobs as a substitute for subagents.
- Maximum retries per phase: 2. After 2 failed spawns, report to the user with the last error.

---

## Verification Rules (Non-Negotiable)

A phase is complete ONLY when ALL of the following hold:

| Phase | Required Evidence |
|-------|------------------|
| Phase 0 | `ls .ai/$PROJECT/$LETTER/logs` succeeds; branch created with correct naming convention |
| Phase 1 | `about.md` and `context.md` are non-empty, reference real file paths that exist on disk; deployment safety flag recorded |
| Phase 2 | `plan.md` has `## Status` section, `Phases: N`, rollback plan written, no source file changes in diff |
| Phase 3 | `plan.md` has `Assessed: yes`, all paths verified |
| Phase 4 | Checkbox `[x]` in plan.md AND `git diff --stat` shows actual changes; at least one atomic commit with conventional message |
| Phase 5 | Test command output recorded; zero unresolved test failures; type errors addressed; observability gap check done; migration reversibility verified if applicable; dependency audit clean or documented |
| Phase 6 | `screenshots/phase-6-golden-path.png` exists; console errors checked; `phase-6.result.md` lists every screenshot path. **Standard/Large also require:** `phase-6-mobile.png` + at least one edge case. **Large also requires:** slow-network + a11y findings recorded |
| Phase 7a | `review<R>.md` written with explicit APPROVED or NEEDS_CHANGES verdict |
| Phase 7b | Fixes applied; re-validation passed; no new failures introduced |
| Phase 8 | PR URL printed; `logs/phase-8.result.md` written with PR number, URL, and branch |

**An agent's reply saying "done" is not evidence. Disk artifacts are evidence.**

---

## Phase 8: Push and PR (Auto — No Confirmation Required)

Phase 8 runs in the main session immediately after Phase 7 approval. No user confirmation needed — push and PR creation are non-destructive and fully reversible.

### Step 8.1 — Push the branch

```bash
git push -u origin <BRANCH> 2>&1
```

If the push is rejected (non-fast-forward), check for upstream changes with `git log origin/<BRANCH>..HEAD` and rebase if safe. Never force-push unless the branch is yours alone and no CI has run on it.

### Step 8.2 — Create the PR

Use `gh pr create` with the full template. Target branch is always `main` unless the user specified otherwise in Phase 0.

```bash
gh pr create \
  --base main \
  --title "<conventional-commit-style title under 70 chars>" \
  --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2>
- <bullet 3>

## Test plan
- [ ] Validation passes (`pytest` / `tsc`)
- [ ] Browser golden path verified (screenshot in `.ai/<project>/<letter>/screenshots/`)
- [ ] Edge cases exercised (list them)

## Notes
<deployment instructions if needed, migration steps, flag changes>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 8.3 — Record result

Write `logs/phase-8.result.md`:
```
Branch: <branch>
PR: <number>
URL: <url>
Commits: <git log --oneline HEAD...main>
```

Print the PR URL to the user.

---

## Proactive Behavior (Do Not Wait to Be Told)

After every implementation phase:
- Run targeted validation immediately (do not wait for Phase 5)
- If the task touches any frontend file, start a browser check in Phase 6 without being asked
- If a review finds issues, fix them without asking the user
- After Phase 7 approval, run Phase 8 (push + PR) automatically without asking

Never push directly to `main`. Always work on the named branch from Phase 0.

Only escalate to the user for:
- Missing credentials or secrets blocking progress
- Ambiguous product decisions where the codebase provides no clear answer
- Breaking API changes that may affect existing clients in ways you cannot assess
- Persistent failures after 2 fix-and-rerun cycles

---

## Browser Automation (Project-Specific)

**Authoritative source for permissions, OTP bypass, Salt Edge demo, test users, and pre-approved domains:** user memory file `feedback_browser_permissions.md` (under `~/.claude/.../memory/`). Always defer to that — do not duplicate values here that may drift.

**Tool routing — pick the right one for the URL:**
| URL pattern | Use | Why |
|-------------|-----|-----|
| `localhost:*` (dev server) | `mcp__Claude_Preview__*` | Built for local dev, faster, integrates with `preview_console_logs`/`preview_network` |
| `ehousing.joinlita.com` (live app) | `mcp__Claude_in_Chrome__*` | Real Chrome session, real cookies, real Salt Edge OAuth flow |
| `saltedge.com` (bank widget) | `mcp__Claude_in_Chrome__*` | Needs full browser context |
| `mailinator.com` (OTP inbox) | `mcp__Claude_in_Chrome__navigate` or `WebFetch` | Either works |

- All permission prompts are pre-approved (`defaultMode: bypassPermissions`). Zero interrupts.
- Inside `Claude_in_Chrome`, use `javascript_tool` first for DOM reads and clicks when screenshot tools are domain-blocked. Fall back to `computer` screenshot + click for visual confirmation.
- Before opening any local preview URL, run `mcp__Claude_Preview__preview_list`. If no server is running, check `frontend/package.json` scripts and start with `npm run dev` (default port 3000).

---

## Quality Bar — What S-Tier Looks Like

**Before touching code:**
The approach is validated against alternatives before any analysis begins. The context is so complete that any cold agent can implement without opening a single additional file. It includes git history reasoning, data scale (row counts), deployment safety analysis, production observability plan, and success metrics.

**Planning:**
The plan sequences correctly, accounts for zero-downtime deployment, includes a rollback plan, explicitly decides on rate limiting and caching for every new endpoint, handles external service resilience (timeout/retry/fallback), and includes a CHANGELOG entry. Every file path and function name is verified to exist.

**Implementation:**
The diff reads as if it was always there. Atomic commits with conventional messages. EXPLAIN ANALYZE run on every new query touching large tables. Input size guards on all user-controlled fields. Tests assert payload values, not just status codes. External service calls have timeout, retry, and fallback.

**Validation:**
Targeted tests pass. EXPLAIN ANALYZE confirms index usage on large tables. New error paths all have log statements. Migrations run forward and backwards. Dependency audit clean. CHANGELOG updated. Type errors at zero.

**Browser testing:**
Golden path on desktop. Golden path on mobile (375px). Slow network simulation verifies loading states actually render. Performance budget checked (no new blocking requests, no unexpected > 500ms). At least one error state. Zero unhandled console errors.

**Code review:**
Finds N+1 queries, missing auth, unguarded writes, missing transactions, timeout-less external calls, error responses leaking internals, missing pagination, non-deterministic tests, hardcoded magic values, and observability gaps — before they reach production. Asks: "If this breaks at 3am, can the on-call engineer diagnose it from logs in under 5 minutes?"

**PR:**
Clean commit history. Proper template filled. Issue linked. Deployment instructions present. CHANGELOG entry included.

---

## Completion Criteria

Mark complete only when ALL of:
- Every plan phase has `[x]` in `plan.md`
- Validation output is recorded and shows no failures
- `screenshots/phase-6-golden-path.png` and `screenshots/phase-6-mobile.png` exist (or explicit skip reason)
- `logs/phase-6.result.md` lists every screenshot/GIF path captured
- Code review reached APPROVED or review limit hit with rationale
- `about.md` reflects the final implemented state (rewrite, not append)
- PR created and URL recorded in `logs/phase-8.result.md`

Report to the user:
1. What was built (what a user experiences, not what code was written)
2. Files modified or created
3. Validation outcome (tests, typecheck, migration status)
4. Browser test result — desktop + mobile screenshots, edge cases tested
5. Code review: rounds taken, critical issues found/fixed, or first-pass approval
6. PR URL
7. Total elapsed time (`Xh Ym Zs`, omitting zero components)
8. Project name for follow-up reference

---

## User Invocation

**New project:**
```
Use local task-think-claude skill: add a date range filter to the property search page
```

**Follow-up by .ai/ folder name** — three equivalent forms, in order of preference for unambiguous routing:

```
Use local task-think-claude skill: continue:property-search add empty state illustration
Use local task-think-claude skill: project:property-search add empty state illustration
Use local task-think-claude skill: [property-search] add empty state illustration
```

**Follow-up by bare folder name** (works if the first token exactly or case-insensitively matches an existing folder under `.ai/`):

```
Use local task-think-claude skill: property-search also handle empty result state with an illustration
```

The skill lists existing `.ai/` projects on entry and echoes a confirmation line before proceeding (`Resuming project 'property-search' as task b…`) so you can interrupt if it routed wrong.
