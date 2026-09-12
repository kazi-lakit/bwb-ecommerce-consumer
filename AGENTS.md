# Ecommerce consumer storefront

This is a Vite + React 19 single-page application — the public, customer-facing
storefront in the "bwb" Blocks project, sibling to `ecommerce-back-office` (which
manages the catalog/inventory data this app reads). Structured the same way as
`ecommerce-back-office`: React Router for navigation and the Blocks SDK/cookie-backed
OIDC flow in `src/lib/blocks/`. Do not add a local authentication backend or persist
Blocks tokens in browser storage.

Access-token expiry is handled by `onUnauthorized` on the SDK instance in
`src/lib/blocks/client.ts`, exactly as in `ecommerce-back-office` — see that repo's
AGENTS.md for the full explanation of the refresh flow; it applies unchanged here.

## Data model

Product/Category/Brand/ProductVariant reads are **Public** on the Data Gateway, so
every browsing page (`/`, `/products`, `/product/:slug`) renders with no session
required. `src/lib/blocks/schema-meta.ts` is generated the same way as in
`ecommerce-back-office` (`node scripts/gen-schema-meta.mjs`, sourced from
`../ECOMMERCE_INVENTORY_SCHEMAS.json`) — do not hand-edit it.

**Cart, Order, and CommerceCustomer have real code against a drafted (not yet imported)
schema — see `COMMERCE_SCHEMAS_DRAFT.json`/`.md` and `P0_POLICY_FIXES.json`/`.md` at the
workspace root.** Everything below is gated behind `VITE_COMMERCE_SCHEMAS_LIVE`
(`import.meta.env`, checked via the shared `COMMERCE_SCHEMAS_LIVE` constant in
`src/lib/blocks/commerce.ts`), **off by default** — until that draft is imported and the flag
is set to `"true"` in `.env.local`/`.env.dev`, every one of these still behaves exactly as
described in the "off" column below:

| Concern | Off (today's default) | On (after import) |
|---|---|---|
| Cart | `localStorage` only, guest-only, per-browser | Still `localStorage`-backed (instant load, guest-friendly), **additionally** synced to a server `Cart` record for signed-in customers — fetched-and-merged once per session, kept in sync via debounced create/update. See `cart-provider.tsx` + `commerce.ts`'s `getActiveCart`/`createRemoteCart`/`updateRemoteCart`. |
| Checkout order placement | Simulated (`setTimeout`, no persisted record) | Real `insertOrder` mutation with price/tax/discount snapshots and a retry-safe idempotency key. See `CheckoutPage.tsx`'s `placeOrder()` + `commerce.ts`'s `placeOrder()`. |
| Commerce profile | None | Auto-created/read on first login (`CommerceCustomerProvider`, wraps the app in `providers.tsx`); used to prefill and optionally save the checkout address (`commerce.ts`'s `ensureCommerceCustomer`/`addCustomerAddress`). |

**Wishlist and coupons are still client-side only, unchanged:**
- `src/components/providers/wishlist-provider.tsx` — `localStorage`, guest-only.
- `src/lib/coupons.ts` — a small hardcoded demo coupon list (`SAVE10`, `FLAT50`).

All of the Commerce-schema code above is self-contained hand-written GraphQL in
`src/lib/blocks/commerce.ts` — deliberately **not** using `createEntityApi`/`schema-meta.ts`
(those don't know about `Cart`/`Order`/`CommerceCustomer` until the export JSON is updated and
regenerated, which should only happen *after* the schemas are actually live — see
`COMMERCE_SCHEMAS_DRAFT.md` for why). This means the code works immediately once the schema is
imported and reloaded, with no separate regeneration step required for these three flows.

## Routes

Public by default; `/checkout` and everything under `/account` require a session:

```
/                         HomePage                  hero, category rails, "pick your category"
/products                 ProductListingPage        filterable/sortable grid; ?category=, ?brand=, ?q=
/product/:slug            ProductDetailPage
/brands                   BrandListingPage
/brand/:slug              BrandDetailPage
/cart                     CartPage
/checkout                 CheckoutPage              auth-gated
/order-confirmation       OrderConfirmationPage
/wishlist                 WishlistPage
/account                  →  /account/orders
/account/orders           AccountOrdersPage         auth-gated
/account/orders/:orderId  AccountOrderDetailPage    auth-gated
/account/addresses        AccountAddressesPage      auth-gated
/account/profile          AccountProfilePage        auth-gated
/login/callback           AuthCallbackPage
```

`/account/*` is gated by `components/providers/require-auth.tsx`, which shows a sign-in prompt
rather than redirecting straight into the hosted SSO flow the way the backoffice does — this is
a public storefront, and someone arriving from a bookmark should be told where they are first.
That gate is a convenience, not the security boundary: `Order`'s row-level policy restricts
reads to the customer's own records regardless of what the client does.

The account pages read real data only when `VITE_COMMERCE_SCHEMAS_LIVE` is on; otherwise each
explains what it's waiting for. Profile is read-only on purpose — name, email and phone live in
IAM, and deciding which of those a customer may change about themselves isn't a call to make as
a side effect of building an account page.

## SEO

`src/lib/seo.ts` — `usePageMeta` sets title, description, canonical, Open Graph and JSON-LD
per page and undoes it on unmount (so leaving `/checkout` can't leave the next page marked
`noindex`). Product pages emit schema.org `Product` + `BreadcrumbList`; cart, checkout,
wishlist and every `/account` page are `noindex`; `/products?q=` is `noindex` with a canonical
that drops the query string, so search-result permutations don't compete with the catalog.

**Be clear about the ceiling.** This is a client-rendered SPA: a crawler receives `index.html`
and everything above is applied afterwards by JavaScript. Googlebot renders JS, so this is
worth doing. **Most social scrapers don't** — Facebook, LinkedIn, Slack, WhatsApp and X read
the raw HTML and never run the app, so per-product link previews do **not** work; every shared
URL falls back to the baseline Open Graph tags in `index.html`. Fixing that needs the tags to
be in the HTML already, i.e. prerendering at build time (compatible with the no-new-backend
constraint — it's a build step, not a service) or SSR. Tracked as a follow-up, not half-done.

Verified by the `seo` suite in `npm run verify:inventory`, which runs the real module against
a minimal fake document.

## Listing pagination

`/products` uses `useEntityInfiniteList` (in `lib/blocks/hooks.ts`) — pages of 24 that
**accumulate**, not numbered pages. That's forced by where the filtering happens: facets come
from embedded `Attributes` arrays the gateway can't filter on, price comes from variants, sort
has no confirmed input type (see `collections.ts`'s HC0017 note), and the stock filter reads a
different schema entirely. All of it is client-side, so numbered pages would mean facets
describing only the page you happen to be on, and a filter hiding most of page 2 while page 3
sits unexamined.

Accumulating keeps every client-side filter over one growing set, and the footer states
`loaded` against `totalCount` so the page never implies the catalog is 24 items long. When
filters match nothing in what's loaded but more pages exist, it says so rather than claiming
nothing matches.

Variants are fetched scoped to the loaded products (`ProductId: { in: [...] }`) rather than
the whole catalog — that unbounded fetch, not the product cap, was the real scaling problem
here.

## Feature-flagged schema code

Cart/Order/CommerceCustomer (`lib/blocks/commerce.ts`) and the inventory reserve/release path
(`lib/blocks/inventory-ops.ts`, `lib/blocks/checkout-inventory.ts`) are written against Data
Gateway schemas and policies that aren't live yet, so both sit behind env flags, off by default:

| Flag | Turns on | Blocked on |
|---|---|---|
| `VITE_COMMERCE_SCHEMAS_LIVE` | server cart, real order placement, commerce customer profile | importing `COMMERCE_SCHEMAS_DRAFT.json` |
| `VITE_INVENTORY_WRITES_LIVE` | stock reservation at checkout | importing `P0_POLICY_FIXES.json` — `WarehouseInventory` writes are denied for **everyone** today, admins included |

**A plain `npm run build` does not compile these paths.** With the flags off, `placeOrder()`
returns early and Rollup dead-code-eliminates everything downstream — `commerce.ts` and the
inventory modules disappear from the bundle entirely (which is the right outcome for
production: no dead weight shipped). It does mean a green build proves nothing about the
flagged code. `tsc -b`/`eslint` always cover it; to check it actually bundles:

```bash
VITE_COMMERCE_SCHEMAS_LIVE=true VITE_INVENTORY_WRITES_LIVE=true npm run build
```

And to exercise the inventory logic against a simulated Data Gateway:

```bash
npm run verify:inventory
```
