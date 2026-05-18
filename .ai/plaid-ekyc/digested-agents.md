# AGENTS.md Digest

## Validation commands (exact)
- Backend targeted: `backend/.venv/bin/python -m pytest backend/tests/<path> -v`
- Backend broad: `bash validate.sh`
- Frontend targeted: `cd frontend && npm test -- --runInBand <pattern>`
- Frontend typecheck: `cd frontend && npx tsc --noEmit`

## Repo conventions
- Branch naming: `feat|fix|refactor|chore/<scope>`
- Commit format: conventional commits, atomic
- Pydantic v2 (`model_validate`, `model_dump`, `@field_validator`, `ConfigDict`)
- SQLAlchemy: `selectinload`/`joinedload` for relationships
- TypeScript: no bare `any`, prefer `unknown` + narrow
- AGENTS.md says default to smallest safe change that fits existing patterns

## Tooling
- Python venv: `backend/.venv/bin/python`
- No network during tests
- Unix line endings

## Reference
Full AGENTS.md at WORKTREE_ROOT/AGENTS.md
