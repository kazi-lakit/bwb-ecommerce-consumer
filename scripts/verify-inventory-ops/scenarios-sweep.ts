import { reset, store } from "./fake-client";
import { sweepExpiredReservations } from "@/lib/blocks/reservation-sweep";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
function row(id: string, wh: string, v: string, onHand: number, reserved: number) {
  return { ItemId: id, WarehouseId: wh, VariantId: v, Version: 1,
           AvailableToSell: onHand - reserved,
           Quantity: { OnHand: onHand, Reserved: reserved, Damaged: 0, QualityHold: 0, Incoming: 0, Blocked: 0, Backordered: 0, InTransit: 0 } } as never;
}
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
function reservation(id: string, status: string, expires: string, items: { WarehouseId: string; VariantId: string; Quantity: number }[]) {
  return { ItemId: id, ReservationNumber: "RSV-" + id, Status: status, ExpiresDate: expires, Items: items };
}
const actor = { type: "user" as const, id: "U1", name: "Ana" };
const sweep = () => sweepExpiredReservations({ actor, force: true });

export async function run(): Promise<number> {
  console.log("\nS1. an expired reservation gives its stock back");
  reset([row("B1", "W1", "V1", 10, 4)]);
  store.reservations = [reservation("R1", "active", ago(5), [{ WarehouseId: "W1", VariantId: "V1", Quantity: 4 }])];
  let result = await sweep();
  check("one expired", result.expired === 1, JSON.stringify(result));
  check("one line released", result.releasedLines === 1);
  check("reserved back to 0", store.rows[0].Quantity.Reserved === 0);
  check("available restored", store.rows[0].AvailableToSell === 10);
  check("status expired", store.reservations[0].Status === "expired");
  check("released date stamped", typeof store.reservations[0].ReleasedDate === "string");
  check("ledgered", store.movements.length === 1);
  check("reason recorded", store.movements[0].ReasonCode === "reservation_expired");

  console.log("\nS2. a reservation that hasn't expired is left alone");
  reset([row("B1", "W1", "V1", 10, 4)]);
  store.reservations = [reservation("R1", "active", ahead(10), [{ WarehouseId: "W1", VariantId: "V1", Quantity: 4 }])];
  result = await sweep();
  check("nothing scanned", result.scanned === 0);
  check("stock untouched", store.rows[0].Quantity.Reserved === 4);
  check("still active", store.reservations[0].Status === "active");

  console.log("\nS3. an already-settled reservation is not swept again");
  reset([row("B1", "W1", "V1", 10, 0)]);
  store.reservations = [reservation("R1", "released", ago(5), [{ WarehouseId: "W1", VariantId: "V1", Quantity: 4 }])];
  result = await sweep();
  check("nothing scanned", result.scanned === 0);
  check("no stock movement", store.movements.length === 0);

  console.log("\nS4. two sweepers racing: the stock is released exactly once");
  reset([row("B1", "W1", "V1", 10, 6)]);
  store.reservations = [
    reservation("R1", "active", ago(5), [{ WarehouseId: "W1", VariantId: "V1", Quantity: 4 }]),
  ];
  // A second sweeper claims R1 the instant before this one's claim lands.
  let raced = false;
  store.onReservationUpdate = () => {
    if (raced) return;
    raced = true;
    (store.reservations[0] as Record<string, unknown>).Status = "expired";
  };
  result = await sweep();
  check("this sweeper backed off", result.expired === 0, JSON.stringify(result));
  check("released nothing", result.releasedLines === 0);
  // 6 reserved, only 4 of which belong to R1 — a double release would have eaten the other 2.
  check("other reservations' stock untouched", store.rows[0].Quantity.Reserved === 6, JSON.stringify(store.rows[0].Quantity));
  check("no ledger row", store.movements.length === 0);

  console.log("\nS5. multiple expired reservations in one pass");
  reset([row("B1", "W1", "V1", 10, 3), row("B2", "W1", "V2", 10, 5)]);
  store.reservations = [
    reservation("R1", "active", ago(9), [{ WarehouseId: "W1", VariantId: "V1", Quantity: 3 }]),
    reservation("R2", "active", ago(2), [{ WarehouseId: "W1", VariantId: "V2", Quantity: 5 }]),
  ];
  result = await sweep();
  check("both expired", result.expired === 2);
  check("both released", store.rows[0].Quantity.Reserved === 0 && store.rows[1].Quantity.Reserved === 0);

  console.log("\nS6. a reservation spanning two warehouses releases both");
  reset([row("B1", "W1", "V1", 10, 2), row("B2", "W2", "V1", 10, 3)]);
  store.reservations = [
    reservation("R1", "active", ago(1), [
      { WarehouseId: "W1", VariantId: "V1", Quantity: 2 },
      { WarehouseId: "W2", VariantId: "V1", Quantity: 3 },
    ]),
  ];
  result = await sweep();
  check("two lines released", result.releasedLines === 2);
  check("W1 cleared", store.rows[0].Quantity.Reserved === 0);
  check("W2 cleared", store.rows[1].Quantity.Reserved === 0);

  console.log("\nS7. release failing leaves a reconcilable record, not a silent loss");
  reset([row("B1", "W1", "V1", 10, 4)]);
  store.reservations = [reservation("R1", "active", ago(5), [{ WarehouseId: "W1", VariantId: "V1", Quantity: 4 }])];
  store.denyWrites = true;                    // balance writes rejected, reservation writes fine
  result = await sweep();
  check("claimed", result.expired === 1);
  check("reported for attention", result.needsAttention.length === 1, JSON.stringify(result.needsAttention));
  check("status expired", store.reservations[0].Status === "expired");
  check("no released date — the reconcilable signal", store.reservations[0].ReleasedDate === undefined);
  check("stock still held, not lost", store.rows[0].Quantity.Reserved === 4);

  console.log("\nS8. the throttle keeps page loads cheap");
  reset([row("B1", "W1", "V1", 10, 4)]);
  store.reservations = [reservation("R1", "active", ago(5), [{ WarehouseId: "W1", VariantId: "V1", Quantity: 4 }])];
  await sweepExpiredReservations({ actor, force: true });
  store.reservations = [reservation("R2", "active", ago(5), [{ WarehouseId: "W1", VariantId: "V1", Quantity: 1 }])];
  const throttled = await sweepExpiredReservations({ actor });
  check("second call skipped", throttled.skipped === "throttled", JSON.stringify(throttled));
  check("and did no work", throttled.expired === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
