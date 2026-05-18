Task: create a clearer frontend/backend structure and make the landing page sections easier to edit.

Current repo findings:
- `package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.mjs`, `tailwind.css`, `next-env.d.ts`, `app/`, `src/`, and `flags/` are at repo root.
- `app/page.tsx` imports `App` from `@/App`.
- `src/App.tsx` is a large client component that imports editable content sections from `src/sections/*` and global widgets from `src/components/*`.
- Most marketing sections are already separate components under `src/sections`, but the page-level accessibility chrome, floating CTA, modal stack, cart layer, and support/widget embeds are still embedded directly in `src/App.tsx`.
- No backend implementation exists yet.

Implementation direction:
- Move the Next.js app into `frontend/` so `frontend/app`, `frontend/src`, and `frontend/public` match conventional Next.js structure.
- Move `flags/` into `frontend/public/flags`.
- Add `backend/.gitkeep` as a safe placeholder for backend code.
- Replace the monolithic `App` with page composition components under `frontend/src/page`.

