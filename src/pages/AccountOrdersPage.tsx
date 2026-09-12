import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/components/providers/auth-provider";
import { COMMERCE_SCHEMAS_LIVE } from "@/lib/blocks/commerce";
import { listMyOrders, orderHeadline, type AccountOrder } from "@/lib/blocks/account";
import { AccountLayout } from "@/components/storefront/account-layout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney } from "@/lib/product-pricing";
import { usePageMeta } from "@/lib/seo";

const PAGE_SIZE = 10;

const TONE_CLASSES: Record<"ok" | "warn" | "bad" | "muted", string> = {
  ok: "text-brand-success",
  warn: "text-brand-warn",
  bad: "text-brand-error",
  muted: "text-muted",
};

export function OrderStatusLine({ order }: { order: AccountOrder }) {
  const { label, tone } = orderHeadline(order);
  return <span className={clsx("text-xs font-medium", TONE_CLASSES[tone])}>{label}</span>;
}

export default function AccountOrdersPage() {
  usePageMeta({ title: "Your orders — Logoipsum", noIndex: true });
  const { user } = useAuth();
  const [pageNo, setPageNo] = useState(1);

  const query = useQuery({
    queryKey: ["my-orders", user?.itemId, pageNo],
    queryFn: () => listMyOrders(user!.itemId, { pageNo, pageSize: PAGE_SIZE }),
    enabled: Boolean(user?.itemId) && COMMERCE_SCHEMAS_LIVE,
  });

  const orders = query.data?.items ?? [];
  const totalCount = query.data?.totalCount ?? 0;

  return (
    <AccountLayout title="Your orders">
      {!COMMERCE_SCHEMAS_LIVE ? (
        <EmptyNotice
          title="Order history isn't available yet"
          body="Orders aren't being stored on the server yet, so there's nothing to show here. This page is ready for when they are."
        />
      ) : query.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyNotice
          title="No orders yet"
          body="When you place an order it'll show up here."
          action={
            <Link to="/products">
              <Button size="sm">Browse products</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.ItemId}
              to={`/account/orders/${order.ItemId}`}
              className="block rounded-md border border-hairline p-4 hover:border-brand-accent"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink">{order.OrderNumber ?? "Order"}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(order.PlacedDate ?? order.CreatedDate ?? Date.now()).toLocaleDateString()} ·{" "}
                    {(order.Items ?? []).length} item{(order.Items ?? []).length === 1 ? "" : "s"}
                  </p>
                  <div className="mt-1">
                    <OrderStatusLine order={order} />
                  </div>
                </div>
                <span className="text-sm font-semibold text-ink">
                  {formatMoney(order.GrandTotal ?? 0, order.Currency ?? "USD")}
                </span>
              </div>
            </Link>
          ))}

          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 text-sm text-muted">
              <span>
                Page {pageNo} of {Math.ceil(totalCount / PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={pageNo <= 1} onClick={() => setPageNo((n) => n - 1)}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pageNo * PAGE_SIZE >= totalCount}
                  onClick={() => setPageNo((n) => n + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </AccountLayout>
  );
}

export function EmptyNotice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-hairline py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
