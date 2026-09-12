import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { COMMERCE_SCHEMAS_LIVE, formatAddress } from "@/lib/blocks/commerce";
import { getMyOrder } from "@/lib/blocks/account";
import { AccountLayout } from "@/components/storefront/account-layout";
import { EmptyNotice, OrderStatusLine } from "@/pages/AccountOrdersPage";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney } from "@/lib/product-pricing";
import { usePageMeta } from "@/lib/seo";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className={strong ? "font-semibold text-ink" : "text-muted"}>{label}</span>
      <span className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</span>
    </div>
  );
}

export default function AccountOrderDetailPage() {
  usePageMeta({ title: "Order — Logoipsum", noIndex: true });
  const { orderId } = useParams();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["my-order", user?.itemId, orderId],
    queryFn: () => getMyOrder(user!.itemId, orderId!),
    enabled: Boolean(user?.itemId && orderId) && COMMERCE_SCHEMAS_LIVE,
  });

  const order = query.data;
  const currency = order?.Currency ?? "USD";

  return (
    <AccountLayout title={order?.OrderNumber ?? "Order"}>
      <Link to="/account/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> All orders
      </Link>

      {query.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : !order ? (
        <EmptyNotice
          title="Order not found"
          body="It may have been removed, or it belongs to a different account."
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <OrderStatusLine order={order} />
            <span className="text-xs text-muted">
              Placed {new Date(order.PlacedDate ?? order.CreatedDate ?? Date.now()).toLocaleString()}
            </span>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Items</h2>
            <div className="divide-y divide-hairline-soft rounded-md border border-hairline">
              {(order.Items ?? []).map((item, i) => (
                <div key={`${item.VariantId}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{item.NameSnapshot ?? item.Sku ?? item.VariantId}</p>
                    <p className="text-xs text-muted">
                      {item.Quantity} × {formatMoney(item.UnitPrice ?? 0, currency)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-sm text-ink">
                    {formatMoney(item.LineTotal ?? (item.UnitPrice ?? 0) * (item.Quantity ?? 0), currency)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-hairline px-3 py-2">
            <Row label="Subtotal" value={formatMoney(order.SubTotal ?? 0, currency)} />
            {(order.TaxTotal ?? 0) > 0 && <Row label="Tax" value={formatMoney(order.TaxTotal ?? 0, currency)} />}
            <Row label="Delivery" value={formatMoney(order.ShippingTotal ?? 0, currency)} />
            {(order.DiscountTotal ?? 0) > 0 && (
              <Row
                label={`Discount${order.CouponCode ? ` (${order.CouponCode})` : ""}`}
                value={`− ${formatMoney(order.DiscountTotal ?? 0, currency)}`}
              />
            )}
            <Row label="Total" value={formatMoney(order.GrandTotal ?? 0, currency)} strong />
          </section>

          {order.ShippingAddress && (
            <section>
              <h2 className="mb-1 text-sm font-semibold text-ink">Delivered to</h2>
              <p className="text-sm text-muted">
                {formatAddress(order.ShippingAddress)}
              </p>
            </section>
          )}
        </div>
      )}
    </AccountLayout>
  );
}
