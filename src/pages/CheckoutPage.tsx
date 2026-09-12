import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  COMMERCE_SCHEMAS_LIVE,
  formatAddress,
  generateIdempotencyKey,
  placeOrder as placeOrderRemote,
} from "@/lib/blocks/commerce";
import {
  attachHoldToOrder,
  holdStockForCheckout,
  releaseCheckoutHold,
  type CheckoutHold,
} from "@/lib/blocks/checkout-inventory";
import { sweepExpiredReservationsInBackground } from "@/lib/blocks/reservation-sweep";

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
  // Which saved address is in use: an index into the profile's list, or "new" for the form.
  // Null means "not decided yet" — the effect below picks once the profile loads, and never
  // again, so it can't stamp over a choice the customer has made.
  const [addressChoice, setAddressChoice] = useState<number | "new" | null>(null);
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

  // Collect stock abandoned by other people's expired checkouts before this one allocates —
  // there is no scheduler, so arriving at checkout is one of the moments something has to
  // notice (reservation-sweep.ts). Throttled per session and fire-and-forget: it must never
  // be what makes this page slow, and a sweep that doesn't run just means slightly less
  // stock is visible.
  useEffect(() => {
    sweepExpiredReservationsInBackground();
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName((v) => v || user.firstName || "");
      setLastName((v) => v || user.lastName || "");
      setEmail((v) => v || user.email || "");
      setPhone((v) => v || user.phoneNumber || "");
    }
  }, [user]);

  // Memoised: `?? []` would hand the effects below a fresh array identity every render.
  const savedAddresses = useMemo(() => customer?.addresses ?? [], [customer]);

  // Pick a default once, when the profile first arrives: the most recently saved address,
  // which is the one someone is most likely to want again. Guarded on addressChoice still
  // being null so a later profile refresh can't undo a deliberate choice. `customer` stays
  // null (so this is a no-op) until the Commerce schemas are live.
  useEffect(() => {
    if (addressChoice !== null || savedAddresses.length === 0) return;
    setAddressChoice(savedAddresses.length - 1);
  }, [addressChoice, savedAddresses.length]);

  /**
   * The saved addresses fill the same form fields a typed address would, rather than
   * bypassing them. One source of truth for validation, order placement and the "save this
   * address" path — picking a saved address is a shortcut for typing it, not a second code
   * path that could drift from the first.
   */
  useEffect(() => {
    if (typeof addressChoice !== "number") return;
    const chosen = savedAddresses[addressChoice];
    if (!chosen) return;
    setAddressLine(chosen.Line1 ?? "");
    setCity(chosen.City ?? "");
    setPostalCode(chosen.PostalCode ?? "");
  }, [addressChoice, savedAddresses]);

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

    // Re-check availability before taking the order — the cart may have been sitting open
    // while someone else bought the last unit. The check runs on every path, including the
    // simulated one, because reading stock works today; only the hold waits on the schema
    // imports. Holding against a simulated order would strand stock until expiry, so the
    // hold itself is gated on placement being real.
    let hold: CheckoutHold | null = null;
    const outcome = await holdStockForCheckout(
      items,
      user!.itemId,
      idempotencyKeyRef.current,
      {
        type: "user",
        id: user!.itemId,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined,
      },
      { hold: COMMERCE_SCHEMAS_LIVE }
    );

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
      if (saveThisAddress && addressChoice === "new") {
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
              {savedAddresses.length > 0 && (
                <div className="mb-4 space-y-2">
                  {savedAddresses.map((address, i) => (
                    <label
                      key={`${address.Line1}-${i}`}
                      className={clsx(
                        "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm",
                        addressChoice === i ? "border-brand-accent bg-surface" : "border-hairline"
                      )}
                    >
                      <input
                        type="radio"
                        name="delivery-address"
                        checked={addressChoice === i}
                        onChange={() => setAddressChoice(i)}
                        className="mt-0.5 accent-[var(--color-brand-accent)]"
                      />
                      <span className="text-ink">{formatAddress(address)}</span>
                    </label>
                  ))}
                  <label
                    className={clsx(
                      "flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm",
                      addressChoice === "new" ? "border-brand-accent bg-surface" : "border-hairline"
                    )}
                  >
                    <input
                      type="radio"
                      name="delivery-address"
                      checked={addressChoice === "new"}
                      onChange={() => {
                        setAddressChoice("new");
                        setAddressLine("");
                        setCity("");
                        setPostalCode("");
                      }}
                      className="accent-[var(--color-brand-accent)]"
                    />
                    <span className="text-ink">Use a different address</span>
                  </label>
                </div>
              )}

              {/* Always rendered, never hidden behind the picker: a saved address the
                  customer wants to tweak for this one order should be editable in place.
                  Typing switches the choice to "new" so the edit isn't silently discarded
                  by the effect that mirrors the selected address back into these fields. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  value={addressLine}
                  onChange={(e) => {
                    setAddressChoice("new");
                    setAddressLine(e.target.value);
                  }}
                  placeholder="Street address"
                  className="sm:col-span-2"
                />
                <Input
                  value={city}
                  onChange={(e) => {
                    setAddressChoice("new");
                    setCity(e.target.value);
                  }}
                  placeholder="City"
                />
                <Input
                  value={postalCode}
                  onChange={(e) => {
                    setAddressChoice("new");
                    setPostalCode(e.target.value);
                  }}
                  placeholder="Postal code"
                />
              </div>

              {/* Only offered for an address that isn't already on the profile. Saving one
                  that's already there is a no-op (addCustomerAddress dedupes), but offering
                  it would suggest otherwise. */}
              {customer && addressChoice === "new" && (
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
