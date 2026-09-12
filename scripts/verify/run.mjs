/**
 * Verifies `src/lib/blocks/inventory-ops.ts` (the guarded compare-and-swap stock operations
 * that prevent overselling) and `src/lib/blocks/checkout-inventory.ts` (allocation and the
 * checkout hold/release flow built on them) `src/lib/blocks/reservation-sweep.ts` (lazy
 * expiry) and `src/lib/seo.ts` (per-page document metadata, against a minimal fake document) against a simulated Data Gateway.
 *
 *     npm run verify
 *
 * Why this exists as a script rather than a test suite: neither app has a test runner, and
 * adding one is a choice for the repo owner to make, not a side effect of writing this
 * module. But inventory-ops is the one piece of this project where a subtle bug means
 * selling stock that isn't there, and it cannot be exercised against the real gateway yet
 * (WarehouseInventory writes are denied by policy — see the docs repo's task breakdown §1.1).
 * So it gets verified here, and this is easy to port to vitest later if you add one.
 *
 * The real module is loaded through Vite's SSR pipeline, not copied — so it can't drift from
 * what ships. Only its two gateway imports are swapped for fakes:
 *   ./client → fake-client.ts   an in-memory store that enforces the CAS filter the way a
 *                               single Mongo UpdateOne would, and can simulate contention,
 *                               concurrent writers, denied writes, ledger failures and a
 *                               failing reservation insert
 *   ./http   → fake-http.ts     passthrough, minus session refresh and toasts
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

const server = await createServer({
  root,
  configFile: false,
  logLevel: "warn",
  server: { middlewareMode: true, hmr: false },
  define: { "import.meta.env.VITE_INVENTORY_WRITES_LIVE": '"true"' },
  resolve: {
    alias: [
      { find: "@", replacement: resolve(root, "src") },
      // Relative specifiers, so these only bite inside the blocks/ modules this graph loads.
      { find: /^\.\/client$/, replacement: resolve(here, "fake-client.ts") },
      { find: /^\.\/http$/, replacement: resolve(here, "fake-http.ts") },
    ],
  },
});

try {
  const stock = await server.ssrLoadModule(resolve(here, "scenarios.ts"));
  const checkout = await server.ssrLoadModule(resolve(here, "scenarios-checkout.ts"));
  const sweep = await server.ssrLoadModule(resolve(here, "scenarios-sweep.ts"));
  const seo = await server.ssrLoadModule(resolve(here, "scenarios-seo.ts"));
  const recent = await server.ssrLoadModule(resolve(here, "scenarios-recent.ts"));
  const failures =
    (await stock.run()) + (await checkout.run()) + (await sweep.run()) + (await seo.run()) + (await recent.run());
  await server.close();
  process.exit(failures === 0 ? 0 : 1);
} catch (error) {
  await server.close();
  console.error(error);
  process.exit(1);
}
