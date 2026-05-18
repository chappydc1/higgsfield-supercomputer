---
name: task-think-codex
description: Orchestrate a multi-phase implementation workflow for this repository using OpenAI Codex CLI subprocesses. Covers context gathering, planning, plan assessment, implementation, and validation — with persistent artifacts under .ai/<project-name>/<letter>/. Use when the user wants a single prompt to drive a full feature or fix from research through verified completion.
---

# Task Pipeline (Codex)

Run a full implementation workflow end-to-end: context → plan → assess → implement → validate → code review.

## Lead Engineer Mindset

Execute this skill the way a lead engineer at a high-output team owns a task:

- **Speed is a first-class concern.** Skip phases that add no value for the task at hand. Never spawn a subprocess when the main session can do it in 30 seconds.
- **Own the outcome, not just the steps.** If a phase produces something wrong, fix it rather than reporting it.
- **Shortest safe path.** Implement exactly what the task requires, following existing repo patterns. No gold-plating.
- **Verify before claiming done.** Artifacts must exist on disk. `git diff --stat` must show actual file changes. Tests must pass.
- **Low interrupt rate.** Escalate only for genuine blockers: missing credentials, ambiguous product decisions, destructive actions outside the workspace.
- **Tight feedback loops.** Validate after each implementation phase, not at the end.

## Task Routing

**Before spawning any subprocesses, assess task complexity and route accordingly.**

### Quick Path (≤5 steps, 1-3 files, no new endpoints or DB models)
Examples: bug fix, copy change, adding a field to an existing response schema, tweaking a component style.

- **Always run Phase 0 (Setup)** — create the `.ai/` folder structure before touching any code.
- Skip phases 1-3 (context/plan/assess subprocesses).
- Implement directly in the main session.
- After implementing, write a brief `about.md` and a minimal `context.md`.
- Run targeted validation.
- Total time target: under 5 minutes.

### Standard Path (5-15 steps, up to ~8 files, one new endpoint or component)
Examples: new feature endpoint + frontend page, adding a filter to an existing list, new form with validation.

- Run Phase 1 (context) and a merged Phase 2+3 (plan with built-in assessment).
- Run Phase 4 implementation, Phase 5 validation, Phase 6 review.
- Total time target: under 30 minutes.

### Large Path (15+ steps, many files, new DB models, cross-cutting concerns)
Examples: new entity with full CRUD, auth system change, multi-service integration.

- Run all phases including separate Phase 3 plan assessment.
- Consider parallel Phase 4 units for disjoint write sets.
- Total time target: 30-90 minutes.

**Default to Quick or Standard. Only use Large when the task genuinely requires it.**

## Inputs

Collect:
- task description
- optional project name (if missing, derive a short kebab-case name from the task)
- optional constraints (files, architecture, risk tolerance)

## Project Layout

Projects live under `.ai/<project-name>/`. Each project has sequential tasks labeled `a`, `b`, `c`, ... `z`.

```
.ai/<project-name>/
  about.md              # Project-level blueprint — always describes completed state
  a/                    # First task
    context.md          # Codebase context specific to this task
    plan.md             # Numbered, phased implementation plan
    review1.md          # Code review iterations (up to 3)
    review2.md
    review3.md
    logs/
      phase-*.prompt.md
      phase-*.progress.md
      phase-*.result.md
  b/                    # Follow-up task
    ...
```

- `about.md`: project-level blueprint written as if fully implemented — no temporal state, no TODOs, no "pending" language. Rewritten (not appended) each new task.
- `context.md`: task-specific deep dive — file paths, code patterns, data shapes, API contracts. Self-contained enough for a fresh subprocess to work from alone.

## Phases

Run sequentially:

1. **Phase 0: Setup** — Record start time, detect follow-up vs new, create directories.
2. **Phase 1: Context** — Read codebase via AGENTS.md, write `about.md` and `context.md`. Use Phase 1F for follow-up tasks.
3. **Phase 2: Plan** — Write `plan.md` with numbered steps grouped into phases.
4. **Phase 3: Assess** — Review plan for correctness, completeness, quality, and phase sizing. Refine in-place.
5. **Phase 4: Implement** — Execute one implementation unit per plan phase, sequentially by default.
6. **Phase 5: Validate** — Run targeted tests and build checks. Fix failures. Skip only if no source was modified.
7. **Phase 6: Code Review Loop** — Up to 3 review-fix iterations until approved or the limit is reached.

Use the phase prompt templates in `PROMPTS.md`.

## Execution Mode

Use `codex` CLI subprocesses for phases 1, 2, 3, each Phase 4 unit, and each Phase 6 pass. Keep the main session thin.

- Write the full phase prompt to `logs/phase-<name>.prompt.md` before spawning.
- Spawn via: `codex --quiet -p "<prompt-file-path>"` or pipe the prompt to `codex` stdin.
- Prefer full-context mode; supply file paths explicitly in the prompt rather than relying on directory inference.
- Run Phase 5 (validate) in the main session — it is critical-path.
- Default wait: allow up to 10 minutes per phase. Check expected artifacts on disk after completion.
- A subprocess exiting without producing the required artifact means the phase failed — rerun with tighter instructions.
- Never use shell background jobs (`&`) as a substitute for tracked codex invocations.

## Verification Rules

- A delegated phase is complete only when the required artifact exists on disk and matches the phase goal.
- Never mark complete without: implemented code present, validation recorded, review pass documented.
- If build or test commands fail due to file locks or access-denied errors, stop and ask the user.

## Quality Bar

Each phase must clear a specific bar before the next starts:

| Phase | Bar |
|-------|-----|
| Context | `about.md` + `context.md` are non-empty and reference real file paths |
| Plan | `plan.md` has numbered steps, a Status section, and no source edits |
| Assess | `plan.md` has `Phases: N` and `Assessed: yes`, paths verified against the repo |
| Implement | Checkbox flipped; `git diff --name-only` matches owned write set |
| Validate | Test command ran; output recorded; no unresolved failures |
| Review | `review<R>.md` written with APPROVED or NEEDS_CHANGES + specific fixes |

## Completion Criteria

Mark complete only when:
- All plan phases are implemented
- Validation is recorded (tests passing, no type errors)
- Review issues are addressed or explicitly deferred with rationale
- Display total elapsed time (`Xh Ym Zs`, omitting zero components)
- Remind the user of the project name for follow-up tasks

## Error Handling

- Phase timeout: check artifact mtime, send one nudge, respawn if no movement.
- Missing or malformed `context.md`/`plan.md`: rerun that phase with tighter instructions.
- Persistent validation failures after fix attempts: report to the user with the full error.
- Review-fix introduces new failures it cannot resolve: report to the user.

## User Invocation

```
Use local task-think-codex skill: add a date range filter to the property search page
```

For follow-up tasks on an existing project:
```
Use local task-think-codex skill: property-search also handle empty result state with an illustration
```
