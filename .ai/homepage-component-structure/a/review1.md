APPROVED

Review notes:
- `frontend/app/layout.tsx` now exposes the visible homepage order by using each actual section directly.
- `HomePageMain` preserves the previous `<main>` shell and floating try button behavior.
- `HomePageEffects` preserves the smooth anchor scrolling hook from the previous client page.
- The unused `App`, `HomePage`, and `MarketingSections` wrappers were removed so there is no duplicate homepage composition path.
- The old `MarketingSections` catch-all composition was removed to avoid duplicate composition sources.
- `npm run build` completed successfully in `frontend`.
