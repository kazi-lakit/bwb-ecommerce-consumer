/**
 * 20 abstract placeholder images for products with no real photo (or a broken one) —
 * flat illustrated organic blobs, leaf shapes, and dot trails over a paper-grain
 * textured background, deterministically generated per index (not random per render)
 * so the same placeholder index always looks the same. Deliberately non-representational:
 * shapes are abstract blobs/leaves, never assembled into anything that reads as the
 * actual product. Rendered as inline SVG data URIs — no network request, no asset files.
 *
 * Theme-aware: there's a light-background and a dark-background palette set (see
 * LIGHT_PALETTES/DARK_PALETTES below) so a placeholder never looks like a bright card
 * pasted onto a dark-mode page — callers pass the current theme from `useTheme()`.
 */
const PLACEHOLDER_COUNT = 20;
const VIEWBOX = 240;

export type PlaceholderTheme = "light" | "dark";

/**
 * A curated color-shade combination (background + blob colors + an accent for
 * leaves/dots), cycled across the 20 placeholders so the set has real variety instead
 * of every image being a reshuffle of one palette.
 */
interface Palette {
  background: string;
  colors: string[];
  accent: string;
}

const LIGHT_PALETTES: Palette[] = [
  {
    // Terracotta garden
    background: "#f4e8d6",
    colors: ["#d8785b", "#e7a83b", "#c1552a", "#f0b6aa"],
    accent: "#33421f",
  },
  {
    // Sage & clay
    background: "#eef0e2",
    colors: ["#8a9a6b", "#d99a82", "#e3c17a", "#c98a8a"],
    accent: "#2e3a24",
  },
  {
    // Dusty blue & rust
    background: "#e9eef0",
    colors: ["#5b7c99", "#b6543a", "#e0b979", "#8a5a6b"],
    accent: "#1f2d3a",
  },
  {
    // Blush & mauve
    background: "#f5e9ec",
    colors: ["#a9728a", "#d99aa0", "#c9a37c", "#eec9a8"],
    accent: "#402a3a",
  },
  {
    // Ochre & teal
    background: "#f2ead9",
    colors: ["#c98a2e", "#a85338", "#2e6b63", "#e8c98f"],
    accent: "#223328",
  },
];

// Same 5 moods, re-tuned for a dark page: background is the app's own dark-mode canvas
// color (--color-canvas: #2b2c40, see globals.css) or a shade barely a few RGB units
// off it — never an unrelated near-black — so a placeholder reads as part of the same
// surface instead of a mismatched tile. Blob colors are slightly muted so they don't
// glare, and the accent (leaves/dots) is flipped to a light tone — the light theme's
// dark-olive/navy accents would be nearly invisible against a dark background.
const DARK_PALETTES: Palette[] = [
  {
    background: "#2b2c40", // exact match of --color-canvas (dark)
    colors: ["#c86a4d", "#d99a3d", "#a84422", "#c98f86"],
    accent: "#f0e4c8",
  },
  {
    background: "#2a2d3c",
    colors: ["#7c8c5e", "#c68870", "#c7a666", "#b47876"],
    accent: "#eef0e2",
  },
  {
    background: "#292c42",
    colors: ["#4d6b85", "#a3492f", "#c9a565", "#7a4d5c"],
    accent: "#e9eef0",
  },
  {
    background: "#2f2b3f",
    colors: ["#916279", "#c4838c", "#b58e68", "#d1ac83"],
    accent: "#f5e9ec",
  },
  {
    background: "#2b2a3a",
    colors: ["#b3792a", "#93472f", "#2f6b62", "#cbae7a"],
    accent: "#f2ead9",
  },
];

function palettesFor(theme: PlaceholderTheme): Palette[] {
  return theme === "dark" ? DARK_PALETTES : LIGHT_PALETTES;
}

// Small deterministic PRNG (mulberry32) so each index's layout is fixed and reproducible.
function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth closed organic blob (quadratic curve through the midpoints of N randomized-radius points around a circle). */
function blobPath(cx: number, cy: number, r: number, points: number, irregularity: number, rand: () => number): string {
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const radius = r * (1 - irregularity / 2 + rand() * irregularity);
    coords.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(coords[0], coords[coords.length - 1]);
  let d = `M ${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 0; i < coords.length; i++) {
    const curr = coords[i];
    const next = coords[(i + 1) % coords.length];
    const m = mid(curr, next);
    d += ` Q ${curr[0].toFixed(1)} ${curr[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/** A pointed-oval leaf shape (tip to tip along the local Y axis), wrapped in its own rotated/translated group. */
function leafGroup(cx: number, cy: number, length: number, width: number, rotationDeg: number, color: string): string {
  const hw = width / 2;
  const hl = length / 2;
  const path = `M 0 ${-hl} C ${hw} ${-hl / 2} ${hw} ${hl / 2} 0 ${hl} C ${-hw} ${hl / 2} ${-hw} ${-hl / 2} 0 ${-hl} Z`;
  return (
    `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rotationDeg.toFixed(0)})">` +
    `<path d="${path}" fill="${color}" />` +
    `<line x1="0" y1="${(-hl + 3).toFixed(1)}" x2="0" y2="${(hl - 3).toFixed(1)}" stroke="#1f2913" stroke-width="1" opacity="0.35" />` +
    `</g>`
  );
}

/** A short trail of shrinking dots along a gentle curve, like a scattered seed pod. */
function dotTrail(x0: number, y0: number, x1: number, y1: number, count: number, color: string, rand: () => number): string {
  const bendX = (x0 + x1) / 2 + (rand() - 0.5) * 40;
  const bendY = (y0 + y1) / 2 + (rand() - 0.5) * 40;
  let dots = "";
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * bendX + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * bendY + t * t * y1;
    const r = 6 - t * 3.5;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" />`;
  }
  return dots;
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function buildSvg(index: number, theme: PlaceholderTheme): string {
  const rand = seededRandom(index * 104729 + 17);
  const palettes = palettesFor(theme);
  const palette = palettes[index % palettes.length];

  const blobCount = 3 + (index % 3);
  let blobs = "";
  for (let i = 0; i < blobCount; i++) {
    const color = pick(palette.colors, rand);
    const cx = rand() * VIEWBOX;
    const cy = rand() * VIEWBOX;
    const r = VIEWBOX * (0.16 + rand() * 0.14);
    blobs += `<path d="${blobPath(cx, cy, r, 7, 0.35, rand)}" fill="${color}" />`;
  }

  const leafCount = 1 + (index % 2);
  let leaves = "";
  for (let i = 0; i < leafCount; i++) {
    const cx = rand() * VIEWBOX;
    const cy = rand() * VIEWBOX;
    const length = VIEWBOX * (0.3 + rand() * 0.2);
    const width = length * (0.35 + rand() * 0.15);
    leaves += leafGroup(cx, cy, length, width, rand() * 360, palette.accent);
  }

  const trail = dotTrail(
    rand() * VIEWBOX,
    rand() * VIEWBOX,
    rand() * VIEWBOX,
    rand() * VIEWBOX,
    4 + (index % 3),
    palette.accent,
    rand
  );

  // "multiply" grain reads as fine dark speckle on the light palettes' pale
  // backgrounds; against the dark palettes' near-black backgrounds it would barely
  // show at all, so dark mode blends the same black-noise layer with "soft-light"
  // instead, which stays visible without washing out the background.
  const grainBlend = theme === "dark" ? "soft-light" : "multiply";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">` +
    `<defs>` +
    `<filter id="grain" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" result="noise" />` +
    `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />` +
    `</filter>` +
    `</defs>` +
    `<rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${palette.background}" />` +
    blobs +
    leaves +
    trail +
    `<rect width="${VIEWBOX}" height="${VIEWBOX}" filter="url(#grain)" opacity="0.5" style="mix-blend-mode:${grainBlend}" />` +
    `</svg>`
  );
}

const cache: Record<PlaceholderTheme, string[] | undefined> = { light: undefined, dark: undefined };

function getPlaceholderImages(theme: PlaceholderTheme): string[] {
  const cached = cache[theme];
  if (cached) return cached;
  const images = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => `data:image/svg+xml,${encodeURIComponent(buildSvg(i, theme))}`);
  cache[theme] = images;
  return images;
}

/**
 * Assigns every item a placeholder — even one with a real photo gets one, held in
 * reserve as the `<img onError>` fallback for a dead/broken URL (seed data's example.com
 * URLs, a deleted upload, etc.), not just for a genuinely empty Media array. Drawn so the
 * same placeholder never repeats within the next `avoidWindow` items. Pass the current
 * `useTheme()` value so the picked images match light/dark mode.
 */
export function assignPlaceholders<T>(items: T[], theme: PlaceholderTheme, avoidWindow = 4): string[] {
  const images = getPlaceholderImages(theme);
  const recent: number[] = [];
  return items.map(() => {
    const available = images.map((_, i) => i).filter((i) => !recent.includes(i));
    const pick = available[Math.floor(Math.random() * available.length)];
    recent.push(pick);
    if (recent.length > avoidWindow) recent.shift();
    return images[pick];
  });
}
