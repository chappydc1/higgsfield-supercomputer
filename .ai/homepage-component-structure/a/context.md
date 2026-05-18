Task: Refactor the storefront homepage so each homepage section is used directly in `frontend/app/layout.tsx` and the page structure is easier to read.

Relevant files:
- `frontend/app/layout.tsx` owns the root document shell and visible homepage composition.
- `frontend/src/App.tsx`, `frontend/src/page/HomePage.tsx`, and `frontend/src/page/components/MarketingSections.tsx` previously provided an extra homepage composition layer and are no longer needed.
- `frontend/src/page/components/MarketingSections.tsx` currently imports and renders all visible marketing sections in order.
- Existing section implementations live under `frontend/src/sections/*/index.tsx`.
- `frontend/src/page/components/FloatingTryButton.tsx` is part of the main marketing content shell.

Implementation notes:
- Keep the visual order and classes unchanged.
- Avoid moving section implementation internals.
- `frontend/app/layout.tsx` should be the readable place where each actual section is used, similar to the parent layout/provider composition pattern.
- Remove the unused wrapper entrypoints so the layout remains the single homepage structure.
