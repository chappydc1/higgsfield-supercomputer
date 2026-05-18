Status: complete
Phases: 3
Assessed: yes

1. Refactor App Router ownership.
   - Make `frontend/app/layout.tsx` render global shell plus `{children}`.
   - Move existing homepage section composition into `frontend/app/page.tsx`.

2. Add commerce pages.
   - Create shared product collection data for best sellers.
   - Create `/products/gruns-superfood-gummies` as a focused PDP using existing product gallery/details sections and supporting page bands.
   - Create `/collections/best-sellers` as a shoppable collection grid linking to the PDP.

3. Wire navigation and validate.
   - Link Best Sellers header CTA/cards to the collection/PDP routes.
   - Run the frontend build.
   - Record validation results.

Validation:
- `npm run build` passed. Next generated static routes for `/`, `/_not-found`, `/collections/best-sellers`, and `/products/gruns-superfood-gummies`.
- `npm run start -- -p 3104` served the production build.
- `curl -s http://127.0.0.1:3104/collections/best-sellers --output /private/tmp/chappy-best-sellers.html` returned HTML containing `Best Sellers | chappy` and collection content.
- `curl -s http://127.0.0.1:3104/products/gruns-superfood-gummies --output /private/tmp/chappy-product.html` returned HTML containing `Gruns Superfood Gummies | chappy`, product content, and `buybox`.
- Browser plugin checks were attempted, but the in-app browser blocked local URLs with `net::ERR_BLOCKED_BY_CLIENT`; server-rendered HTTP checks were used instead.

