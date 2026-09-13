/**
 * Writes a real HTML file for every public route, with that route's own metadata already in
 * the markup.
 *
 * Why this exists: `src/lib/seo.ts` sets per-page tags at runtime, which Googlebot honours
 * because it runs JavaScript. Facebook, LinkedIn, Slack, WhatsApp and X do not — they read the
 * raw HTTP response. Without this step every shared product link previews as the generic site
 * title, and no amount of client-side Open Graph changes that.
 *
 *     npm run build && npm run prerender     (or: npm run build:seo)
 *
 * It needs the Data Gateway at build time, using the same VITE_BLOCKS_* variables the app
 * uses. Catalog reads are Public, so no session is required — only the project key.
 *
 * **It fails loudly.** A prerender that quietly emitted a site with no product pages would be
 * worse than not running: the deploy would look fine and every shared link would stay broken.
 *
 * Hosting note: these are real files at real paths, so the host must serve
 * `/product/oak-chair` from `product/oak-chair/index.html` **before** falling back to the SPA
 * rewrite. A catch-all rewrite that runs first will serve the generic index.html and undo all
 * of this. The app still hydrates and takes over normally once loaded.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHead, buildRobots, buildSitemap, injectHead, metaDescription } from "./head.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const dist = join(root, "dist");

function env(name, fallback) {
  const value = process.env[name] ?? readEnvFile()[name];
  if (value === undefined && fallback === undefined) {
    throw new Error(`${name} is not set — prerendering needs the same VITE_BLOCKS_* config the app builds with.`);
  }
  return value ?? fallback;
}

let cachedEnv;
function readEnvFile() {
  if (cachedEnv) return cachedEnv;
  cachedEnv = {};
  for (const name of [".env", ".env.local"]) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) cachedEnv[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return cachedEnv;
}

async function gql(query, variables) {
  const response = await fetch(`${env("VITE_BLOCKS_API_URL")}/graphql/v1/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-blocks-key": env("VITE_BLOCKS_PROJECT_KEY") },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Data Gateway returned ${response.status} ${response.statusText}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data;
}

const PRODUCTS = `query getProducts($paging: PaginationInput) {
  getProducts(paging: $paging) {
    items { ItemId Name Slug ShortDescription LongDescription Status LastUpdatedDate Media { Url IsPrimary } }
    totalCount
  }
}`;

const BRANDS = `query getBrands($paging: PaginationInput) {
  getBrands(paging: $paging) { items { ItemId Name Slug Description LogoUrl Status LastUpdatedDate } totalCount }
}`;

async function fetchAll(query, field) {
  const items = [];
  for (let pageNo = 1; pageNo <= 50; pageNo += 1) {
    const data = await gql(query, { paging: { pageNo, pageSize: 200 } });
    const page = data[field];
    items.push(...(page.items ?? []));
    if (items.length >= (page.totalCount ?? 0) || (page.items ?? []).length === 0) break;
  }
  return items;
}

function write(routePath, html) {
  const target = routePath === "/" ? join(dist, "index.html") : join(dist, routePath.replace(/^\//, ""), "index.html");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

async function main() {
  const origin = (env("VITE_SITE_ORIGIN", env("VITE_BLOCKS_APP_DOMAIN", "")) || "").replace(/\/$/, "");
  if (!origin) {
    throw new Error("Set VITE_SITE_ORIGIN to the public site origin (e.g. https://shop.example.com) — canonical URLs and the sitemap need it.");
  }
  const template = readFileSync(join(dist, "index.html"), "utf8");

  // Clear the route directories this script owns before rewriting them. `vite build` leaves
  // them in place, so without this a product deleted from the catalog keeps its page — a URL
  // that stays crawlable and shareable long after the product is gone. Only directories this
  // script creates are removed; `assets/` and anything else in dist is untouched.
  for (const owned of ["product", "brand", "products", "brands"]) {
    rmSync(join(dist, owned), { recursive: true, force: true });
  }
  const siteName = "Logoipsum";

  const [products, brands] = await Promise.all([fetchAll(PRODUCTS, "getProducts"), fetchAll(BRANDS, "getBrands")]);
  if (products.length === 0) {
    throw new Error("The Data Gateway returned no products. Refusing to emit a catalog-less prerender.");
  }

  const urls = [];
  const page = (routePath, meta, changefreq, lastmod) => {
    const canonical = `${origin}${routePath}`;
    write(routePath, injectHead(template, buildHead({ ...meta, canonical })));
    urls.push({ loc: canonical, changefreq, lastmod });
  };

  page("/", {
    title: `${siteName} — Decorate your Space with Us`,
    description: "Furniture and home decor, chosen well. Browse by room, brand or style.",
  }, "daily");

  page("/products", {
    title: `All Products — ${siteName}`,
    description: "Browse everything we stock — furniture and home decor.",
  }, "daily");

  page("/brands", {
    title: `Brands — ${siteName}`,
    description: "Every brand we stock, in one place.",
  }, "weekly");

  let skipped = 0;
  for (const product of products) {
    if (!product.Slug) { skipped += 1; continue; }
    if (product.Status && product.Status !== "active" && product.Status !== "published") { skipped += 1; continue; }
    const image = (product.Media ?? []).find((m) => m.IsPrimary)?.Url ?? (product.Media ?? [])[0]?.Url;
    const canonical = `${origin}/product/${product.Slug}`;
    page(`/product/${product.Slug}`, {
      title: `${product.Name} — ${siteName}`,
      description: metaDescription(product.ShortDescription || product.LongDescription, `Buy ${product.Name} at ${siteName}.`),
      image,
      type: "product",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.Name,
        ...(product.ShortDescription ? { description: product.ShortDescription } : {}),
        ...(image ? { image } : {}),
        // No price or availability here: both change far faster than the site is rebuilt, and
        // a stale price in a search result is worse than no price at all. The runtime JSON-LD
        // in src/lib/seo.ts carries them for crawlers that execute JavaScript.
        offers: { "@type": "Offer", url: canonical },
      },
    }, "weekly", product.LastUpdatedDate);
  }

  for (const brand of brands) {
    if (!brand.Slug || brand.Status === "inactive") { skipped += 1; continue; }
    page(`/brand/${brand.Slug}`, {
      title: `${brand.Name} — ${siteName}`,
      description: metaDescription(brand.Description, `Shop ${brand.Name} at ${siteName}.`),
      image: brand.LogoUrl || undefined,
    }, "weekly", brand.LastUpdatedDate);
  }

  writeFileSync(join(dist, "sitemap.xml"), buildSitemap(urls));
  writeFileSync(join(dist, "robots.txt"), buildRobots(origin));

  console.log(`Prerendered ${urls.length} pages (${products.length} products, ${brands.length} brands${skipped ? `, ${skipped} skipped` : ""}).`);
  console.log("Wrote sitemap.xml and robots.txt.");
  console.log("Host must serve these files before any SPA catch-all rewrite — see the note at the top of this script.");
}

main().catch((error) => {
  console.error(`\nPrerender failed: ${error.message}\n`);
  process.exit(1);
});
