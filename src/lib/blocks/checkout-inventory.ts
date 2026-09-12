import { blocksClient } from "./client";
import { blocksDataCall } from "./http";
import {
  INVENTORY_WRITES_LIVE,
  releaseStock,
  reserveStock,
  unavailableLines,
  type Actor,
  type StockLine,
  type StockOpResult,
} from "./inventory-ops";
import type { CartLine } from "@/components/providers/cart-provider";

/**
 * Checkout's side of inventory: turn cart lines into warehouse-specific stock lines, hold
 * them, and give them back if anything goes wrong.
 *
 * The ordering here is the whole point, and it is deliberate. There is no transaction
 * spanning the reservation record, the balances and the order, so the sequence is chosen so
 * that every possible crash point leaves recoverable state:
 *
 *   1. allocate            read-only
 *   2. write the reservation record (active, with an expiry)
 *   3. move the balances   reserveStock
 *   4. place the order
 *   5. point the reservation at the order
 *
 * The record is written *before* the balances move, not after, so stock can never be held
 * without something naming it. The opposite order has a window where a crash strands reserved
 * stock with nothing to find it by. This way the worst case is a reservation record whose
 * stock was never taken — harmless, and the expiry sweep releases zero.
 *
 * Nothing here commits stock. Committing reduces on-hand, which is what happens when goods
 * physically leave — a fulfillment action in the backoffice, not something a storefront
 * checkout can know has happened. Placing an order leaves the reservation `active`.
 */

/** Reservations outlive the checkout form but not by much; the expiry sweep (S6) collects them. */
const RESERVATION_TTL_MINUTES = 20;

export interface AllocationLine extends StockLine {
  cartKey: string;
  name: string;
}

export interface AllocationResult {
  /** Warehouse-specific lines to reserve. One cart line can split across warehouses. */
  lines: AllocationLine[];
  /** Cart lines that couldn't be fully covered by available stock anywhere. */
  shortfalls: { cartKey: string; name: string; requested: number; available: number }[];
  /** Cart lines with no inventory record at all — not tracked, so not reserved. */
  untracked: string[];
}

interface StockRow {
  WarehouseId?: string;
  VariantId?: string;
  AvailableToSell?: number;
}

const STOCK_QUERY = `query getWarehouseInventorys($where: WarehouseInventoryFilterInput, $paging: PaginationInput) {
  getWarehouseInventorys(where: $where, paging: $paging) {
    items { WarehouseId VariantId AvailableToSell }
    totalCount
  }
}`;

async function fetchStockRows(variantIds: string[]): Promise<StockRow[]> {
  if (variantIds.length === 0) return [];
  const response = (await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "getWarehouseInventorys",
      query: STOCK_QUERY,
      variables: {
        where: { VariantId: { in: variantIds } },
        paging: { pageNo: 1, pageSize: 200 },
      },
    })
  )) as { data?: { getWarehouseInventorys?: { items?: StockRow[] } } };
  return response.data?.getWarehouseInventorys?.items ?? [];
}

/**
 * Greedy allocation: fill each cart line from the warehouse with the most available stock
 * first, splitting across warehouses only when one can't cover the line.
 *
 * This is a placeholder strategy, deliberately the simplest defensible one — it minimises the
 * number of warehouses a line touches, which is the right default when nothing is known about
 * shipping cost or customer location. A real strategy (proximity, cost, split penalties) is
 * its own task in Phase 2; none of the callers here need to change when it lands.
 *
 * A variant with no `WarehouseInventory` row is treated as untracked, not as out of stock —
 * the same distinction `inventory.ts`'s `isTracked` draws, and the same reason: a product
 * nobody has set up inventory for should still be sellable.
 */
export async function allocateCartLines(items: CartLine[]): Promise<AllocationResult> {
  const tracked = items.filter((item) => Boolean(item.variantId));
  const rows = await fetchStockRows(tracked.map((item) => item.variantId as string));

  const byVariant = new Map<string, StockRow[]>();
  for (const row of rows) {
    if (!row.VariantId || !row.WarehouseId) continue;
    const list = byVariant.get(row.VariantId) ?? [];
    list.push(row);
    byVariant.set(row.VariantId, list);
  }

  const lines: AllocationLine[] = [];
  const shortfalls: AllocationResult["shortfalls"] = [];
  const untracked: string[] = [];

  for (const item of items) {
    const variantId = item.variantId;
    const candidates = variantId ? byVariant.get(variantId) : undefined;
    if (!variantId || !candidates || candidates.length === 0) {
      untracked.push(item.key);
      continue;
    }

    let remaining = item.quantity;
    let totalAvailable = 0;
    const sorted = [...candidates].sort((a, b) => (b.AvailableToSell ?? 0) - (a.AvailableToSell ?? 0));

    for (const row of sorted) {
      const available = Math.max(0, row.AvailableToSell ?? 0);
      totalAvailable += available;
      if (remaining <= 0 || available === 0) continue;
      const take = Math.min(remaining, available);
      lines.push({
        cartKey: item.key,
        name: item.name,
        warehouseId: row.WarehouseId as string,
        variantId,
        productId: item.productId,
        quantity: take,
      });
      remaining -= take;
    }

    if (remaining > 0) {
      shortfalls.push({
        cartKey: item.key,
        name: item.name,
        requested: item.quantity,
        available: totalAvailable,
      });
    }
  }

  // A partial allocation is not a reservation. If any line falls short, hold nothing —
  // reserving some of a cart the customer can't actually buy just strands stock.
  return shortfalls.length > 0 ? { lines: [], shortfalls, untracked } : { lines, shortfalls, untracked };
}

const INSERT_RESERVATION = `mutation insertInventoryReservation($input: InventoryReservationInsertInput!) {
  insertInventoryReservation(input: $input) { acknowledged itemId message }
}`;

const UPDATE_RESERVATION = `mutation updateInventoryReservation($where: InventoryReservationFilterInput, $input: InventoryReservationUpdateInput!) {
  updateInventoryReservation(where: $where, input: $input) { acknowledged totalImpactedData message }
}`;

async function createReservationRecord(
  lines: AllocationLine[],
  customerId: string,
  attemptKey: string
): Promise<string | null> {
  const expires = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000).toISOString();
  const response = (await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "insertInventoryReservation",
      query: INSERT_RESERVATION,
      variables: {
        input: {
          ReservationNumber: `RSV-${Date.now().toString(36).toUpperCase()}`,
          // Points at the checkout attempt, because no order exists yet. Repointed at the
          // order once one does — see attachReservationToOrder.
          Source: { Type: "checkout", Id: attemptKey },
          CustomerId: customerId,
          Status: "active",
          Items: lines.map((line) => ({
            WarehouseId: line.warehouseId,
            ProductId: line.productId,
            VariantId: line.variantId,
            Sku: line.sku,
            Quantity: line.quantity,
          })),
          ExpiresDate: expires,
        },
      },
    })
  )) as { data?: { insertInventoryReservation?: { itemId?: string } } };
  return response.data?.insertInventoryReservation?.itemId ?? null;
}

async function settleReservationRecord(
  reservationId: string,
  status: "released" | "expired"
): Promise<void> {
  await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "updateInventoryReservation",
      query: UPDATE_RESERVATION,
      variables: {
        where: { ItemId: { eq: reservationId } },
        input: { Status: status, ReleasedDate: new Date().toISOString() },
      },
    })
  );
}

export interface CheckoutHold {
  reservationId: string;
  lines: AllocationLine[];
  attemptKey: string;
  actor: Actor;
}

export type HoldOutcome =
  | { kind: "held"; hold: CheckoutHold; untracked: string[] }
  | { kind: "skipped"; reason: "writes-disabled" | "nothing-tracked" }
  | { kind: "unavailable"; shortfalls: AllocationResult["shortfalls"] }
  | { kind: "failed"; message: string };

/**
 * Allocate and hold stock for a checkout attempt.
 *
 * `skipped` is a success, not a failure: it means there is nothing to reserve (no tracked
 * variants) or reservations aren't enabled yet, and checkout should carry on exactly as it
 * does today. Only `unavailable` and `failed` should stop the customer.
 */
export async function holdStockForCheckout(
  items: CartLine[],
  customerId: string,
  attemptKey: string,
  actor: Actor
): Promise<HoldOutcome> {
  if (!INVENTORY_WRITES_LIVE) return { kind: "skipped", reason: "writes-disabled" };

  let allocation: AllocationResult;
  try {
    allocation = await allocateCartLines(items);
  } catch (error) {
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }

  if (allocation.shortfalls.length > 0) {
    return { kind: "unavailable", shortfalls: allocation.shortfalls };
  }
  if (allocation.lines.length === 0) {
    return { kind: "skipped", reason: "nothing-tracked" };
  }

  // Record first, stock second — see the module comment. If this write fails, nothing has
  // been held, so there is nothing to clean up.
  let reservationId: string | null;
  try {
    reservationId = await createReservationRecord(allocation.lines, customerId, attemptKey);
  } catch (error) {
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }
  if (!reservationId) {
    return { kind: "failed", message: "Could not create the reservation record." };
  }

  const result: StockOpResult = await reserveStock(allocation.lines, {
    reference: { type: "reservation", id: reservationId },
    performedBy: actor,
    idempotencyKey: attemptKey,
  });

  if (!result.ok) {
    // reserveStock has already rolled back whichever lines it did take, so the record now
    // describes stock nobody holds. Close it out rather than leaving it for the sweep.
    await settleReservationRecord(reservationId, "released").catch(() => undefined);
    const short = unavailableLines(result).map((line) => {
      const source = allocation.lines.find(
        (l) => l.variantId === line.line.variantId && l.warehouseId === line.line.warehouseId
      );
      return {
        cartKey: source?.cartKey ?? line.line.variantId,
        name: source?.name ?? line.line.variantId,
        requested: line.line.quantity,
        available: 0,
      };
    });
    if (short.length > 0) return { kind: "unavailable", shortfalls: short };
    return {
      kind: "failed",
      message: result.lines.find((l) => !l.ok)?.message ?? "Could not hold stock for this order.",
    };
  }

  return {
    kind: "held",
    hold: { reservationId, lines: allocation.lines, attemptKey, actor },
    untracked: allocation.untracked,
  };
}

/**
 * Give a hold back. Called when order placement fails, and safe to call more than once:
 * `releaseStock` clamps to what is actually reserved, so a second release moves nothing.
 */
export async function releaseCheckoutHold(hold: CheckoutHold): Promise<void> {
  await releaseStock(hold.lines, {
    reference: { type: "reservation", id: hold.reservationId },
    performedBy: hold.actor,
    reasonCode: "checkout_abandoned",
    idempotencyKey: `${hold.attemptKey}:release`,
  });
  await settleReservationRecord(hold.reservationId, "released").catch(() => undefined);
}

/**
 * Repoint a hold at the order it turned into, so the backoffice can find it at fulfillment
 * time. Best-effort: the order is already placed and the stock is already held correctly, so
 * a failure here costs traceability, not correctness — and the reservation's expiry would be
 * the only casualty, which a staff member can settle by hand.
 */
export async function attachHoldToOrder(
  hold: CheckoutHold,
  orderItemId: string,
  orderNumber: string
): Promise<void> {
  await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "updateInventoryReservation",
      query: UPDATE_RESERVATION,
      variables: {
        where: { ItemId: { eq: hold.reservationId } },
        input: { Source: { Type: "order", Id: orderItemId, Number: orderNumber } },
      },
    })
  );
}
