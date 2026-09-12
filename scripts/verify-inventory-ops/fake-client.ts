export interface Row { ItemId: string; Version: unknown; AvailableToSell: number; Quantity: Record<string, number>; }
export const store: {
  rows: Row[];
  movements: Record<string, unknown>[];
  casResultOverride: (null | number)[];   // shift()ed; null = behave normally
  failMovement: boolean;
  rejectUnknownBuckets: boolean;
  denyWrites: boolean;
  onCas?: () => void;                      // simulate a concurrent writer
  reservations: Record<string, unknown>[];
  failReservationInsert: boolean;
} = { rows: [], movements: [], casResultOverride: [], failMovement: false, rejectUnknownBuckets: false, denyWrites: false, reservations: [], failReservationInsert: false };

export function reset(rows: Row[]) {
  store.rows = JSON.parse(JSON.stringify(rows));
  store.movements = []; store.casResultOverride = [];
  store.failMovement = false; store.denyWrites = false; store.onCas = undefined;
  store.reservations = []; store.failReservationInsert = false;
}

const NEW_BUCKETS = ["Blocked", "Backordered", "InTransit"];

export const blocksClient = {
  data: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async graphql(req: any): Promise<any> {
      const { operationName, query, variables } = req;

      if (operationName === "getWarehouseInventorys") {
        if (store.rejectUnknownBuckets && NEW_BUCKETS.some((b) => query.includes(b))) {
          throw new Error('Unknown field "Blocked" on type "InventoryQuantity".');
        }
        // Supports the two filter shapes the app actually issues: inventory-ops reads one
        // balance by {WarehouseId:{eq}, VariantId:{eq}}, checkout-inventory reads many by
        // {VariantId:{in:[...]}}.
        const w = variables.where ?? {};
        const matches = (field: any, value: unknown) => {
          if (!field) return true;
          if ("eq" in field) return field.eq === value;
          if ("in" in field) return (field.in as unknown[]).includes(value);
          return true;
        };
        const items = store.rows.filter(
          (r) => matches(w.WarehouseId, (r as any).WarehouseId) && matches(w.VariantId, (r as any).VariantId)
        );
        return { data: { getWarehouseInventorys: { items, totalCount: items.length } } };
      }

      if (operationName === "updateWarehouseInventory") {
        if (store.denyWrites) throw new Error("Access denied for operation EDIT on WarehouseInventory");
        store.onCas?.();
        const forced = store.casResultOverride.shift();
        if (forced !== undefined && forced !== null) {
          return { data: { updateWarehouseInventory: { acknowledged: true, totalImpactedData: forced } } };
        }
        const w = variables.where;
        const row = store.rows.find((r) => r.ItemId === w.ItemId.eq);
        // The real guard, evaluated the way Mongo would in one UpdateOne.
        if (!row) return { data: { updateWarehouseInventory: { totalImpactedData: 0 } } };
        if (row.Version !== w.Version.eq) return { data: { updateWarehouseInventory: { totalImpactedData: 0 } } };
        if (w.AvailableToSell && row.AvailableToSell < w.AvailableToSell.gte)
          return { data: { updateWarehouseInventory: { totalImpactedData: 0 } } };
        row.Quantity = { ...row.Quantity, ...variables.input.Quantity };
        row.AvailableToSell = variables.input.AvailableToSell;
        row.Version = variables.input.Version;
        return { data: { updateWarehouseInventory: { acknowledged: true, totalImpactedData: 1 } } };
      }

      if (operationName === "insertInventoryReservation") {
        if (store.failReservationInsert) throw new Error("reservation insert failed");
        const id = "RES" + (store.reservations.length + 1);
        store.reservations.push({ ItemId: id, ...variables.input });
        return { data: { insertInventoryReservation: { acknowledged: true, itemId: id } } };
      }

      if (operationName === "updateInventoryReservation") {
        const target = store.reservations.find((r) => (r as any).ItemId === variables.where.ItemId.eq);
        if (!target) return { data: { updateInventoryReservation: { totalImpactedData: 0 } } };
        Object.assign(target, variables.input);
        return { data: { updateInventoryReservation: { acknowledged: true, totalImpactedData: 1 } } };
      }

      if (operationName === "insertInventoryMovement") {
        if (store.failMovement) throw new Error("ledger write failed");
        store.movements.push(variables.input);
        return { data: { insertInventoryMovement: { acknowledged: true, itemId: "mov1" } } };
      }
      throw new Error("unexpected operation " + operationName);
    },
  },
};
