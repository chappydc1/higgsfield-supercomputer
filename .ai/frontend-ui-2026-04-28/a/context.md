# Context: Frontend UI — 2026-04-28

## Task Description

Ship all frontend UI changes from 2026-04-28: dashboard icon updates, QA page redesign, Inter font global enforcement, and applicants page overhaul.

## PRs & Commits

| PR | Description |
|----|-------------|
| #94 | Replace triangle trend arrows with Phosphor ArrowUpRight icons on dashboard |
| #98 | Redesign QA page as horizontal list rows |
| #97 | Display report metadata as vertical key-value list |
| #96 | Set Inter font directly on universal selector |
| #93 | Force Inter font inheritance on all elements |
| #92 | Rename CI Reports → QA, clickable card, Inter font, remove button arrow |
| — | Redesign /applicants: replace Affluence with Permit No., add filters, Export CSV |
| — | Add date range filter UI to applicants page |
| — | Remove Recent Activity / Process Queue SVG from applicants page |
| — | Fix action bar layout, remove Beamer widget, fix calendar week start |

## Key Files

- Dashboard trend component — replaced triangle SVGs with `<ArrowUpRight>` from Phosphor
- QA/CI index page — horizontal list layout, vertical key-value metadata rows
- Global CSS / layout — `* { font-family: Inter }` universal selector
- `/applicants` page — Permit No. column, date range filter, Export CSV button
- Action bar — layout fixed; Beamer script removed

## Build Info

- `next build` inside `frontend/`
- Validation: `powershell -ExecutionPolicy Bypass -File .\validate.ps1 -FrontendOnly`
