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

Verified by the `seo` suite in `npm run verify`, which runs the real module against
a minimal fake document.

### Prerendering (the fix for the scraper problem)

`npm run build:seo` (= `build` then `prerender`) writes a real HTML file per public route with
that route's metadata already in the markup, plus `sitemap.xml` and `robots.txt`. That's what
makes shared product links preview correctly — the runtime tags above never reach a scraper.

It needs the Data Gateway at build time, using the same `VITE_BLOCKS_*` config the app builds
with, plus `VITE_SITE_ORIGIN` for canonical URLs. Catalog reads are Public so no session is
needed. **It fails loudly** — an empty catalog or a missing origin aborts rather than emitting
a site with no product pages, because that deploy would look fine while every shared link
stayed broken.

**Hosting matters here.** These are real files at real paths, so the host must serve
`/product/oak-chair` from `product/oak-chair/index.html` *before* any SPA catch-all rewrite. A
catch-all that runs first serves the generic `index.html` and undoes the whole step.

`scripts/prerender/head.mjs` holds the pure part (head building, injection, sitemap) and is
covered by the `prerender` suite in `npm run verify`.

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
npm run verify
```

<!-- blocks-skills:start -->
## SELISE Blocks

These rules govern Blocks work in this repo. Skills are vendored at `.codex/skills/<name>/SKILL.md`
(Claude Code discovers the same set via `.claude/skills/`). Read the vendored copy directly; there is
no CLI command that serves a skill. Re-vendor with BOOTSTRAP.md.

<!-- Everything between these markers is what BOOTSTRAP.md vendors into consumer repos.
     Keep it free of anything true only of this repo or only of a given checkout. -->

## Routing is your job, not the user's

**Never expect the user to name a skill.** There is no `/skill` invocation, no slash command, no menu. Users describe what they want in plain language — "let users upload a profile picture", "why does login redirect back to the login page", "add German translations" — and **you** map that to the right skill and execute it.

- Do **not** ask "which skill should I use?" or list skills for the user to pick from. Reading the request and choosing is your work.
- Do **not** wait to be told. Once the request matches a row in the routing table, load that skill and proceed.
- If the request genuinely spans several skills, pick the one that owns the *first* concrete step, run it, then move to the next. Sequence them yourself.
- If nothing matches, check the vendored skill directories on disk before concluding no skill applies — the table below can lag the vendored set. The published catalog is [`blocks-cli/blocks-skills/`](https://github.com/SELISEdigitalplatforms/blocks-cli/tree/main/blocks-skills).
- Ask the user only about things the routing table cannot settle: a destructive confirmation, a missing credential, or an ambiguous *goal* — never about which skill to run.

The routing table exists so you can decide unaided. Treat a request that names no skill as the normal case, because it is.

## Workflow

1. Understand the objective.
2. If login/project/app state is unknown, probe (below) and start with **`blocks-bootstrap`**.
3. Match the request against the **Skill routing table** yourself, then load the skill by reading its vendored `SKILL.md` (see **Loading a skill** below).
4. Inspect the existing implementation before changing it.
5. Make the smallest correct change, then verify it.

## Prerequisites

The `blocks` CLI is required for terminal/admin work:

```bash
npm install -g @seliseblocks/cli-os@latest
blocks --version
```

**Do not install it automatically.** If `blocks --version` fails, ask first. The SDK for app code is `npm install @seliseblocks/client@latest`.

Read-only probe when state is unknown:

```bash
blocks --version
blocks auth status --json
blocks doctor --json
```

If `blocks` is missing, stop the probe and ask before installing. Don't claim bootstrap is runnable until the CLI exists.

**Never guess a command or a flag — ask the CLI.** `blocks help <command>` prints one command's exact positionals, flags, scope, and whether it mutates; `blocks help <family>` lists a family; `blocks --help --json` lists every command. Read that before running anything unfamiliar, and prefer it over any command spelling you remember, including one from this file. Set `BLOCKS_STRICT_FLAGS=1` in scripted runs so an unrecognized flag hard-fails instead of being warned and ignored.

## Loading a skill

**Skills are vendored files, not a CLI command.** They live on disk as `.codex/skills/<name>/SKILL.md`, with Claude Code discovering the same set through `.claude/skills/`. Read the vendored copy directly.

There is **no `blocks skill list`/`show`/`add`**, and the package does not bundle the skill tree. Don't reach for those commands, and don't treat their absence as a broken install.

If a skill named in the routing table isn't vendored here, the fix is to re-run the vendoring runbook (`BOOTSTRAP.md` in this repo's source) — not to fetch the file ad hoc or write a replacement from memory. The published catalog is [`blocks-cli/blocks-skills/`](https://github.com/SELISEdigitalplatforms/blocks-cli/tree/main/blocks-skills); read from there only to confirm a name, never as a substitute for vendoring.

## Hard rules

- **Never raw `fetch`/`curl` against `api.seliseblocks.com`.** Use the `blocks` CLI or the `@seliseblocks/client` SDK. Every skill states which surface it uses. Bypassing them with raw HTTP is the failure mode these skills exist to prevent.
- **`--dry-run` before `--yes`** on every mutating CLI command. Get human confirmation before destructive or cloud-mutating operations.
- **Never read the CLI's local storage files** (config/token/secret files on disk) or print anything inside them — client ids, root tenant id, account names, tokens. Interact only through `blocks` commands. To repair broken state use `blocks login`, `blocks auth remove <account>`, `blocks projects list --json`, `blocks use <tenantId>`.
- **`blocks projects create` accepts the Blocks terms on the user's behalf** (`isAcceptBlocksTerms`, `isUseBlocksExclusively`). Never run it without explicit consent to that, and never to "try something" — it provisions real cloud tenancy. Run `--dry-run --json` first, then `--yes` only after approval. It creates exactly one app in the `dev` environment; further environments are portal-only.
- **Never expose secrets or credentials.** The former generic `blocks secrets` commands were removed because their backing API no longer accepts the CLI's authentication mode; do not work around their absence with raw HTTP.
- **Don't attribute work to an AI tool** anywhere in this repo — no assistant names in docs, comments, or commit messages.

## Skill routing table

Surface: **CLI** = terminal/admin, project-scoped · **SDK** = `@seliseblocks/client` in app code · **Both** = each surface covers part of the job.

### Start here

| Skill | Use when | Surface |
|---|---|---|
| `blocks-bootstrap` | New user, or `not_logged_in` / `project_not_selected`. Detects state via `blocks auth status --json` / `doctor --json`, closes install/login/project gaps, resolves the app OIDC client, scaffolds with `blocks new web`, and runs `blocks init` inside the app dir only when the work needs project-local Blocks files. **Run before any other skill when state is unknown.** | CLI |

### Data

| Skill | Use when | Surface |
|---|---|---|
| `blocks-data-gateway-configuration` | Defining, editing, securing, validating, or reloading the **data model** — schema fields, access policies, validation rules. `data config/schema/rules/validation/reload`, or the composed `data sync`. | CLI |
| `blocks-data-gateway-crud` | Reading or writing **actual records** through a Data schema from app code. `data.collection(name)` for per-item CRUD, `data.graphql()` for joins/custom shapes. | SDK |
| `blocks-data-storage` | File and document features: upload/download, directory trees, paginated browse/search, versions, rename/move/copy, trash/restore, sharing, ACLs, inheritance. | Both |
| `blocks-storage-configuration` | Choosing/rotating which **provider** backs the file tree (Azure Blob, S3-compatible, local/SFTP) — hosts, credentials, region/endpoint, strategy. Not file operations. | CLI |

### IAM

| Skill | Use when | Surface |
|---|---|---|
| `blocks-iam-account` | The signed-in user's **own** account: activation, forgot/reset/change password, logout(-all), profile bootstrap (`iam.me`/`updateMe`), signup, login-options discovery. | SDK |
| `blocks-iam-users` | Managing **other** users: invite, edit, activate/deactivate, list/search, grant/revoke roles and org access. | Both |
| `blocks-iam-access-control` | RBAC. Two facets: read-only feature-gating by the current user's roles/permissions (common, safe), and creating/editing role & permission definitions (sensitive, human-confirmed only). | Both |
| `blocks-iam-organizations` | Multi-tenant workspaces: org switcher, switching active org context (SDK-only), public signup policy, and — human-confirmed — creating/editing orgs and signup config. | Both |
| `blocks-iam-mfa` | Self-service MFA for the signed-in user (TOTP enroll/verify, OTP, method switch, disable, backup codes) plus tenant-wide MFA **policy** admin. Not admin-forcing MFA onto another user. | Both |
| `blocks-iam-sso-oidc-configuration` | **Enabling** SSO: register an OIDC client and identity provider. Portal remains a valid alternative, especially for federated providers (Google/Azure/Okta). Not `blocks login` — that's the CLI's own login. | CLI |
| `blocks-iam-sso-oidc-implementation` | Extending or debugging the hosted login flow the scaffold already ships: `redirectToProvider` → `/login/callback` → session, `AuthProvider`, `RequireAuth` guards, token refresh, redirect loops, sessions that don't stick. | SDK |

### Localization

| Skill | Use when | Surface |
|---|---|---|
| `blocks-localization-configuration` | **Authoring** translations: local i18n JSON dictionaries, validate/push/pull, languages and modules, glossary terms, AI translation suggestions. | CLI |
| `blocks-localization-implementation` | **Consuming** translations at runtime: language/module discovery, loading dictionaries, `t()` lookup, a language switcher that reloads and re-renders. | SDK |

### Messaging

| Skill | Use when | Surface |
|---|---|---|
| `blocks-mail` | Transactional email — `mail.send()`/`sendToAny()` from app code, or administering SMTP/inbound config, templates, and mailbox history. | Both |
| `blocks-notifier` | **Sending** real-time/offline notifications and managing a user's own notification inbox (notify, list, unread, mark-read). | Both |
| `blocks-notification` | **Configuring** tenant notification *channels* — a different backing service from `notifier`, and not for sending. No SDK path exists. | CLI |

### Platform operations

| Skill | Use when | Surface |
|---|---|---|
| `blocks-release-deployment` | Triggering and inspecting Release builds/deploys: `release deploy`, `release status`, `builds get/list`. Triggers a configured pipeline only — no artifact upload. | CLI |

### Local development

| Skill | Use when | Surface |
|---|---|---|
| `blocks-frontend-local-https` | Running a scaffolded app over HTTPS on its real project domain — required for hosted login, since plain HTTP and `localhost` never receive the session cookie. Covers `npm run cert`, trusting the cert, the hosts entry, and "SSO cookie not set" / Vite "Blocked request" errors. | Scaffold |

### Routing notes

- **Own account vs. other users vs. role definitions** — `blocks-iam-account` / `blocks-iam-users` / `blocks-iam-access-control`. Pick by whose record changes.
- **Configuration vs. implementation** — most areas split in two: a CLI skill that defines the thing and an SDK skill that consumes it at runtime. "Create a schema" is configuration; "fetch products" is implementation.
- **`notifier` sends, `notification` configures.** Different services.
- **`blocks-data-storage` operates on files; `blocks-storage-configuration` chooses the provider underneath.**
- Dependencies: schema work must be reloaded before CRUD sees it; SSO implementation needs a registered OIDC client and HTTPS on the real domain to test.

<!-- blocks-skills:end -->
