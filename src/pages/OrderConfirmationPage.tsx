import { CheckCircle2 } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/product-pricing";

interface ConfirmationState {
  orderNumber: string;
  total: number;
  currency: string;
  deliveryOption: "doorstep" | "pickup";
}

export default function OrderConfirmationPage() {
  const location = useLocation();
  const state = location.state as ConfirmationState | null;

  if (!state) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <CheckCircle2 size={48} className="mx-auto text-brand-success" />
        <h1 className="font-display mt-4 text-2xl text-ink">Thank you for your order!</h1>
        <p className="mt-2 text-sm text-muted">
          Order <span className="font-medium text-ink">{state.orderNumber}</span> has been placed for{" "}
          <span className="font-medium text-ink">{formatMoney(state.total, state.currency)}</span>.
        </p>
        <p className="mt-1 text-sm text-muted">
          {state.deliveryOption === "pickup" ? "Ready for pickup from our distributor soon." : "Regular delivery: 10 – 14 days."}
        </p>
        <Link to="/products">
          <Button className="mt-6">Continue Shopping</Button>
        </Link>
      </main>
      <StorefrontFooter />
    </div>
  );
}
