---
description: Prepare changelog, set version, and commit a new release
allowed-tools: Read, Bash, Edit, Grep, AskUserQuestion
---

# Release — Changelog, Version Bump, Commit

Full release flow: generate changelog, bump version, and commit + tag.

**Arguments:** `$ARGUMENTS` = "$ARGUMENTS"

Parse `$ARGUMENTS` for two optional parts (in any order):
- A **version number** like `1.4` or `1.4.0` — if provided, use it exactly.
- The word **"beta"** — if present, mark the release as pre-release.

If no version number is given, auto-increment the patch component (see step 3).

## Steps

### 1. Check git status is clean

Run `git status --porcelain`. If there are uncommitted changes, **stop** and ask the user to commit or discard them before proceeding.

### 2. Determine the last release tag

Run `git fetch origin --tags` to ensure all tags are available, then:

```bash
git tag --sort=-v:refname | head -20
```

Find the most recent `v*` tag (e.g. `v1.3.2`). This is the baseline for the changelog diff.

If no tags exist, use the first commit as the baseline.

### 3. Determine the new version

Parse the current version from the most recent tag (strip the `v` prefix). Split into `major.minor.patch`.

- **If a version was provided in arguments**: use it directly (append `.0` if only `major.minor` was given).
- **If no version was provided**: bump patch by 1.
- Present the chosen version and ask for confirmation. If the user suggests a different version, use that.

### 4. Collect commits since last tag

```bash
git log <last-tag>..HEAD --oneline
```

### 5. Write the changelog entry

Analyze every commit. Group into features, improvements, and bug fixes. Produce **brief, user-facing bullet points**:

- **Style**: short imperative sentences starting with a verb (Add, Fix, Improve, Support, Allow…).
- **Brevity**: one short sentence per bullet, around 80 characters. No implementation details, no commit hashes.
- **Selection**: only changes that matter to users. Skip CI, build infra, submodule bumps, code style, refactors, WIP commits. Collapse many related commits into one or two bullets.
- **Ordering**: features first, then improvements, then bug fixes.
- **Quantity**: 4-12 bullets depending on volume.

### 6. Check for an existing CHANGELOG

Run `ls CHANGELOG.md CHANGELOG.txt changelog.md changelog.txt 2>/dev/null` to detect the changelog file. If one exists, read it to understand the format and prepend the new entry at the top in the same format.

If no changelog exists, create `CHANGELOG.md` with this format:

```
## v<version> (YYYY-MM-DD)

- Bullet one.
- Bullet two.
```

Use today's date (from `date +%Y-%m-%d` or equivalent).

### 7. Check for version files to bump

Detect version files in the repo:

```bash
ls package.json frontend/package.json pyproject.toml backend/pyproject.toml setup.py 2>/dev/null
```

For each found:
- **`package.json`**: update the `"version"` field using `npm version <new-version> --no-git-tag-version` (run from the file's directory).
- **`pyproject.toml`**: update the `version = "..."` line in the `[tool.poetry]` or `[project]` section using the Edit tool.

If no version files are found, skip this step.

### 8. Wait for approval

Tell the user the changelog has been updated and version files bumped. Ask them to review before continuing. **Do NOT proceed until the user explicitly approves.**

### 9. Commit and tag

Stage the changed files:

```bash
git add CHANGELOG.md  # or whichever changelog file was updated
# also add any version files that were bumped
git add package.json frontend/package.json pyproject.toml backend/pyproject.toml 2>/dev/null || true
```

Create the commit:

```bash
git commit -m "$(cat <<'EOF'
Release v<version>

<changelog bullets — copy from the entry, max 72 chars per line, wrap with 2-space indent if needed>
EOF
)"
```

Create the tag:

```bash
git tag v<version>
```

### 10. Done

Run `git log -1` and `git tag --sort=-v:refname | head -5` to confirm success.

Report the new version, commit hash, and tag. Remind the user to push: `git push && git push --tags`.
