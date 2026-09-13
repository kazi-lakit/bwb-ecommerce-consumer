import { evaluateCoupon, type Coupon } from "@/lib/coupons";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
const NOW = new Date("2026-06-15T12:00:00Z");
const base: Coupon = { Code: "SAVE10", DiscountType: "percentage", DiscountValue: 10, Status: "active" };

export async function run(): Promise<number> {
  console.log("\nK1. a percentage coupon takes its percentage");
  let r = evaluateCoupon(base, 200, NOW);
  check("valid", r.valid);
  check("20 off 200", r.discountAmount === 20, String(r.discountAmount));
  check("code uppercased", evaluateCoupon({ ...base, Code: "save10" }, 200, NOW).code === "SAVE10");

  console.log("\nK2. a fixed coupon takes its amount, but never more than the basket");
  check("50 off 200", evaluateCoupon({ ...base, DiscountType: "fixed", DiscountValue: 50 }, 200, NOW).discountAmount === 50);
  r = evaluateCoupon({ ...base, DiscountType: "fixed", DiscountValue: 500 }, 200, NOW);
  check("capped at the subtotal", r.discountAmount === 200, String(r.discountAmount));
  check("never a refund", r.discountAmount <= 200);

  console.log("\nK3. a percentage cap is respected");
  r = evaluateCoupon({ ...base, DiscountValue: 50, MaximumDiscount: 30 }, 200, NOW);
  check("capped at 30, not 100", r.discountAmount === 30, String(r.discountAmount));

  console.log("\nK4. the date window is honoured");
  check("before it starts", !evaluateCoupon({ ...base, StartsDate: "2026-07-01T00:00:00Z" }, 200, NOW).valid);
  check("says why", evaluateCoupon({ ...base, StartsDate: "2026-07-01T00:00:00Z" }, 200, NOW).message.includes("isn't available yet"));
  check("after it ends", !evaluateCoupon({ ...base, ExpiresDate: "2026-01-01T00:00:00Z" }, 200, NOW).valid);
  check("says expired", evaluateCoupon({ ...base, ExpiresDate: "2026-01-01T00:00:00Z" }, 200, NOW).message.includes("expired"));
  check("inside the window", evaluateCoupon({ ...base, StartsDate: "2026-01-01T00:00:00Z", ExpiresDate: "2026-12-01T00:00:00Z" }, 200, NOW).valid);

  console.log("\nK5. a minimum subtotal is honoured");
  check("below the minimum", !evaluateCoupon({ ...base, MinimumSubtotal: 300 }, 200, NOW).valid);
  check("says the minimum", evaluateCoupon({ ...base, MinimumSubtotal: 300 }, 200, NOW).message.includes("300"));
  check("at the minimum is fine", evaluateCoupon({ ...base, MinimumSubtotal: 200 }, 200, NOW).valid);

  console.log("\nK6. a usage limit of zero means unset, not exhausted");
  // Same reading as an unset ReorderPoint: the default of an optional number must not behave
  // like a deliberate zero, or every unconfigured coupon is dead on arrival.
  check("unset limit still works", evaluateCoupon({ ...base, UsageLimit: 0, UsageCount: 99 }, 200, NOW).valid);
  check("real limit reached", !evaluateCoupon({ ...base, UsageLimit: 5, UsageCount: 5 }, 200, NOW).valid);
  check("real limit not reached", evaluateCoupon({ ...base, UsageLimit: 5, UsageCount: 4 }, 200, NOW).valid);
  check("says redeemed", evaluateCoupon({ ...base, UsageLimit: 1, UsageCount: 1 }, 200, NOW).message.includes("fully redeemed"));

  console.log("\nK7. status gates it");
  check("paused refused", !evaluateCoupon({ ...base, Status: "paused" }, 200, NOW).valid);
  check("expired status refused", !evaluateCoupon({ ...base, Status: "expired" }, 200, NOW).valid);
  check("no status set is allowed", evaluateCoupon({ Code: "X", DiscountType: "fixed", DiscountValue: 5 }, 200, NOW).valid);

  console.log("\nK8. a coupon worth nothing is refused rather than 'applied'");
  check("zero value", !evaluateCoupon({ ...base, DiscountValue: 0 }, 200, NOW).valid);
  check("negative value", !evaluateCoupon({ ...base, DiscountValue: -10 }, 200, NOW).valid);
  // 1% of 20 rounds to 0 — applying it would report success and change nothing.
  check("rounds to nothing", !evaluateCoupon({ ...base, DiscountValue: 1 }, 20, NOW).valid, String(evaluateCoupon({ ...base, DiscountValue: 1 }, 20, NOW).discountAmount));

  console.log("\nK9. a failed evaluation never carries a discount");
  for (const bad of [
    { ...base, Status: "paused" },
    { ...base, ExpiresDate: "2026-01-01T00:00:00Z" },
    { ...base, MinimumSubtotal: 9999 },
    { ...base, UsageLimit: 1, UsageCount: 1 },
  ]) {
    const result = evaluateCoupon(bad, 200, NOW);
    check(`zero discount when invalid (${result.message.slice(0, 24)}…)`, result.discountAmount === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
