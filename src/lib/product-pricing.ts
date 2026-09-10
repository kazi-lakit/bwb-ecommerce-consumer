import type { EntityRecord } from "@/lib/blocks/collections";

export interface Pricing {
  Currency?: string;
  RegularPrice?: number;
  SalePrice?: number;
}

export interface OptionValue {
  Code?: string;
  Name?: string;
  Value?: string;
}

export interface DisplayPrice {
  current: number;
  /** Only set when SalePrice actually undercuts RegularPrice. */
  original?: number;
  currency: string;
}

function pricingOf(variant: EntityRecord | undefined): Pricing | undefined {
  return variant?.Pricing as Pricing | undefined;
}

/** The variant to price a product card/rail by: its DefaultVariantId, else the first variant. */
export function getDefaultVariant(product: EntityRecord, variants: EntityRecord[]): EntityRecord | undefined {
  const defaultId = product.DefaultVariantId as string | undefined;
  return variants.find((v) => (v.ItemId ?? v.itemId) === defaultId) ?? variants[0];
}

export function getVariantPrice(variant: EntityRecord | undefined): DisplayPrice | null {
  const pricing = pricingOf(variant);
  if (!pricing || typeof pricing.RegularPrice !== "number") return null;
  const hasSale = typeof pricing.SalePrice === "number" && pricing.SalePrice < pricing.RegularPrice;
  return {
    current: hasSale ? pricing.SalePrice! : pricing.RegularPrice,
    original: hasSale ? pricing.RegularPrice : undefined,
    currency: pricing.Currency || "USD",
  };
}

/** Convenience: price a product by its default variant, given the full list of its variants. */
export function getProductPrice(product: EntityRecord, variants: EntityRecord[]): DisplayPrice | null {
  return getVariantPrice(getDefaultVariant(product, variants));
}

export function isOnSale(variant: EntityRecord | undefined): boolean {
  return Boolean(getVariantPrice(variant)?.original);
}

export function formatMoney(amount: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toFixed(0)}`;
}

/** Distinct color option values across a product's variants, if any variant declares a "color" option. */
export function getColorSwatchValues(variants: EntityRecord[]): string[] {
  const colors = new Set<string>();
  for (const variant of variants) {
    const optionValues = Array.isArray(variant.OptionValues) ? (variant.OptionValues as OptionValue[]) : [];
    for (const option of optionValues) {
      if (option.Code && /colou?r/i.test(option.Code) && option.Value) colors.add(option.Value);
    }
  }
  return [...colors];
}

export function getColorCount(variants: EntityRecord[]): number {
  const colors = getColorSwatchValues(variants);
  return colors.length > 0 ? colors.length : variants.length;
}
