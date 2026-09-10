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

**Cart, Wishlist, and Coupon have no Blocks schema yet.** They're implemented
client-side only:

- `src/components/providers/cart-provider.tsx` — cart persisted to `localStorage`
  (guest-only, per-browser, not per-customer).
- `src/components/providers/wishlist-provider.tsx` — same pattern for wishlisted
  product ids.
- `src/lib/coupons.ts` — a small hardcoded demo coupon list (`SAVE10`, `FLAT50`).

Each file says in a comment what to swap in once a real schema exists
(`useEntityList`/`useEntityMutations` against `Cart`/`Wishlist`/`Coupon` — the same
generic hooks `Product`/`Category`/`Brand` already use). Checkout does not persist an
`Order` record either — `CheckoutPage.tsx`'s `placeOrder()` simulates placement and
routes to `/order-confirmation`; wire a real `Order` schema + mutation there once one
exists. Checkout still requires the customer to be logged in (via the same Blocks
OIDC flow), since an eventual `Order`/`Cart` schema will need an owner to scope
row-level access to.

## Routes

Flat, all public except `/checkout` (redirects to hosted login if signed out):

```
/                    HomePage             hero, category rails, "pick your category"
/products            ProductListingPage   filterable/sortable grid
/product/:slug       ProductDetailPage
/cart                CartPage
/checkout            CheckoutPage
/order-confirmation  OrderConfirmationPage
/wishlist            WishlistPage
/login/callback      AuthCallbackPage
```
