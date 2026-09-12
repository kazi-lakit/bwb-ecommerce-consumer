import { reset, store } from "./fake-client";
import { allocateCartLines, holdStockForCheckout, releaseCheckoutHold, attachHoldToOrder } from "@/lib/blocks/checkout-inventory";
import type { CartLine } from "@/components/providers/cart-provider";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
function row(id: string, wh: string, v: string, onHand: number, reserved = 0) {
  return { ItemId: id, WarehouseId: wh, VariantId: v, Version: 1,
           AvailableToSell: onHand - reserved,
           Quantity: { OnHand: onHand, Reserved: reserved, Damaged: 0, QualityHold: 0, Incoming: 0, Blocked: 0, Backordered: 0, InTransit: 0 } } as never;
}
const cart = (variantId: string | undefined, quantity: number, key = variantId ?? "p"): CartLine => ({
  key, productId: "P1", variantId, sku: variantId ? "SKU-" + variantId : undefined,
  slug: "s", name: "Item " + key, unitPrice: 10, currency: "USD", quantity,
});
const cartNoSku = (variantId: string, quantity: number): CartLine => ({
  key: variantId, productId: "P1", variantId, slug: "s", name: "Legacy " + variantId,
  unitPrice: 10, currency: "USD", quantity,
});
const actor = { type: "user" as const, id: "U1", name: "Ana" };

export async function run(): Promise<number> {
  console.log("\nC1. allocation prefers the fullest warehouse");
  reset([row("B1", "W1", "V1", 2), row("B2", "W2", "V1", 9)]);
  let alloc = await allocateCartLines([cart("V1", 3)]);
  check("one line", alloc.lines.length === 1, JSON.stringify(alloc.lines));
  check("from W2", alloc.lines[0].warehouseId === "W2");
  check("no shortfall", alloc.shortfalls.length === 0);

  console.log("\nC2. a line splits across warehouses only when it has to");
  reset([row("B1", "W1", "V1", 2), row("B2", "W2", "V1", 4)]);
  alloc = await allocateCartLines([cart("V1", 5)]);
  check("split in two", alloc.lines.length === 2);
  check("4 from W2 then 1 from W1", alloc.lines[0].quantity === 4 && alloc.lines[1].quantity === 1);
  check("totals to 5", alloc.lines.reduce((n, l) => n + l.quantity, 0) === 5);

  console.log("\nC3. an untracked variant is skipped, not failed");
  reset([row("B1", "W1", "V1", 5)]);
  alloc = await allocateCartLines([cart("V1", 1), cart("V-none", 1), cart(undefined, 1, "novariant")]);
  check("only the tracked line allocated", alloc.lines.length === 1);
  check("two reported untracked", alloc.untracked.length === 2, alloc.untracked.join(","));
  check("no shortfall", alloc.shortfalls.length === 0);

  console.log("\nC4. a shortfall on one line allocates nothing at all");
  reset([row("B1", "W1", "V1", 9), row("B2", "W1", "V2", 1)]);
  alloc = await allocateCartLines([cart("V1", 2), cart("V2", 5)]);
  check("nothing allocated", alloc.lines.length === 0);
  check("shortfall reported", alloc.shortfalls.length === 1 && alloc.shortfalls[0].available === 1);

  console.log("\nC5. hold: record written before stock moves");
  reset([row("B1", "W1", "V1", 10)]);
  let outcome = await holdStockForCheckout([cart("V1", 3)], "CUST1", "ATT1", actor);
  check("held", outcome.kind === "held", outcome.kind);
  check("reservation exists", store.reservations.length === 1);
  check("status active", store.reservations[0].Status === "active");
  check("has an expiry", typeof store.reservations[0].ExpiresDate === "string");
  check("source is the checkout attempt", (store.reservations[0].Source as never as Record<string, string>).Id === "ATT1");
  check("stock reserved", store.rows[0].Quantity.Reserved === 3);
  check("available dropped", store.rows[0].AvailableToSell === 7);
  check("ledger row written", store.movements.length === 1);
  check("movement references the reservation", (store.movements[0].Reference as never as Record<string, string>).Id === store.reservations[0].ItemId);

  console.log("\nC6. sold out mid-checkout: nothing is held and the customer is told");
  reset([row("B1", "W1", "V1", 1)]);
  outcome = await holdStockForCheckout([cart("V1", 4)], "CUST1", "ATT2", actor);
  check("unavailable", outcome.kind === "unavailable", outcome.kind);
  check("no reservation record", store.reservations.length === 0);
  check("no stock moved", store.rows[0].Quantity.Reserved === 0);

  console.log("\nC7. reservation record fails: no stock is taken");
  reset([row("B1", "W1", "V1", 10)]);
  store.failReservationInsert = true;
  outcome = await holdStockForCheckout([cart("V1", 2)], "CUST1", "ATT3", actor);
  check("failed", outcome.kind === "failed", outcome.kind);
  check("nothing reserved", store.rows[0].Quantity.Reserved === 0);
  check("no orphaned hold", store.rows[0].Version === 1);

  console.log("\nC8. a sibling line failing mid-reserve rolls back and closes the record");
  reset([row("B1", "W1", "V1", 10), row("B2", "W1", "V2", 10)]);
  // Allocation passes (both look fine), then the second CAS is starved by a concurrent writer.
  let fired = false;
  store.onCas = () => {
    if (fired) return;
    fired = true;
  };
  store.casResultOverride = [null, 0, 0, 0, 0, 0];   // line 1 fine, line 2 loses every attempt
  outcome = await holdStockForCheckout([cart("V1", 1), cart("V2", 1)], "CUST1", "ATT4", actor);
  check("not held", outcome.kind !== "held", outcome.kind);
  check("line 1 rolled back", store.rows[0].Quantity.Reserved === 0, JSON.stringify(store.rows[0].Quantity));
  check("line 2 untouched", store.rows[1].Quantity.Reserved === 0);
  check("record closed, not left active", store.reservations[0].Status === "released");

  console.log("\nC9. releasing a hold returns the stock and settles the record");
  reset([row("B1", "W1", "V1", 10)]);
  outcome = await holdStockForCheckout([cart("V1", 4)], "CUST1", "ATT5", actor);
  check("held", outcome.kind === "held");
  if (outcome.kind === "held") {
    await releaseCheckoutHold(outcome.hold);
    check("stock returned", store.rows[0].Quantity.Reserved === 0);
    check("available restored", store.rows[0].AvailableToSell === 10);
    check("record released", store.reservations[0].Status === "released");
    check("release is ledgered", store.movements.length === 2);
    await releaseCheckoutHold(outcome.hold);
    check("releasing twice is harmless", store.rows[0].Quantity.Reserved === 0 && store.rows[0].AvailableToSell === 10);
  }

  console.log("\nC10. a placed order repoints the hold, and stock stays reserved");
  reset([row("B1", "W1", "V1", 10)]);
  outcome = await holdStockForCheckout([cart("V1", 2)], "CUST1", "ATT6", actor);
  if (outcome.kind === "held") {
    await attachHoldToOrder(outcome.hold, "ORDER-ITEM-1", "ORD-42");
    const src = store.reservations[0].Source as never as Record<string, string>;
    check("source now the order", src.Type === "order" && src.Id === "ORDER-ITEM-1");
    check("order number recorded", src.Number === "ORD-42");
    check("still active", store.reservations[0].Status === "active");
    check("on-hand untouched: committing is fulfillment's job", store.rows[0].Quantity.OnHand === 10);
    check("still reserved", store.rows[0].Quantity.Reserved === 2);
  }

  console.log("\nC11. nothing tracked is a skip, not a block");
  reset([row("B1", "W1", "V1", 10)]);
  outcome = await holdStockForCheckout([cart("V-none", 1)], "CUST1", "ATT7", actor);
  check("skipped", outcome.kind === "skipped", outcome.kind);
  check("no reservation", store.reservations.length === 0);

  console.log("\nC12. check-only: a shortfall still stops checkout");
  reset([row("B1", "W1", "V1", 1)]);
  outcome = await holdStockForCheckout([cart("V1", 4)], "CUST1", "ATT8", actor, { hold: false });
  check("unavailable", outcome.kind === "unavailable", outcome.kind);
  check("nothing held", store.reservations.length === 0 && store.rows[0].Quantity.Reserved === 0);

  console.log("\nC13. check-only: enough stock takes nothing");
  reset([row("B1", "W1", "V1", 10)]);
  outcome = await holdStockForCheckout([cart("V1", 3)], "CUST1", "ATT9", actor, { hold: false });
  check("skipped, not held", outcome.kind === "skipped", outcome.kind);
  check("no reservation record", store.reservations.length === 0);
  check("stock untouched", store.rows[0].Quantity.Reserved === 0);
  check("no ledger row", store.movements.length === 0);

  console.log("\nC14. the variant SKU reaches the reservation and the ledger");
  reset([row("B1", "W1", "V1", 10)]);
  outcome = await holdStockForCheckout([cart("V1", 2)], "CUST1", "ATT10", actor);
  check("held", outcome.kind === "held");
  check("reservation line carries the SKU",
    ((store.reservations[0].Items as never as Record<string, string>[])[0]).Sku === "SKU-V1",
    JSON.stringify(store.reservations[0].Items));
  check("movement carries the SKU", store.movements[0].Sku === "SKU-V1", String(store.movements[0].Sku));

  console.log("\nC15. a cart line persisted before SKUs existed still works");
  reset([row("B1", "W1", "V1", 10)]);
  outcome = await holdStockForCheckout([cartNoSku("V1", 2)], "CUST1", "ATT11", actor);
  check("still held", outcome.kind === "held", outcome.kind);
  check("stock still moved", store.rows[0].Quantity.Reserved === 2);
  check("no SKU rather than a wrong one", store.movements[0].Sku === undefined, String(store.movements[0].Sku));

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
