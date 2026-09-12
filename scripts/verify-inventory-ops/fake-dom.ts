/**
 * The smallest `document` that `src/lib/seo.ts` actually uses: createElement, head with
 * querySelector/appendChild, element attributes, and a title. Deliberately not a DOM
 * emulator — just enough that the real module can run and be inspected, so seo.ts doesn't
 * have to grow a document parameter it would never use in production.
 */
interface FakeElement {
  tagName: string;
  attrs: Record<string, string>;
  textContent: string;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  remove(): void;
  rel: string;
  href: string;
  type: string;
}

let children: FakeElement[] = [];

function makeElement(tagName: string): FakeElement {
  const el: FakeElement = {
    tagName: tagName.toUpperCase(),
    attrs: {},
    textContent: "",
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    remove() { children = children.filter((c) => c !== el); },
    get rel() { return el.attrs.rel ?? ""; },
    set rel(v: string) { el.attrs.rel = v; },
    get href() { return el.attrs.href ?? ""; },
    set href(v: string) { el.attrs.href = v; },
    get type() { return el.attrs.type ?? ""; },
    set type(v: string) { el.attrs.type = v; },
  };
  return el;
}

/** Handles only the selector shapes seo.ts builds: tag[attr="value"] with 1-2 conditions. */
function matches(el: FakeElement, selector: string): boolean {
  const m = /^([a-z]+)((?:\[[^\]]+\])*)$/.exec(selector);
  if (!m) return false;
  const [, tag, rest] = m;
  if (el.tagName !== tag.toUpperCase()) return false;
  for (const cond of rest.match(/\[[^\]]+\]/g) ?? []) {
    const inner = cond.slice(1, -1);
    const eq = inner.indexOf("=");
    if (eq === -1) {
      if (el.getAttribute(inner) === null) return false;
    } else {
      const name = inner.slice(0, eq);
      const value = inner.slice(eq + 1).replace(/^["']|["']$/g, "");
      if (el.getAttribute(name) !== value) return false;
    }
  }
  return true;
}

export const fakeDocument = {
  title: "",
  head: {
    appendChild(el: FakeElement) { children.push(el); return el; },
    querySelector(selector: string) { return children.find((c) => matches(c, selector)) ?? null; },
  },
  createElement(tag: string) { return makeElement(tag); },
};

export function installFakeDocument() {
  children = [];
  fakeDocument.title = "Baseline title";
  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  (globalThis as unknown as { window: unknown }).window = { location: { origin: "https://shop.test", pathname: "/current" } };
}

/** A flat, inspectable view of the head: tag name plus whatever attributes were set. */
export type HeadTag = Record<string, string | undefined> & { tag: string };

export function headTags(): HeadTag[] {
  return children.map((c) => ({ tag: c.tagName, ...c.attrs, ...(c.textContent ? { text: c.textContent } : {}) }));
}

export function findTag(predicate: (t: HeadTag) => boolean): HeadTag | undefined {
  return headTags().find(predicate);
}

/**
 * A localStorage that actually stores, plus one that throws on every call — private-browsing
 * mode and storage-disabled builds do throw rather than returning null, and code that reads
 * user state has to survive it.
 */
export function installFakeStorage(mode: "working" | "throwing" = "working") {
  const map = new Map<string, string>();
  const storage =
    mode === "working"
      ? {
          getItem: (k: string) => map.get(k) ?? null,
          setItem: (k: string, v: string) => void map.set(k, v),
          removeItem: (k: string) => void map.delete(k),
        }
      : {
          getItem() { throw new Error("storage disabled"); },
          setItem() { throw new Error("storage disabled"); },
          removeItem() { throw new Error("storage disabled"); },
        };
  (globalThis as unknown as { localStorage: unknown }).localStorage = storage;
  return map;
}
