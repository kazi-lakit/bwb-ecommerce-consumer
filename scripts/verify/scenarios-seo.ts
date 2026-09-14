import { installFakeDocument, fakeDocument, headTags, findTag } from "./fake-dom";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

export async function run(): Promise<number> {
  // Installed before seo.ts is imported: the module reads `document`/`window` at call time,
  // but importing it first would still be fragile if that ever changes.
  installFakeDocument();
  const { applyPageMeta, productJsonLd, breadcrumbJsonLd, metaDescription } = await import("@/lib/seo");

  console.log("\nM1. a page sets title, canonical, description and Open Graph");
  installFakeDocument();
  let undo = applyPageMeta({
    title: "Oak Chair — Cartio",
    description: "A chair.",
    canonicalPath: "/product/oak-chair",
    image: "https://cdn.test/chair.jpg",
    type: "product",
  });
  check("title set", fakeDocument.title === "Oak Chair — Cartio", fakeDocument.title);
  check("canonical absolute", findTag((t) => t.rel === "canonical")?.href === "https://shop.test/product/oak-chair",
    JSON.stringify(findTag((t) => t.rel === "canonical")));
  check("description set", findTag((t) => t.name === "description")?.content === "A chair.");
  check("og:title set", findTag((t) => t.property === "og:title")?.content === "Oak Chair — Cartio");
  check("og:type carried", findTag((t) => t.property === "og:type")?.content === "product");
  check("og:url matches canonical", findTag((t) => t.property === "og:url")?.content === "https://shop.test/product/oak-chair");
  check("large twitter card when there's an image",
    findTag((t) => t.name === "twitter:card")?.content === "summary_large_image");
  check("not marked noindex", findTag((t) => t.name === "robots") === undefined);

  console.log("\nM2. canonical falls back to the current path");
  installFakeDocument();
  undo = applyPageMeta({ title: "Whatever" });
  check("uses location.pathname", findTag((t) => t.rel === "canonical")?.href === "https://shop.test/current");
  check("plain card without an image", findTag((t) => t.name === "twitter:card")?.content === "summary");
  undo();

  console.log("\nM3. a private page is marked noindex, and unmarks itself on leaving");
  installFakeDocument();
  undo = applyPageMeta({ title: "Checkout", noIndex: true });
  check("robots set", findTag((t) => t.name === "robots")?.content === "noindex,nofollow");
  undo();
  check("robots removed on unmount", findTag((t) => t.name === "robots") === undefined,
    JSON.stringify(headTags()));
  check("title restored", fakeDocument.title === "Baseline title", fakeDocument.title);

  console.log("\nM4. JSON-LD is added and removed with the page");
  installFakeDocument();
  undo = applyPageMeta({ title: "Oak Chair", jsonLd: { "@type": "Product", name: "Oak Chair" } });
  const ld = findTag((t) => t.type === "application/ld+json");
  check("script added", Boolean(ld));
  check("carries the payload", headTags().some((t) => (t.text ?? "").includes("Oak Chair")));
  undo();
  check("removed on unmount", findTag((t) => t.type === "application/ld+json") === undefined);

  console.log("\nM5. leaving a page doesn't strip the app's baseline tags");
  installFakeDocument();
  undo = applyPageMeta({ title: "A page", description: "Something" });
  undo();
  check("description survives", findTag((t) => t.name === "description")?.content === "Something");
  check("canonical survives", Boolean(findTag((t) => t.rel === "canonical")));

  console.log("\nM6. navigating between pages replaces rather than duplicates");
  installFakeDocument();
  applyPageMeta({ title: "First", description: "One", canonicalPath: "/a" });
  applyPageMeta({ title: "Second", description: "Two", canonicalPath: "/b" });
  check("one description tag", headTags().filter((t) => t.name === "description").length === 1);
  check("one canonical link", headTags().filter((t) => t.rel === "canonical").length === 1);
  check("latest wins", findTag((t) => t.name === "description")?.content === "Two");
  check("canonical updated", findTag((t) => t.rel === "canonical")?.href === "https://shop.test/b");

  console.log("\nM7. availability is asserted only when it's actually known");
  const unknown = productJsonLd({ name: "X", url: "https://shop.test/p/x", inStock: undefined });
  check("omitted while unknown", !JSON.stringify(unknown).includes("availability"), JSON.stringify(unknown.offers));
  const inStock = productJsonLd({ name: "X", url: "https://shop.test/p/x", inStock: true });
  check("InStock when known", JSON.stringify(inStock).includes("schema.org/InStock"));
  const out = productJsonLd({ name: "X", url: "https://shop.test/p/x", inStock: false });
  check("OutOfStock when known", JSON.stringify(out).includes("schema.org/OutOfStock"));

  console.log("\nM8. price is only claimed when there is one");
  const noPrice = productJsonLd({ name: "X", url: "u" });
  check("no price key", !JSON.stringify(noPrice).includes('"price"'));
  const priced = productJsonLd({ name: "X", url: "u", price: 42, currency: "EUR" });
  check("price and currency", JSON.stringify(priced).includes('"price":42') && JSON.stringify(priced).includes("EUR"));

  console.log("\nM9. breadcrumbs are absolute and positioned");
  const crumbs = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Chair", path: "/product/chair" }]);
  const list = crumbs.itemListElement as Record<string, unknown>[];
  check("two entries", list.length === 2);
  check("positions from 1", list[0].position === 1 && list[1].position === 2);
  check("absolute urls", list[1].item === "https://shop.test/product/chair", String(list[1].item));

  console.log("\nM10. descriptions are trimmed to something a result will show");
  check("falls back when empty", metaDescription(undefined, "Fallback") === "Fallback");
  check("falls back on whitespace", metaDescription("   ", "Fallback") === "Fallback");
  check("collapses whitespace", metaDescription("a\n\n  b", "f") === "a b");
  const long = metaDescription("x".repeat(300), "f");
  check("truncated to 155", long.length <= 155, String(long.length));
  check("ellipsis added", long.endsWith("…"));

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
