export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function titleCase(camel: string): string {
  return camel.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/**
 * A schema field name as a UI label — strips the "Id"/"Ids" reference suffix (so
 * `CategoryIds` reads "Category", `BrandId` reads "Brand", `SourceWarehouseId` reads
 * "Source Warehouse") before title-casing. Only ever changes what's displayed — the
 * underlying field name (and the payload built from it) is untouched.
 */
export function fieldLabel(name: string): string {
  const stripped = name.replace(/Ids$/, "").replace(/Id$/, "");
  return titleCase(stripped || name);
}

/**
 * A human label for an entity record — prefers Name, then Sku, then Code, falling
 * back to its ItemId. Same precedence used everywhere a record needs to read as "the
 * thing a human would call it" (a reference picker's options, a resolved id-column
 * value in a table) instead of a raw id.
 */
export function entityLabel(record: Record<string, unknown>): string {
  const id = (record.ItemId ?? record.itemId) as string | undefined;
  return (record.Name as string) || (record.Sku as string) || (record.Code as string) || id || "";
}

export function formatCurrency(amount?: number | null, currency?: string): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
  }
}

export function formatQuantity(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
