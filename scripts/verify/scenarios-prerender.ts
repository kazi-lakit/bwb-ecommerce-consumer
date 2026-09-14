// Plain JS build tooling, imported so the real module is exercised rather than a copy.
// Its parameter shapes come from JSDoc annotations in head.mjs.
import * as head from "../prerender/head.mjs";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="Baseline description." />
    <title>Baseline title</title>
    <meta property="og:site_name" content="Cartio" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Baseline title" />
    <meta property="og:description" content="Baseline description." />
    <meta name="twitter:card" content="summary" />
  </head>
  <body><div id="root"></div></body>
</html>`;

export async function run(): Promise<number> {
  const { buildHead, injectHead, buildSitemap, buildRobots, escapeAttr, safeJsonLd, metaDescription } = head;

  console.log("\nP1. a page's own metadata ends up in the markup");
  const block = buildHead({
    title: "Oak Chair — Cartio",
    description: "A chair.",
    canonical: "https://shop.test/product/oak-chair",
    image: "https://cdn.test/c.jpg",
    type: "product",
  });
  const html = injectHead(TEMPLATE, block);
  check("title present", html.includes("<title>Oak Chair — Cartio</title>"), block);
  check("canonical present", html.includes('rel="canonical" href="https://shop.test/product/oak-chair"'));
  check("og:title present", html.includes('property="og:title" content="Oak Chair — Cartio"'));
  check("og:image present", html.includes('property="og:image"'));
  check("large card with an image", html.includes('content="summary_large_image"'));

  console.log("\nP2. the baseline tags are removed, not left to compete");
  // Two titles or two og:titles is worse than none — which one a scraper believes is arbitrary.
  check("one title", (html.match(/<title>/g) ?? []).length === 1, String((html.match(/<title>/g) ?? []).length));
  check("one og:title", (html.match(/property="og:title"/g) ?? []).length === 1);
  check("one description", (html.match(/name="description"/g) ?? []).length === 1);
  check("one twitter:card", (html.match(/name="twitter:card"/g) ?? []).length === 1);
  check("og:site_name kept", html.includes('property="og:site_name"'));
  check("charset kept", html.includes('charset="UTF-8"'));
  check("app root kept", html.includes('id="root"'));

  console.log("\nP3. running it twice changes nothing further");
  const twice = injectHead(html, buildHead({ title: "Oak Chair — Cartio", description: "A chair.", canonical: "https://shop.test/product/oak-chair", image: "https://cdn.test/c.jpg", type: "product" }));
  check("idempotent", twice === html, "second pass differed");
  const changed = injectHead(html, buildHead({ title: "Different", canonical: "https://shop.test/x" }));
  check("still replaces on change", changed.includes("<title>Different</title>") && !changed.includes("Oak Chair"));
  check("still one title", (changed.match(/<title>/g) ?? []).length === 1);

  console.log("\nP4. names that contain markup can't break the page");
  const risky = injectHead(TEMPLATE, buildHead({
    title: 'Chair "Deluxe" & <b>Co</b>',
    description: 'Say "hello" & <goodbye>',
    canonical: "https://shop.test/p/x?a=1&b=2",
  }));
  check("quotes escaped in attributes", risky.includes("&quot;Deluxe&quot;"), risky.slice(risky.indexOf("og:title"), risky.indexOf("og:title") + 90));
  check("angle brackets escaped", !/content="[^"]*<b>/.test(risky));
  check("ampersand in the canonical escaped", risky.includes("a=1&amp;b=2"));
  check("no raw markup in the title", !risky.includes("<title>Chair \"Deluxe\" & <b>"));

  console.log("\nP5. JSON-LD can't terminate its own script element");
  // A description containing </script> would end the element early and spill markup.
  const ld = safeJsonLd({ name: "Chair", description: "</script><img onerror=x>" });
  check("close tag neutralised", !ld.includes("</script"), ld);
  check("still valid JSON", JSON.parse(ld.replace(/<\\\//g, "</")).name === "Chair");
  const withLd = injectHead(TEMPLATE, buildHead({ title: "t", canonical: "https://shop.test/", jsonLd: { a: "</script>" } }));
  check("one script element", (withLd.match(/<\/script>/g) ?? []).length === 1, String((withLd.match(/<\/script>/g) ?? []).length));

  console.log("\nP6. a missing image means a plain card, not a broken one");
  const noImage = injectHead(TEMPLATE, buildHead({ title: "t", canonical: "https://shop.test/" }));
  check("no og:image", !noImage.includes('property="og:image"'));
  check("summary card", noImage.includes('content="summary"') && !noImage.includes("summary_large_image"));

  console.log("\nP7. a template with no head is an error, not a silent no-op");
  let threw = false;
  try { injectHead("<html><body>x</body></html>", block); } catch { threw = true; }
  check("throws", threw);

  console.log("\nP8. the sitemap lists what was built");
  const xml = buildSitemap([
    { loc: "https://shop.test/", changefreq: "daily" },
    { loc: "https://shop.test/product/a", lastmod: "2026-03-01T00:00:00Z", changefreq: "weekly" },
  ]);
  check("xml declaration", xml.startsWith('<?xml version="1.0"'));
  check("two urls", (xml.match(/<url>/g) ?? []).length === 2);
  check("lastmod included when known", xml.includes("<lastmod>2026-03-01T00:00:00Z</lastmod>"));
  check("omitted when not", (xml.match(/<lastmod>/g) ?? []).length === 1);

  console.log("\nP9. robots keeps crawlers out of what the app marks noindex");
  // A scraper that doesn't run JS never sees the runtime robots tag.
  const robots = buildRobots("https://shop.test");
  for (const path of ["/cart", "/checkout", "/account", "/wishlist", "/order-confirmation"]) {
    check(`${path} disallowed`, robots.includes(`Disallow: ${path}`));
  }
  check("sitemap advertised", robots.includes("Sitemap: https://shop.test/sitemap.xml"));

  console.log("\nP10. descriptions match the runtime rule");
  check("falls back", metaDescription("", "Fallback") === "Fallback");
  check("trims to 155", metaDescription("x".repeat(400), "f").length <= 155);
  check("escapeAttr handles undefined", escapeAttr(undefined) === "");

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
