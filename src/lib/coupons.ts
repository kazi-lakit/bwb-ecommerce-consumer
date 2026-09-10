/**
 * Placeholder coupon catalog — there is no Coupon schema on the Data Gateway yet.
 * Swap `validateCoupon` for a real lookup (e.g. `useEntityList("Coupon", { where: { Code: { eq } } })`)
 * once that schema exists; the return shape here is deliberately schema-shaped so callers
 * won't need to change.
 */
interface DemoCoupon {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
}

const DEMO_COUPONS: DemoCoupon[] = [
  { code: "SAVE10", discountType: "percentage", discountValue: 10 },
  { code: "FLAT50", discountType: "fixed", discountValue: 50 },
];

export interface CouponResult {
  valid: boolean;
  code: string;
  discountAmount: number;
  message: string;
}

export function validateCoupon(code: string, subtotal: number): CouponResult {
  const normalized = code.trim().toUpperCase();
  const coupon = DEMO_COUPONS.find((c) => c.code === normalized);
  if (!coupon) {
    return { valid: false, code: normalized, discountAmount: 0, message: "That coupon code isn't valid." };
  }
  const discountAmount =
    coupon.discountType === "percentage" ? Math.round(subtotal * (coupon.discountValue / 100)) : coupon.discountValue;
  return {
    valid: true,
    code: normalized,
    discountAmount: Math.min(discountAmount, subtotal),
    message: `Coupon ${normalized} applied.`,
  };
}
