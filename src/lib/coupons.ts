import { blocksClient } from "./blocks/client";
import { blocksDataCall } from "./blocks/http";

/**
 * Coupon lookup and rule evaluation.
 *
 * **This is presentation, not enforcement, and the distinction is not academic here.** Every
 * monetary field on an order — `SubTotal`, `DiscountTotal`, `GrandTotal` — is written by this
 * client (`Order.WriteAccessLevel = User`), and the platform offers no way to recompute or
 * validate them server-side. A customer who bypasses this UI can post whatever discount they
 * like whether or not a coupon exists. Nothing below changes that; what catches it is the
 * manual payment confirmation in the backoffice, where a person compares the order's total
 * against what the payment provider actually received. See
 * `bwb-ecommerce-docs/ECOMMERCE_TASK_BREAKDOWN.md` §1.6.
 *
 * So the rules here exist to give an honest answer to an honest customer, not to defend the
 * till.
 */

export const COUPONS_LIVE = import.meta.env.VITE_COUPON_SCHEMA_LIVE === "true";

export interface Coupon {
  Code: string;
  Description?: string;
  DiscountType?: string;
  DiscountValue?: number;
  MinimumSubtotal?: number;
  MaximumDiscount?: number;
  StartsDate?: string;
  ExpiresDate?: string;
  UsageLimit?: number;
  UsageCount?: number;
  Status?: string;
}

export interface CouponResult {
  valid: boolean;
  code: string;
  discountAmount: number;
  message: string;
}

/**
 * Kept until the schema is imported so the flow stays demoable, exactly as before. Deliberately
 * not silently used *instead of* a live lookup — `validateCoupon` only reaches for it while the
 * flag is off.
 */
const DEMO_COUPONS: Coupon[] = [
  { Code: "SAVE10", DiscountType: "percentage", DiscountValue: 10, Status: "active" },
  { Code: "FLAT50", DiscountType: "fixed", DiscountValue: 50, Status: "active" },
];

function fail(code: string, message: string): CouponResult {
  return { valid: false, code, discountAmount: 0, message };
}

/**
 * Applies a coupon's own rules to a subtotal. Pure, so the rules can be checked directly.
 *
 * `now` is a parameter rather than read inside: a coupon that expires between render and
 * checkout should behave predictably under test, and a caller that wants "as of order time"
 * can say so.
 */
export function evaluateCoupon(coupon: Coupon, subtotal: number, now: Date = new Date()): CouponResult {
  const code = (coupon.Code ?? "").toUpperCase();

  if (coupon.Status && coupon.Status !== "active") return fail(code, "That coupon is no longer active.");

  if (coupon.StartsDate && now < new Date(coupon.StartsDate)) {
    return fail(code, "That coupon isn't available yet.");
  }
  if (coupon.ExpiresDate && now > new Date(coupon.ExpiresDate)) {
    return fail(code, "That coupon has expired.");
  }

  // A limit of 0 means "no limit set", not "no redemptions allowed" — the same reading as an
  // unset reorder point in the inventory code, and for the same reason: the default value of
  // an optional number shouldn't behave like a deliberate zero.
  if (coupon.UsageLimit && (coupon.UsageCount ?? 0) >= coupon.UsageLimit) {
    return fail(code, "That coupon has been fully redeemed.");
  }

  if (coupon.MinimumSubtotal && subtotal < coupon.MinimumSubtotal) {
    return fail(code, `Spend at least ${coupon.MinimumSubtotal} to use this coupon.`);
  }

  const value = coupon.DiscountValue ?? 0;
  if (value <= 0) return fail(code, "That coupon code isn't valid.");

  let discount = coupon.DiscountType === "percentage" ? Math.round(subtotal * (value / 100)) : value;
  if (coupon.MaximumDiscount) discount = Math.min(discount, coupon.MaximumDiscount);
  // Never below zero on the order: a fixed coupon worth more than the basket is a free basket,
  // not a refund.
  discount = Math.min(discount, subtotal);

  if (discount <= 0) return fail(code, "That coupon doesn't reduce this order.");

  return { valid: true, code, discountAmount: discount, message: `Coupon ${code} applied.` };
}

const COUPON_QUERY = `query getCoupons($where: CouponFilterInput) {
  getCoupons(where: $where, paging: { pageNo: 1, pageSize: 1 }) {
    items {
      Code Description DiscountType DiscountValue MinimumSubtotal MaximumDiscount
      StartsDate ExpiresDate UsageLimit UsageCount Status
    }
  }
}`;

export async function validateCoupon(code: string, subtotal: number): Promise<CouponResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return fail(normalized, "Enter a coupon code.");

  if (!COUPONS_LIVE) {
    const demo = DEMO_COUPONS.find((c) => c.Code === normalized);
    return demo ? evaluateCoupon(demo, subtotal) : fail(normalized, "That coupon code isn't valid.");
  }

  try {
    const response = (await blocksDataCall(() =>
      blocksClient.data.graphql({
        operationName: "getCoupons",
        query: COUPON_QUERY,
        variables: { where: { Code: { eq: normalized } } },
      })
    )) as { data?: { getCoupons?: { items?: Coupon[] } } };

    const coupon = response.data?.getCoupons?.items?.[0];
    return coupon ? evaluateCoupon(coupon, subtotal) : fail(normalized, "That coupon code isn't valid.");
  } catch {
    // A lookup failure is not an invalid coupon, and saying so would send someone hunting for
    // a typo that isn't there.
    return fail(normalized, "Couldn't check that coupon just now — please try again.");
  }
}
