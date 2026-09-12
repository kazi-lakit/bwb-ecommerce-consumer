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
