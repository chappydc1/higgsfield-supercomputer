APPROVED

Review notes:
- The Next.js app files now live under `frontend/`, with `frontend/public/flags` available for static assets.
- `backend/.gitkeep` safely creates the requested backend folder without inventing backend implementation.
- `frontend/src/App.tsx` is now a tiny composition entrypoint, with page-level pieces split under `frontend/src/page`.
- `npm run build` passes from both `frontend/` and the repo root after adding root script delegation and setting `turbopack.root` to the repository root so the existing root-level `node_modules` remains resolvable.
