import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useCart } from "@/components/providers/cart-provider";
import { useEntityList } from "@/lib/blocks/hooks";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { PaymentPartnersBar } from "@/components/storefront/payment-partners-bar";
import { ProductRail, type ProductRailItem } from "@/components/storefront/product-rail";
import { QuantityStepper } from "@/components/storefront/quantity-stepper";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/product-pricing";
import { validateCoupon, type CouponResult } from "@/lib/coupons";

const DELIVERY_CHARGE = 120;

export default function CartPage() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { items, updateQuantity, remove, subtotal } = useCart();
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const cartPlaceholders = useMemo(() => assignPlaceholders(items, theme), [items, theme]);

  const suggestions = useEntityList("Product", { pageSize: 8 });
  const suggestionPlaceholders = useMemo(
    () => assignPlaceholders(suggestions.data?.items ?? [], theme),
    [suggestions.data, theme]
  );
  const suggestionItems: ProductRailItem[] = (suggestions.data?.items ?? []).map((product, i) => ({
    product,
    placeholderImage: suggestionPlaceholders[i],
  }));

  const currency = items[0]?.currency ?? "USD";
  const discount = coupon?.valid ? coupon.discountAmount : 0;
  const total = Math.max(0, subtotal + DELIVERY_CHARGE - discount);

  function applyCoupon() {
    if (!couponInput.trim()) return;
    setCoupon(validateCoupon(couponInput, subtotal));
  }

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="font-display mb-6 text-[28px] text-ink">Cart</h1>

        {items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-muted">Your cart is empty.</p>
            <Link to="/products" className="mt-3 inline-block text-sm font-medium text-brand-accent hover:underline">
              Continue shopping
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={item.key} className="flex gap-4 rounded-md border border-hairline p-4">
                  <div className="h-20 w-20 flex-none overflow-hidden rounded-md bg-surface">
                    <ImageWithFallback
                      src={item.imageUrl}
                      fallback={cartPlaceholders[i]}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ink">{item.name}</p>
                        <p className="text-xs text-muted">No customization available on this product.</p>
                        <p className="mt-1 text-xs text-muted">Regular Delivery: 10 – 14 days delivery</p>
                      </div>
                      <button type="button" aria-label="Remove item" onClick={() => remove(item.key)} className="text-muted hover:text-ink">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <QuantityStepper value={item.quantity} onChange={(q) => updateQuantity(item.key, q)} />
                      <span className="text-sm font-semibold text-ink">
                        {formatMoney(item.unitPrice * item.quantity, item.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="rounded-md border border-hairline p-4">
                <h2 className="text-sm font-semibold text-ink">Apply Coupon</h2>
                <div className="mt-2 flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="Enter here"
                    className="h-10 flex-1 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-brand-accent"
                  />
                  <Button size="sm" variant="secondary" onClick={applyCoupon}>
                    Apply
                  </Button>
                </div>
                {coupon && (
                  <p className={`mt-2 text-xs ${coupon.valid ? "text-brand-success" : "text-brand-error"}`}>{coupon.message}</p>
                )}
              </div>

              <div className="rounded-md border border-hairline p-4">
                <h2 className="text-sm font-semibold text-ink">Order Summary</h2>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between text-steel">
                    <span>Subtotal</span>
                    <span>{formatMoney(subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between text-steel">
                    <span>Delivery Charge</span>
                    <span>{formatMoney(DELIVERY_CHARGE, currency)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-brand-success">
                      <span>Discount</span>
                      <span>-{formatMoney(discount, currency)}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-baseline justify-between border-t border-hairline-soft pt-3">
                  <div>
                    <p className="text-base font-semibold text-ink">Total</p>
                    <p className="text-xs text-muted">(including VAT)</p>
                  </div>
                  <span className="text-lg font-semibold text-ink">{formatMoney(total, currency)}</span>
                </div>
                <Button className="mt-4 w-full" onClick={() => navigate("/checkout")}>
                  Checkout →
                </Button>
              </div>
            </div>
          </div>
        )}

        <ProductRail title="Customer also Viewed these items" items={suggestionItems} loading={suggestions.isLoading} />

        <PaymentPartnersBar />
      </main>

      <StorefrontFooter />
    </div>
  );
}
