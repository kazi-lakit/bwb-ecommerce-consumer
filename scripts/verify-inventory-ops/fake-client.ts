export interface Row { ItemId: string; Version: unknown; AvailableToSell: number; Quantity: Record<string, number>; }
export const store: {
  rows: Row[];
  movements: Record<string, unknown>[];
  casResultOverride: (null | number)[];   // shift()ed; null = behave normally
  failMovement: boolean;
  rejectUnknownBuckets: boolean;
  denyWrites: boolean;
  onCas?: () => void;                      // simulate a concurrent writer
} = { rows: [], movements: [], casResultOverride: [], failMovement: false, rejectUnknownBuckets: false, denyWrites: false };

export function reset(rows: Row[]) {
  store.rows = JSON.parse(JSON.stringify(rows));
  store.movements = []; store.casResultOverride = [];
  store.failMovement = false; store.denyWrites = false; store.onCas = undefined;
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
        const w = variables.where;
        const items = store.rows.filter(
          (r) => (r as any).WarehouseId === w.WarehouseId.eq && (r as any).VariantId === w.VariantId.eq
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

      if (operationName === "insertInventoryMovement") {
        if (store.failMovement) throw new Error("ledger write failed");
        store.movements.push(variables.input);
        return { data: { insertInventoryMovement: { acknowledged: true, itemId: "mov1" } } };
      }
      throw new Error("unexpected operation " + operationName);
    },
  },
};
