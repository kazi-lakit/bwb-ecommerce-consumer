import { reset, store } from "./fake-client";
import { reserveStock, releaseStock, commitStock, unavailableLines } from "@/lib/blocks/inventory-ops";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
function row(id: string, wh: string, v: string, q: Record<string, number>, version: unknown = 1) {
  const onHand = q.OnHand ?? 0, res = q.Reserved ?? 0, dmg = q.Damaged ?? 0, qh = q.QualityHold ?? 0, blk = q.Blocked ?? 0;
  return { ItemId: id, WarehouseId: wh, VariantId: v, Version: version,
           AvailableToSell: onHand - res - dmg - qh - blk,
           Quantity: { OnHand: onHand, Reserved: res, Damaged: dmg, QualityHold: qh, Incoming: 0, Blocked: blk, Backordered: 0, InTransit: 0 } } as never;
}
const L = (v: string, qty: number, wh = "W1") => ({ warehouseId: wh, variantId: v, sku: "SKU-" + v, quantity: qty });
const ctx = (key = "k1") => ({ reference: { type: "cart", id: "C1" }, idempotencyKey: key,
                               performedBy: { type: "user" as const, id: "U1", name: "Ana" } });

export async function run(): Promise<number> {
  console.log("\n1. reserve happy path");
  reset([row("B1", "W1", "V1", { OnHand: 10 })]);
  let r = await reserveStock([L("V1", 3)], ctx());
  check("ok", r.ok);
  check("reserved 3", store.rows[0].Quantity.Reserved === 3, JSON.stringify(store.rows[0].Quantity));
  check("available 7", store.rows[0].AvailableToSell === 7, String(store.rows[0].AvailableToSell));
  check("version bumped", store.rows[0].Version === 2);
  check("one movement", store.movements.length === 1);
  check("movement type reservation", store.movements[0].MovementType === "reservation");
  check("movement delta +3 reserved", (store.movements[0].QuantityChange as never as Record<string, number>).Reserved === 3);
  check("balance-after snapshot", (store.movements[0].BalanceAfter as never as Record<string, number>).AvailableToSell === 7);

  console.log("\n2. insufficient stock is refused without writing");
  reset([row("B1", "W1", "V1", { OnHand: 2 })]);
  r = await reserveStock([L("V1", 5)], ctx());
  check("not ok", !r.ok);
  check("reason insufficient", r.lines[0].reason === "insufficient");
  check("nothing written", store.rows[0].Version === 1 && store.movements.length === 0);
  check("reported as unavailable", unavailableLines(r).length === 1);

  console.log("\n3. contention: one loss then success");
  reset([row("B1", "W1", "V1", { OnHand: 10 })]);
  store.casResultOverride = [0];
  r = await reserveStock([L("V1", 3)], ctx());
  check("ok", r.ok);
  check("took 2 attempts", r.lines[0].attempts === 2, String(r.lines[0].attempts));
  check("applied exactly once", store.rows[0].Quantity.Reserved === 3);

  console.log("\n4. contention exhausted");
  reset([row("B1", "W1", "V1", { OnHand: 10 })]);
  store.casResultOverride = [0, 0, 0, 0, 0];
  r = await reserveStock([L("V1", 1)], ctx());
  check("not ok", !r.ok);
  check("reason contention", r.lines[0].reason === "contention");
  check("bounded at 5", r.lines[0].attempts === 5);

  console.log("\n5. a real concurrent writer takes the stock mid-flight");
  reset([row("B1", "W1", "V1", { OnHand: 5 })]);
  let fired = false;
  store.onCas = () => {                       // someone else reserves all 5 first
    if (fired) return; fired = true;
    const b = store.rows[0];
    b.Quantity.Reserved = 5; b.AvailableToSell = 0; b.Version = 99;
  };
  r = await reserveStock([L("V1", 4)], ctx());
  check("refused", !r.ok);
  check("saw it as insufficient on re-read", r.lines[0].reason === "insufficient", String(r.lines[0].reason));
  check("no oversell: reserved still 5", store.rows[0].Quantity.Reserved === 5);

  console.log("\n6. multi-line: a later failure rolls back the earlier line");
  reset([row("B1", "W1", "V1", { OnHand: 10 }), row("B2", "W1", "V2", { OnHand: 1 })]);
  r = await reserveStock([L("V1", 2), L("V2", 5)], ctx());
  check("not ok", !r.ok);
  check("V1 was compensated", r.compensated.length === 1 && r.compensated[0].ok);
  check("V1 back to 0 reserved", store.rows[0].Quantity.Reserved === 0, JSON.stringify(store.rows[0].Quantity));
  check("V1 available restored to 10", store.rows[0].AvailableToSell === 10);
  check("V2 untouched", store.rows[1].Quantity.Reserved === 0);
  check("rollback is ledgered too", store.movements.length === 2);
  check("rollback reason recorded", store.movements[1].ReasonCode === "reservation_rolled_back");

  console.log("\n7. three lines, the third fails: both earlier ones roll back");
  reset([row("B1", "W1", "V1", { OnHand: 9 }), row("B2", "W1", "V2", { OnHand: 9 }), row("B3", "W1", "V3", { OnHand: 0 })]);
  r = await reserveStock([L("V1", 1), L("V2", 1), L("V3", 1)], ctx());
  check("not ok", !r.ok);
  check("two compensations", r.compensated.length === 2);
  check("both restored", store.rows[0].Quantity.Reserved === 0 && store.rows[1].Quantity.Reserved === 0);
  check("every line reported", r.lines.length === 3);

  console.log("\n8. stored AvailableToSell has drifted above what the buckets support");
  reset([row("B1", "W1", "V1", { OnHand: 10, Reserved: 8 })]);
  store.rows[0].AvailableToSell = 10;          // stale/corrupt: buckets really allow 2
  r = await reserveStock([L("V1", 5)], ctx());
  check("refused despite the gateway guard passing", !r.ok);
  check("reason insufficient", r.lines[0].reason === "insufficient");
  check("no write happened", store.rows[0].Version === 1);

  console.log("\n9. a successful write repairs that drift");
  reset([row("B1", "W1", "V1", { OnHand: 10, Reserved: 8 })]);
  store.rows[0].AvailableToSell = 10;
  r = await reserveStock([L("V1", 1)], ctx());
  check("ok", r.ok);
  check("recomputed to 1", store.rows[0].AvailableToSell === 1, String(store.rows[0].AvailableToSell));

  console.log("\n10. Version unreadable (the Long problem) is fatal, never an unguarded write");
  reset([row("B1", "W1", "V1", { OnHand: 10 }, null)]);
  r = await reserveStock([L("V1", 1)], ctx());
  check("not ok", !r.ok);
  check("reason no-version", r.lines[0].reason === "no-version", String(r.lines[0].reason));
  check("nothing written", store.movements.length === 0 && store.rows[0].Quantity.Reserved === 0);

  console.log("\n11. access denied fails fast, without burning retries");
  reset([row("B1", "W1", "V1", { OnHand: 10 })]);
  store.denyWrites = true;
  r = await reserveStock([L("V1", 1)], ctx());
  check("reason denied", r.lines[0].reason === "denied");
  check("single attempt", r.lines[0].attempts === 1, String(r.lines[0].attempts));

  console.log("\n12. missing balance row");
  reset([row("B1", "W1", "V1", { OnHand: 10 })]);
  r = await reserveStock([L("V9", 1)], ctx());
  check("reason not-found", r.lines[0].reason === "not-found");

  console.log("\n13. release clamps to what is actually reserved");
  reset([row("B1", "W1", "V1", { OnHand: 10, Reserved: 2 })]);
  r = await releaseStock([L("V1", 5)], ctx());
  check("ok", r.ok);
  check("reserved floored at 0", store.rows[0].Quantity.Reserved === 0);
  check("never negative available", store.rows[0].AvailableToSell === 10);

  console.log("\n14. releasing nothing is a no-op success, not an error");
  reset([row("B1", "W1", "V1", { OnHand: 10, Reserved: 0 })]);
  r = await releaseStock([L("V1", 3)], ctx());
  check("ok", r.ok);
  check("no version churn", store.rows[0].Version === 1);
  check("no phantom ledger row", store.movements.length === 0);

  console.log("\n15. commit consumes reserved stock, leaving availability alone");
  reset([row("B1", "W1", "V1", { OnHand: 10, Reserved: 3 })]);
  const before = store.rows[0].AvailableToSell;
  r = await commitStock([L("V1", 3)], ctx());
  check("ok", r.ok);
  check("on-hand 10 -> 7", store.rows[0].Quantity.OnHand === 7);
  check("reserved 3 -> 0", store.rows[0].Quantity.Reserved === 0);
  check("available unchanged", store.rows[0].AvailableToSell === before, `${before} -> ${store.rows[0].AvailableToSell}`);
  check("movement type sale", store.movements[0].MovementType === "sale");

  console.log("\n16. ledger failure is reported, balance is not rolled back");
  reset([row("B1", "W1", "V1", { OnHand: 10 })]);
  store.failMovement = true;
  r = await reserveStock([L("V1", 2)], ctx());
  check("still ok", r.ok);
  check("flagged", r.lines[0].ledgerWriteFailed === true);
  check("balance did move", store.rows[0].Quantity.Reserved === 2);

  console.log("\n17. idempotency keys are per line and per operation");
  reset([row("B1", "W1", "V1", { OnHand: 9 }), row("B2", "W1", "V2", { OnHand: 9 })]);
  await reserveStock([L("V1", 1), L("V2", 1)], ctx("SAME"));
  const keys = store.movements.map((m) => m.IdempotencyKey as string);
  check("two distinct keys", new Set(keys).size === 2, keys.join(" | "));
  check("both derive from the caller key", keys.every((k) => k.startsWith("SAME:reserve:")));
  await releaseStock([L("V1", 1)], ctx("SAME"));
  check("release key differs from reserve", store.movements[2].IdempotencyKey !== keys[0]);

  console.log("\n18. pre-batch-2 gateway: falls back when the new buckets don't exist");
  reset([row("B1", "W1", "V1", { OnHand: 10 })]);
  store.rejectUnknownBuckets = true;
  r = await reserveStock([L("V1", 4)], ctx());
  check("ok on the legacy schema", r.ok, r.lines[0].message ?? "");
  check("reserved 4", store.rows[0].Quantity.Reserved === 4);
  store.rejectUnknownBuckets = false;

  console.log("\n19. Blocked stock is not sellable");
  reset([row("B1", "W1", "V1", { OnHand: 10, Blocked: 8 })]);
  r = await reserveStock([L("V1", 5)], ctx());
  check("refused", !r.ok);
  check("reason insufficient", r.lines[0].reason === "insufficient");
  r = await reserveStock([L("V1", 2)], ctx());
  check("2 still sellable", r.ok);

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
