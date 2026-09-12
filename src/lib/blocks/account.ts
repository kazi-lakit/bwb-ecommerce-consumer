import { blocksClient } from "./client";
import { blocksDataCall } from "./http";
import { COMMERCE_SCHEMAS_LIVE } from "./commerce";

/**
 * The customer's own view of their orders — the other side of the backoffice Orders screen.
 *
 * Written against the drafted `Order` schema, so inert until `COMMERCE_SCHEMAS_DRAFT.json` is
 * imported, like the rest of `commerce.ts`.
 *
 * Every query here filters on `CustomerId` explicitly even though the schema's row-level
 * policy already restricts reads to the caller's own orders ("customer can read own orders",
 * `CustomerId == AUTH.UserId`). That's deliberate belt-and-braces: the policy is the actual
 * security boundary and this filter is not a substitute for it, but a client that forgets to
 * scope its query should get an empty list rather than quietly depending on the server to
 * save it. If the two ever disagree, the bug is visible here rather than in production data.
 */

export interface AccountOrderItem {
  ProductId?: string;
  VariantId?: string;
  Sku?: string;
  NameSnapshot?: string;
  UnitPrice?: number;
  Quantity?: number;
  LineTotal?: number;
}

export interface AccountOrder {
  ItemId: string;
  OrderNumber?: string;
  Status?: string;
  PaymentStatus?: string;
  FulfillmentStatus?: string;
  Currency?: string;
  SubTotal?: number;
  TaxTotal?: number;
  DiscountTotal?: number;
  ShippingTotal?: number;
  GrandTotal?: number;
  CouponCode?: string;
  PlacedDate?: string;
  CreatedDate?: string;
  Items?: AccountOrderItem[];
  ShippingAddress?: Record<string, string | undefined>;
}

const ORDER_FIELDS = `ItemId OrderNumber Status PaymentStatus FulfillmentStatus Currency
  SubTotal TaxTotal DiscountTotal ShippingTotal GrandTotal CouponCode PlacedDate CreatedDate
  Items { ProductId VariantId Sku NameSnapshot UnitPrice Quantity LineTotal }
  ShippingAddress { Line1 Line2 City State PostalCode CountryCode }`;

const ORDERS_QUERY = `query getOrders($where: OrderFilterInput, $paging: PaginationInput) {
  getOrders(where: $where, paging: $paging) {
    items { ${ORDER_FIELDS} }
    totalCount
  }
}`;

export async function listMyOrders(
  customerId: string,
  params: { pageNo?: number; pageSize?: number } = {}
): Promise<{ items: AccountOrder[]; totalCount: number }> {
  if (!COMMERCE_SCHEMAS_LIVE || !customerId) return { items: [], totalCount: 0 };

  const response = (await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "getOrders",
      query: ORDERS_QUERY,
      variables: {
        where: { CustomerId: { eq: customerId } },
        paging: { pageNo: params.pageNo ?? 1, pageSize: params.pageSize ?? 10 },
      },
    })
  )) as { data?: { getOrders?: { items?: AccountOrder[]; totalCount?: number } } };

  const items = response.data?.getOrders?.items ?? [];
  // The gateway has no sort input this project could confirm live (see collections.ts's note
  // on HC0017), so newest-first is done here over the page that came back. That means "newest"
  // is newest *within the page*, not across the whole history — fine at one page of ten, and
  // the reason paging is deliberately small.
  const sorted = [...items].sort((a, b) => {
    const left = a.PlacedDate ?? a.CreatedDate ?? "";
    const right = b.PlacedDate ?? b.CreatedDate ?? "";
    return right.localeCompare(left);
  });

  return { items: sorted, totalCount: response.data?.getOrders?.totalCount ?? sorted.length };
}

export async function getMyOrder(customerId: string, orderItemId: string): Promise<AccountOrder | null> {
  if (!COMMERCE_SCHEMAS_LIVE || !customerId) return null;

  const response = (await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "getOrders",
      query: ORDERS_QUERY,
      variables: {
        where: { CustomerId: { eq: customerId }, ItemId: { eq: orderItemId } },
        paging: { pageNo: 1, pageSize: 1 },
      },
    })
  )) as { data?: { getOrders?: { items?: AccountOrder[] } } };

  return response.data?.getOrders?.items?.[0] ?? null;
}

/**
 * What the customer can tell about an order at a glance, from three separate status fields.
 * Cancelled wins over everything; payment problems outrank fulfilment progress, because
 * that's the one the customer may need to act on.
 */
export function orderHeadline(order: AccountOrder): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (order.Status === "Cancelled") return { label: "Cancelled", tone: "bad" };
  if (order.PaymentStatus === "Failed") return { label: "Payment failed", tone: "bad" };
  if (order.PaymentStatus === "Refunded") return { label: "Refunded", tone: "muted" };
  if (order.FulfillmentStatus === "Delivered") return { label: "Delivered", tone: "ok" };
  if (order.FulfillmentStatus === "Shipped") return { label: "Shipped", tone: "ok" };
  if (order.PaymentStatus !== "Paid") return { label: "Awaiting payment", tone: "warn" };
  return { label: "Preparing", tone: "muted" };
}
