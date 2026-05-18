---
project: lita-task-sync
---

# Lita Task Sheet Sync

A daily GitHub Actions workflow fetches the published Google Sheets CSV for the Lita task sheet, locates the real header row by scanning for the columns `Task`, `ID`, and `Status`, filters rows to Todo/In Progress/Done statuses, selects a standard set of columns, and commits a clean Markdown snapshot (`lita_task_sheet_snapshot.md`) to the repository root so Lita routines can always read the latest tasks.

## Files

- `scripts/sync_lita_tasks.py` — Python 3.11 script using pandas. Fetches CSV with `header=None` to detect the header row (handles the 5-row stats banner above the table), re-reads with the detected header, filters rows by Status, selects columns, writes snapshot.
- `.github/workflows/sync-lita-tasks.yml` — Runs daily at 07:50 UTC and on manual dispatch. Commits snapshot only when content changed (`[skip ci]` to avoid loops).
- `lita_task_sheet_snapshot.md` — Generated artifact at repo root.

## Column contract

Desired columns (kept only if present): Version, Project, Applicant/Admin, Sub Category, Task, ID, Assignee, Checker, Status, Priority, Deadline, Link to Proof.

## Sheet layout

The Tickets tab has summary stats in rows 1–4, an empty spacer at row 5, real headers at row 6, and task rows starting at row 7. The script auto-detects the header row by scanning the first 20 rows for one that contains all of `Task`, `ID`, and `Status`. If no such row is found, the script raises with a clear error.
