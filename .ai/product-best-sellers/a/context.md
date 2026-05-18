Task: create product page and best seller collection page.

Repo context:
- Workspace root: `/Users/chappy/Downloads/old/chappy2/coding/ecom-medusa/templates/stores/chappy`
- Frontend app: `/Users/chappy/Downloads/old/chappy2/coding/ecom-medusa/templates/stores/chappy/frontend`
- Next.js App Router files currently live under `/Users/chappy/Downloads/old/chappy2/coding/ecom-medusa/templates/stores/chappy/frontend/app`.
- `frontend/app/layout.tsx` currently renders the entire homepage composition and imports global shell components such as `StickyHeader`, `FooterSection`, `CartLayer`, `NutritionModals`, `PageSupportWidgets`, and `PageEmbeds`.
- `frontend/app/page.tsx` currently returns `null`; homepage content is therefore coming from layout and would incorrectly appear on every route.
- Existing shoppable/product sections include:
  - `frontend/src/sections/ProductGrid/index.tsx`
  - `frontend/src/sections/LimitedOffer/index.tsx`
  - `frontend/src/sections/LimitedOffer/components/ProductGalleryDesktop.tsx`
  - `frontend/src/sections/LimitedOffer/components/ProductDetailsDesktop.tsx`
  - `frontend/src/sections/ProductShowcase/index.tsx` (hidden wrapper)
- Navigation currently has a Best Sellers mega menu in `frontend/src/sections/Header/components/Navigation.tsx`, but its "Shop Best Sellers" call-to-action is a non-link `div`.
- Styling uses Tailwind classes with configured fonts in `frontend/tailwind.config.js` and global CSS in `frontend/tailwind.css`.

Implementation notes:
- Refactor layout so it accepts `children` and only renders shared shell.
- Move the existing homepage section composition into `frontend/app/page.tsx`.
- Add a product page at `/products/gruns-superfood-gummies`.
- Add a best-seller collection page at `/collections/best-sellers`.
- Keep changes scoped to frontend route/component files and existing navigation links.

