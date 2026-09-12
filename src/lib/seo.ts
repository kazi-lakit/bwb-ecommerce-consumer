import { useEffect } from "react";

/**
 * Per-page document metadata for a client-rendered SPA.
 *
 * **Know what this does and doesn't buy you.** This app is a Vite SPA: the HTML a crawler
 * receives is `index.html`, and everything below is applied afterwards by JavaScript.
 *
 * - **Googlebot renders JavaScript**, so titles, descriptions, canonicals and JSON-LD set here
 *   are seen and used. This is worth doing.
 * - **Most social scrapers do not.** Facebook, LinkedIn, Slack, WhatsApp and X read the raw
 *   HTML response and never execute scripts, so the Open Graph tags below will not produce
 *   per-product link previews — every shared URL falls back to whatever `index.html` carries.
 *   They're set anyway because they cost nothing and a few consumers do render, but nobody
 *   should read this file and conclude link previews are handled.
 *
 * Fixing that properly means the HTML must already contain the tags, which means prerendering
 * at build time or server-side rendering. Prerendering is compatible with this project's
 * no-new-backend constraint (it's a build step, not a service) but it is a real piece of work
 * and a separate decision — tracked as a follow-up rather than half-done here.
 */

const MANAGED = "data-managed-seo";

export interface PageMeta {
  title: string;
  description?: string;
  /** Absolute or root-relative path this page should be canonical at. Defaults to the current path. */
  canonicalPath?: string;
  image?: string;
  /** Keeps a page out of search results — carts, checkout, account pages. */
  noIndex?: boolean;
  /** A schema.org object, serialised into a JSON-LD script tag. */
  jsonLd?: Record<string, unknown>;
  type?: "website" | "product" | "article";
}

function upsertMeta(selector: string, attrs: Record<string, string>): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(MANAGED, "");
    document.head.appendChild(el);
  }
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    el.setAttribute(MANAGED, "");
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Sets the document's metadata for as long as the calling page is mounted.
 *
 * Tags this created are removed on unmount; tags that were already in `index.html` are left
 * alone, so navigating away from a page never strips the app's baseline metadata — it just
 * stops overriding it.
 */
export function usePageMeta(meta: PageMeta): void {
  const { title, description, canonicalPath, image, noIndex, jsonLd, type = "website" } = meta;

  useEffect(
    () => applyPageMeta({ title, description, canonicalPath, image, noIndex, jsonLd, type }),
    [title, description, canonicalPath, image, noIndex, jsonLd, type]
  );
}

/**
 * Applies `meta` to the document and returns the undo. Exported separately from the hook so
 * the DOM effect can be exercised without React — and because a non-React caller (a route
 * transition, a test) has no business going through a hook to change a `<title>`.
 */
export function applyPageMeta(meta: PageMeta): () => void {
  const { title, description, canonicalPath, image, noIndex, jsonLd, type = "website" } = meta;

  {
    const previousTitle = document.title;
    document.title = title;

    const url = `${window.location.origin}${canonicalPath ?? window.location.pathname}`;
    upsertLink("canonical", url);

    if (description) upsertMeta('meta[name="description"]', { name: "description", content: description });

    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: url });
    if (description) upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    if (image) upsertMeta('meta[property="og:image"]', { property: "og:image", content: image });

    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: image ? "summary_large_image" : "summary" });

    // Only ever *adds* a robots tag; a page that doesn't ask for one gets none, which means
    // indexable. Removed on unmount below, so navigating from /checkout to a product page
    // can't leave the product page marked noindex.
    if (noIndex) upsertMeta('meta[name="robots"]', { name: "robots", content: "noindex,nofollow" });

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute(MANAGED, "");
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.title = previousTitle;
      script?.remove();
      if (noIndex) document.head.querySelector(`meta[name="robots"][${MANAGED}]`)?.remove();
    };
  }
}

/** schema.org Product, for a product detail page. */
export function productJsonLd(input: {
  name: string;
  description?: string;
  image?: string;
  sku?: string;
  brand?: string;
  price?: number;
  currency?: string;
  inStock?: boolean;
  url: string;
}): Record<string, unknown> {
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url: input.url,
    // Only asserted when it's actually known. An availability claim is the kind of thing that
    // ends up in a search result next to a price, so guessing it is worse than omitting it.
    ...(input.inStock === undefined
      ? {}
      : { availability: input.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" }),
    ...(input.price !== undefined ? { price: input.price, priceCurrency: input.currency ?? "USD" } : {}),
  };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    ...(input.brand ? { brand: { "@type": "Brand", name: input.brand } } : {}),
    offers: offer,
  };
}

/** schema.org BreadcrumbList, for pages that sit under something. */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${window.location.origin}${crumb.path}`,
    })),
  };
}

/** Trims a description to something a search result will actually show. */
export function metaDescription(text: string | undefined, fallback: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 155 ? `${clean.slice(0, 152).trimEnd()}…` : clean;
}
