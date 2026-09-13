/**
 * Pure helpers for the prerender step: build head tags, splice them into the built
 * `index.html`, and emit a sitemap.
 *
 * Separate from the script that fetches and writes, so the part with actual rules in it can be
 * exercised without network access or credentials.
 */

/** Escapes for an HTML attribute value. Product names contain quotes and ampersands. */
export function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes for text content — the title element, and nothing else here. */
export function escapeText(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * JSON-LD goes inside a `<script>`, where the parser looks for `</script` before it looks for
 * JSON. A product description containing that sequence would end the script element early and
 * spill markup into the page, so the sequence is broken with an escape the JSON parser
 * ignores but the HTML parser doesn't recognise as a close tag.
 */
export function safeJsonLd(value) {
  return JSON.stringify(value).replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\u0021--");
}

const MARK_OPEN = "<!-- prerendered:head -->";
const MARK_CLOSE = "<!-- /prerendered:head -->";

/**
 * @param {{
 *   title: string,
 *   canonical: string,
 *   description?: string,
 *   image?: string,
 *   type?: string,
 *   jsonLd?: unknown,
 * }} meta
 * @returns {string}
 */
export function buildHead({ title, description, canonical, image, type = "website", jsonLd }) {
  const tags = [
    `<title>${escapeText(title)}</title>`,
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
  ];
  if (description) tags.push(`<meta name="description" content="${escapeAttr(description)}" />`);
  tags.push(`<meta property="og:title" content="${escapeAttr(title)}" />`);
  tags.push(`<meta property="og:type" content="${escapeAttr(type)}" />`);
  tags.push(`<meta property="og:url" content="${escapeAttr(canonical)}" />`);
  if (description) tags.push(`<meta property="og:description" content="${escapeAttr(description)}" />`);
  if (image) tags.push(`<meta property="og:image" content="${escapeAttr(image)}" />`);
  tags.push(`<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`);
  if (jsonLd) tags.push(`<script type="application/ld+json">${safeJsonLd(jsonLd)}</script>`);
  return `${MARK_OPEN}\n    ${tags.join("\n    ")}\n    ${MARK_CLOSE}`;
}

/**
 * Splices the head block into a built `index.html`.
 *
 * The baseline `<title>` and the Open Graph tags the template ships are removed first —
 * leaving two of either is worse than having none, since which one a scraper believes is
 * arbitrary. Running this twice on the same file produces the same result, because the block
 * is delimited and replaced rather than appended.
 */
/**
 * @param {string} html
 * @param {string} headBlock
 * @returns {string}
 */
export function injectHead(html, headBlock) {
  let out = html;

  const existing = new RegExp(`${MARK_OPEN}[\\s\\S]*?${MARK_CLOSE}`);
  if (existing.test(out)) return out.replace(existing, headBlock);

  out = out.replace(/\s*<title>[\s\S]*?<\/title>/i, "");
  out = out.replace(/\s*<meta\s+name=["']description["'][^>]*>/gi, "");
  out = out.replace(/\s*<meta\s+property=["']og:(?:title|type|url|description|image)["'][^>]*>/gi, "");
  out = out.replace(/\s*<meta\s+name=["']twitter:card["'][^>]*>/gi, "");
  out = out.replace(/\s*<link\s+rel=["']canonical["'][^>]*>/gi, "");

  if (!out.includes("</head>")) throw new Error("index.html has no </head> to inject into");
  return out.replace("</head>", `    ${headBlock}\n  </head>`);
}

/**
 * @param {{ loc: string, lastmod?: string, changefreq?: string }[]} urls
 * @returns {string}
 */
export function buildSitemap(urls) {
  const entries = urls
    .map(({ loc, lastmod, changefreq }) =>
      [
        "  <url>",
        `    <loc>${escapeText(loc)}</loc>`,
        lastmod ? `    <lastmod>${escapeText(lastmod)}</lastmod>` : null,
        changefreq ? `    <changefreq>${escapeText(changefreq)}</changefreq>` : null,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/**
 * Keeps crawlers out of the routes the app marks `noindex` at runtime. A scraper that doesn't
 * run JavaScript never sees those runtime tags, so without this a checkout URL is as
 * crawlable as a product page.
 */
export function buildRobots(origin) {
  return [
    "User-agent: *",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /order-confirmation",
    "Disallow: /wishlist",
    "Disallow: /account",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

/** Trims to something a search result will actually show. Mirrors `src/lib/seo.ts`. */
/**
 * @param {string | undefined} text
 * @param {string} fallback
 * @returns {string}
 */
export function metaDescription(text, fallback) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 155 ? `${clean.slice(0, 152).trimEnd()}…` : clean;
}
