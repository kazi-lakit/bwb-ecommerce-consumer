import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { useCart } from "@/components/providers/cart-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useCommerceCustomer } from "@/components/providers/commerce-customer-provider";
import { startLogin } from "@/lib/blocks/auth";
import { toast } from "@/lib/toast-store";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney } from "@/lib/product-pricing";
import { validateCoupon, type CouponResult } from "@/lib/coupons";
import { COMMERCE_SCHEMAS_LIVE, generateIdempotencyKey, placeOrder as placeOrderRemote } from "@/lib/blocks/commerce";
import {
  attachHoldToOrder,
  holdStockForCheckout,
  releaseCheckoutHold,
  type CheckoutHold,
} from "@/lib/blocks/checkout-inventory";

const DELIVERY_CHARGE = 120;

function AccordionSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="rounded-md border border-hairline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink"
      >
        {title}
        <ChevronDown size={16} className={clsx("text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-hairline-soft p-4">{children}</div>}
    </div>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { status, user } = useAuth();
  const { items, subtotal, clear } = useCart();
  const { customer, saveAddress } = useCommerceCustomer();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phoneNumber ?? "");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [saveThisAddress, setSaveThisAddress] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [deliveryOption, setDeliveryOption] = useState<"doorstep" | "pickup">("doorstep");
  const [agreed, setAgreed] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const [placing, setPlacing] = useState(false);
  // Generated once per mount and reused across retries of the same checkout attempt, so a
  // resubmit after a failed/slow request can't place the order twice once IdempotencyKey
  // is backed by a real unique index (see commerce.ts).
  const idempotencyKeyRef = useRef(generateIdempotencyKey());

  useEffect(() => {
    if (user) {
      setFirstName((v) => v || user.firstName || "");
      setLastName((v) => v || user.lastName || "");
      setEmail((v) => v || user.email || "");
      setPhone((v) => v || user.phoneNumber || "");
    }
  }, [user]);

  // Prefill from the most recently saved address on the commerce profile, if any — never
  // overwrites something the customer already typed. `customer` stays null (no-op) until
  // the Commerce schemas are live and this profile has loaded.
  useEffect(() => {
    const saved = customer?.addresses.at(-1);
    if (!saved) return;
    setAddressLine((v) => v || saved.Line1 || "");
    setCity((v) => v || saved.City || "");
    setPostalCode((v) => v || saved.PostalCode || "");
  }, [customer]);

  const currency = items[0]?.currency ?? "USD";
  const discount = coupon?.valid ? coupon.discountAmount : 0;
  const deliveryCharge = deliveryOption === "pickup" ? 0 : DELIVERY_CHARGE;
  const total = Math.max(0, subtotal + deliveryCharge - discount);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <div className="flex justify-center py-24">
          <Spinner className="h-6 w-6" />
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-xl text-ink">Sign in to check out</h1>
          <p className="mt-2 text-sm text-muted">Log in or create an account so we can save your order.</p>
          <Button className="mt-5" onClick={() => void startLogin("/checkout")}>
            Log in / Create an Account
          </Button>
        </div>
        <StorefrontFooter />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-xl text-ink">Your cart is empty</h1>
          <p className="mt-2 text-sm text-muted">Add something to your cart before checking out.</p>
          <Button className="mt-5" onClick={() => navigate("/products")}>
            Browse products
          </Button>
        </div>
        <StorefrontFooter />
      </div>
    );
  }

  function applyCoupon() {
    if (!couponInput.trim()) return;
    setCoupon(validateCoupon(couponInput, subtotal));
  }

  async function placeOrder() {
    if (!agreed) {
      toast.error("Please agree to the terms & conditions to continue.");
      return;
    }
    if (!addressLine.trim() || !city.trim()) {
      toast.error("Please fill in your delivery address.");
      return;
    }
    setPlacing(true);

    if (!COMMERCE_SCHEMAS_LIVE) {
      // Order schema not imported yet (see COMMERCE_SCHEMAS_DRAFT.md) — simulates
      // placement so the flow can still be demoed/tested end to end.
      setTimeout(() => {
        clear();
        navigate("/order-confirmation", {
          state: { orderNumber: `ORD-${Date.now().toString().slice(-8)}`, total, currency, deliveryOption },
        });
      }, 500);
      return;
    }

    // Hold the stock before taking the order, so two customers can't buy the same last unit.
    // Only on the real-order path: reserving live stock against a simulated order would strand
    // it until expiry. Returns `skipped` when nothing is tracked or reservations aren't
    // enabled yet, and checkout carries on exactly as before.
    let hold: CheckoutHold | null = null;
    const outcome = await holdStockForCheckout(items, user!.itemId, idempotencyKeyRef.current, {
      type: "user",
      id: user!.itemId,
      name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined,
    });

    if (outcome.kind === "unavailable") {
      const names = outcome.shortfalls.map((s) => `${s.name} (${s.available} left)`).join(", ");
      toast.error(`Some items sold out while you were checking out: ${names}. Please update your cart.`);
      setPlacing(false);
      return;
    }
    if (outcome.kind === "failed") {
      toast.error(`Couldn't hold stock for your order: ${outcome.message}`);
      setPlacing(false);
      return;
    }
    if (outcome.kind === "held") {
      hold = outcome.hold;
    }

    try {
      const { itemId, orderNumber } = await placeOrderRemote({
        customerId: user!.itemId,
        items,
        currency,
        subTotal: subtotal,
        discountTotal: discount,
        shippingTotal: deliveryCharge,
        grandTotal: total,
        couponCode: coupon?.valid ? couponInput.trim() : undefined,
        shippingAddress: { Line1: addressLine.trim(), City: city.trim(), PostalCode: postalCode.trim() },
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (saveThisAddress) {
        // Best-effort — the order already placed successfully; don't fail checkout over
        // a profile-convenience write.
        void saveAddress({ Line1: addressLine.trim(), City: city.trim(), PostalCode: postalCode.trim() });
      }
      if (hold) {
        // Also best-effort, and for the same reason: the stock is already held correctly,
        // this only records which order it's held for. The reservation stays `active` —
        // committing it reduces on-hand, which happens when the goods actually ship.
        void attachHoldToOrder(hold, itemId, orderNumber);
      }
      clear();
      navigate("/order-confirmation", { state: { orderNumber, itemId, total, currency, deliveryOption } });
    } catch {
      // blocksDataCall already surfaced a toast for the specific error; keep the cart and
      // idempotency key intact so the customer can just retry.
      if (hold) {
        // Give the stock back straight away rather than making someone else wait out the
        // reservation's expiry for inventory this order never took.
        void releaseCheckoutHold(hold);
      }
      setPlacing(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="font-display mb-6 text-[28px] text-ink">Checkout</h1>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <AccordionSection title="Personal Information" defaultOpen>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
              </div>
            </AccordionSection>

            <AccordionSection title="Delivery Address" defaultOpen>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder="Street address"
                  className="sm:col-span-2"
                />
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" />
              </div>
              {customer && (
                <label className="mt-3 flex items-center gap-2 text-xs text-steel">
                  <input
                    type="checkbox"
                    checked={saveThisAddress}
                    onChange={(e) => setSaveThisAddress(e.target.checked)}
                    className="accent-[var(--color-brand-accent)]"
                  />
                  Save this address to my account
                </label>
              )}
            </AccordionSection>

            <AccordionSection title="Select Payment Method">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="card">Credit / Debit Card</option>
                <option value="mobile-banking">Mobile Banking (bKash / Nagad)</option>
                <option value="cod">Cash on Delivery</option>
              </Select>
            </AccordionSection>

            <AccordionSection title="Delivery Option" defaultOpen>
              <div className="space-y-2">
                <label
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm",
                    deliveryOption === "doorstep" ? "border-brand-accent bg-brand-accent-soft" : "border-hairline"
                  )}
                >
                  <input
                    type="radio"
                    name="delivery"
                    checked={deliveryOption === "doorstep"}
                    onChange={() => setDeliveryOption("doorstep")}
                    className="accent-[var(--color-brand-accent)]"
                  />
                  <span className="text-ink">Door Step Delivery</span>
                </label>
                <label
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm",
                    deliveryOption === "pickup" ? "border-brand-accent bg-brand-accent-soft" : "border-hairline"
                  )}
                >
                  <input
                    type="radio"
                    name="delivery"
                    checked={deliveryOption === "pickup"}
                    onChange={() => setDeliveryOption("pickup")}
                    className="accent-[var(--color-brand-accent)]"
                  />
                  <span className="text-ink">Local Pickup – Collect from our Distributor (Free Shipping)</span>
                </label>
              </div>
            </AccordionSection>

            <label className="flex items-start gap-2 text-xs text-steel">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 accent-[var(--color-brand-accent)]"
              />
              I agree with all the terms &amp; conditions, privacy &amp; policies, and return &amp; exchange.
            </label>
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
                  <span>{deliveryCharge === 0 ? "Free" : formatMoney(deliveryCharge, currency)}</span>
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
              <Button className="mt-4 w-full" onClick={placeOrder} disabled={placing}>
                {placing ? "Placing Order…" : "Place Order"}
              </Button>
            </div>
          </div>
        </div>
      </main>

      <StorefrontFooter />
    </div>
  );
}
