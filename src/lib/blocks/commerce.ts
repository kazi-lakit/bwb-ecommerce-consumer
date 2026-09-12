import { blocksClient } from "./client";
import { blocksDataCall } from "./http";
import type { CartLine } from "@/components/providers/cart-provider";

/**
 * Flip to `true` in `.env.local`/`.env.dev` (`VITE_COMMERCE_SCHEMAS_LIVE=true`) once
 * `COMMERCE_SCHEMAS_DRAFT.json` has actually been imported and reloaded on the Data
 * Gateway — see that file's companion `.md` for the import steps. Shared by CheckoutPage's
 * order placement and cart-provider's server sync so both flip on together.
 */
export const COMMERCE_SCHEMAS_LIVE = import.meta.env.VITE_COMMERCE_SCHEMAS_LIVE === "true";

/**
 * Order placement, written against the `Order`/`OrderItem`/`Address` schemas drafted in
 * `COMMERCE_SCHEMAS_DRAFT.json` (bwb workspace root) — not yet pushed to the Data Gateway,
 * so this module is inert until that import happens. Hand-written GraphQL rather than
 * `createEntityApi("Order")` from `./collections.ts` on purpose: that helper reads schema
 * shape from `./schema-meta.ts`, which is generated from `ECOMMERCE_INVENTORY_SCHEMAS.json`
 * and deliberately hasn't been regenerated to include `Order` yet (see
 * `COMMERCE_SCHEMAS_DRAFT.md` — regenerating before the schema is actually live would make
 * every screen using it fail with a GraphQL "field does not exist" error). This module has
 * no such dependency: it will work the moment the schema is imported and reloaded, with no
 * regeneration step required.
 */

export interface OrderAddressInput {
  Line1: string;
  Line2?: string;
  City: string;
  State?: string;
  PostalCode: string;
  CountryCode?: string;
}

export interface PlaceOrderInput {
  customerId: string;
  items: CartLine[];
  currency: string;
  subTotal: number;
  discountTotal: number;
  shippingTotal: number;
  grandTotal: number;
  couponCode?: string;
  shippingAddress: OrderAddressInput;
  salesChannelType?: string;
  /** Reused across retries of the same checkout attempt so a resubmit can't double-place. */
  idempotencyKey: string;
}

export interface PlaceOrderResult {
  itemId: string;
  orderNumber: string;
}

function buildOrderNumber(): string {
  // Human-facing, not the identifier anything keys off of — ItemId/OrderNumber both come
  // back from the mutation response; this is just what's shown to the customer if the
  // server doesn't echo one back for some reason.
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Maps a cart line to the `OrderItem` shape.
 *
 * `CartLine.sku` carries the variant's real SKU now, captured when the line is added. The
 * fallback to `variantId`/`productId` stays for carts persisted in localStorage before that
 * field existed — an order line with no SKU at all would be worse than one carrying an id.
 */
function toOrderItem(line: CartLine) {
  return {
    ProductId: line.productId,
    VariantId: line.variantId ?? line.productId,
    Sku: line.sku ?? line.variantId ?? line.productId,
    NameSnapshot: line.name,
    UnitPrice: line.unitPrice,
    Quantity: line.quantity,
    TaxAmount: 0,
    DiscountAmount: 0,
    LineTotal: line.unitPrice * line.quantity,
  };
}

const INSERT_ORDER_MUTATION = `mutation insertOrder($input: OrderInsertInput!) {
  insertOrder(input: $input) {
    acknowledged
    itemId
    message
    totalImpactedData
  }
}`;

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const orderNumber = buildOrderNumber();

  const payload = {
    OrderNumber: orderNumber,
    CustomerId: input.customerId,
    Status: "PendingPayment",
    PaymentStatus: "Pending",
    FulfillmentStatus: "Unallocated",
    Items: input.items.map(toOrderItem),
    ShippingAddress: input.shippingAddress,
    BillingAddress: input.shippingAddress,
    Currency: input.currency,
    SubTotal: input.subTotal,
    TaxTotal: 0,
    DiscountTotal: input.discountTotal,
    ShippingTotal: input.shippingTotal,
    GrandTotal: input.grandTotal,
    CouponCode: input.couponCode,
    IdempotencyKey: input.idempotencyKey,
    SalesChannelType: input.salesChannelType ?? "Ecommerce",
    PlacedDate: new Date().toISOString(),
  };

  const response = await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "insertOrder",
      query: INSERT_ORDER_MUTATION,
      variables: { input: payload },
    })
  );

  const root = response as Record<string, unknown> | undefined;
  const dataObj = (root?.data ?? root) as Record<string, unknown> | undefined;
  const result = dataObj?.insertOrder as { itemId?: string; acknowledged?: boolean } | undefined;

  if (!result?.itemId) {
    throw new Error("Order placement did not return an item id.");
  }

  return { itemId: result.itemId, orderNumber };
}

/**
 * A stable key for one checkout attempt: generated once when the checkout page mounts (or
 * the cart changes), reused on every retry of the *same* attempt so a network hiccup or a
 * double-click can't place the order twice. `IdempotencyKey` must actually carry a unique
 * index once the schema is live for this to be a real guarantee, not just a convention
 * (see DATA_GATEWAY_STORAGE_FEATURES_AND_SECURITY.md item B2) — this only generates the key.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// --- Server-backed cart sync (Cart / CartItem) -----------------------------------------
//
// Additive to the existing localStorage cart in cart-provider.tsx, not a replacement of it:
// localStorage stays the source of truth for instant load/offline tolerance; when the
// customer is signed in and COMMERCE_SCHEMAS_LIVE is on, their cart is also mirrored to a
// server-side Cart record (one active Cart per CustomerId) so it can be picked up again on
// another device. Guest (signed-out) carts are untouched — Cart requires an owner.

function toCartItem(line: CartLine) {
  return {
    ProductId: line.productId,
    VariantId: line.variantId ?? line.productId,
    Sku: line.sku ?? line.variantId ?? line.productId,
    NameSnapshot: line.name,
    Slug: line.slug,
    ImageUrl: line.imageUrl,
    UnitPrice: line.unitPrice,
    Quantity: line.quantity,
    Currency: line.currency,
  };
}

function fromCartItem(item: Record<string, unknown>): CartLine {
  const variantId = (item.VariantId as string) || undefined;
  const productId = item.ProductId as string;
  return {
    key: variantId ?? productId,
    productId,
    variantId,
    sku: (item.Sku as string) || undefined,
    slug: (item.Slug as string) ?? "",
    name: (item.NameSnapshot as string) ?? "",
    imageUrl: (item.ImageUrl as string) || undefined,
    unitPrice: (item.UnitPrice as number) ?? 0,
    currency: (item.Currency as string) ?? "USD",
    quantity: (item.Quantity as number) ?? 0,
  };
}

const CART_FIELDS = "ItemId Status Currency CouponCode SubTotal DiscountTotal Total Items { ProductId VariantId Sku NameSnapshot Slug ImageUrl UnitPrice Quantity Currency }";

const GET_ACTIVE_CART_QUERY = `query getCarts($where: CartFilterInput) {
  getCarts(where: $where, paging: { pageNo: 1, pageSize: 1 }) {
    items { ${CART_FIELDS} }
  }
}`;

const INSERT_CART_MUTATION = `mutation insertCart($input: CartInsertInput!) {
  insertCart(input: $input) {
    acknowledged
    itemId
  }
}`;

const UPDATE_CART_MUTATION = `mutation updateCart($where: CartFilterInput, $input: CartUpdateInput!) {
  updateCart(where: $where, input: $input) {
    acknowledged
    itemId
    totalImpactedData
  }
}`;

export interface RemoteCart {
  itemId: string;
  items: CartLine[];
}

function unwrap<T>(response: unknown, field: string): T | undefined {
  const root = response as Record<string, unknown> | undefined;
  const dataObj = (root?.data ?? root) as Record<string, unknown> | undefined;
  return dataObj?.[field] as T | undefined;
}

/** The customer's one active cart, if any. `null` when they don't have one yet. */
export async function getActiveCart(customerId: string): Promise<RemoteCart | null> {
  const response = await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "getCarts",
      query: GET_ACTIVE_CART_QUERY,
      variables: { where: { CustomerId: { eq: customerId }, Status: { eq: "active" } } },
    })
  );
  const result = unwrap<{ items?: Record<string, unknown>[] }>(response, "getCarts");
  const record = result?.items?.[0];
  if (!record) return null;
  return { itemId: record.ItemId as string, items: ((record.Items as Record<string, unknown>[]) ?? []).map(fromCartItem) };
}

export interface CartTotals {
  currency: string;
  subTotal: number;
  discountTotal: number;
  total: number;
  couponCode?: string;
}

/** Creates the customer's first cart record. Returns the new Cart's ItemId. */
export async function createRemoteCart(customerId: string, lines: CartLine[], totals: CartTotals): Promise<string> {
  const response = await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "insertCart",
      query: INSERT_CART_MUTATION,
      variables: {
        input: {
          CustomerId: customerId,
          Status: "active",
          Currency: totals.currency,
          Items: lines.map(toCartItem),
          CouponCode: totals.couponCode,
          SubTotal: totals.subTotal,
          DiscountTotal: totals.discountTotal,
          Total: totals.total,
          SalesChannelType: "Ecommerce",
        },
      },
    })
  );
  const result = unwrap<{ itemId?: string }>(response, "insertCart");
  if (!result?.itemId) throw new Error("Cart creation did not return an item id.");
  return result.itemId;
}

/** Overwrites an existing cart's line items/totals to match local state. */
export async function updateRemoteCart(cartItemId: string, lines: CartLine[], totals: CartTotals): Promise<void> {
  await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "updateCart",
      query: UPDATE_CART_MUTATION,
      variables: {
        where: { ItemId: { eq: cartItemId } },
        input: {
          Items: lines.map(toCartItem),
          CouponCode: totals.couponCode,
          SubTotal: totals.subTotal,
          DiscountTotal: totals.discountTotal,
          Total: totals.total,
        },
      },
    })
  );
}

// --- Commerce customer profile (CommerceCustomer) --------------------------------------
//
// IAM owns identity/authentication; this is the commerce-specific profile — saved
// addresses today, and whatever else Commerce needs later — keyed 1:1 to the IAM user by
// `UserId`. Auto-created on first login (get-or-create, not a real atomic upsert — see the
// race note on ensureCommerceCustomer below).

export interface CommerceAddress {
  Line1: string;
  Line2?: string;
  City: string;
  State?: string;
  PostalCode: string;
  CountryCode?: string;
}

export interface CommerceCustomer {
  itemId: string;
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  addresses: CommerceAddress[];
}

const CUSTOMER_FIELDS =
  "ItemId UserId Email FirstName LastName Phone Status Addresses { Line1 Line2 City State PostalCode CountryCode }";

const GET_CUSTOMER_QUERY = `query getCommerceCustomers($where: CommerceCustomerFilterInput) {
  getCommerceCustomers(where: $where, paging: { pageNo: 1, pageSize: 1 }) {
    items { ${CUSTOMER_FIELDS} }
  }
}`;

const INSERT_CUSTOMER_MUTATION = `mutation insertCommerceCustomer($input: CommerceCustomerInsertInput!) {
  insertCommerceCustomer(input: $input) {
    acknowledged
    itemId
  }
}`;

const UPDATE_CUSTOMER_MUTATION = `mutation updateCommerceCustomer($where: CommerceCustomerFilterInput, $input: CommerceCustomerUpdateInput!) {
  updateCommerceCustomer(where: $where, input: $input) {
    acknowledged
    itemId
  }
}`;

function fromCustomerRecord(record: Record<string, unknown>): CommerceCustomer {
  return {
    itemId: record.ItemId as string,
    userId: record.UserId as string,
    email: (record.Email as string) ?? "",
    firstName: (record.FirstName as string) || undefined,
    lastName: (record.LastName as string) || undefined,
    phone: (record.Phone as string) || undefined,
    addresses: (record.Addresses as CommerceAddress[]) ?? [],
  };
}

export async function getCommerceCustomer(userId: string): Promise<CommerceCustomer | null> {
  const response = await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "getCommerceCustomers",
      query: GET_CUSTOMER_QUERY,
      variables: { where: { UserId: { eq: userId } } },
    })
  );
  const result = unwrap<{ items?: Record<string, unknown>[] }>(response, "getCommerceCustomers");
  const record = result?.items?.[0];
  return record ? fromCustomerRecord(record) : null;
}

export interface NewCommerceCustomer {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export async function createCommerceCustomer(input: NewCommerceCustomer): Promise<CommerceCustomer> {
  const response = await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "insertCommerceCustomer",
      query: INSERT_CUSTOMER_MUTATION,
      variables: {
        input: {
          UserId: input.userId,
          Email: input.email,
          FirstName: input.firstName,
          LastName: input.lastName,
          Phone: input.phone,
          Status: "active",
          Addresses: [],
        },
      },
    })
  );
  const result = unwrap<{ itemId?: string }>(response, "insertCommerceCustomer");
  if (!result?.itemId) throw new Error("Commerce customer creation did not return an item id.");
  return { itemId: result.itemId, userId: input.userId, email: input.email, firstName: input.firstName, lastName: input.lastName, phone: input.phone, addresses: [] };
}

/**
 * Get-or-create, not a real atomic upsert: two concurrent first-logins for the same user
 * (two tabs opened at once, say) could both miss on the read and both insert — there's no
 * unique index on `CommerceCustomer.UserId` yet to catch that at the database level (the
 * schema draft marks it `IsUniqueData`, which per DATA_GATEWAY_STORAGE_FEATURES_AND_SECURITY.md
 * item B2/3 is a check-then-act query, not a constraint, until a real unique index exists).
 * Acceptable for a profile row today; revisit if this pattern is reused somewhere a true
 * duplicate would actually matter.
 */
export async function ensureCommerceCustomer(input: NewCommerceCustomer): Promise<CommerceCustomer> {
  const existing = await getCommerceCustomer(input.userId);
  if (existing) return existing;
  return createCommerceCustomer(input);
}

/** Appends an address to the customer's saved list (skips it if an identical one already exists). */
export async function addCustomerAddress(customer: CommerceCustomer, address: CommerceAddress): Promise<CommerceAddress[]> {
  const isDuplicate = customer.addresses.some((a) => JSON.stringify(a) === JSON.stringify(address));
  const addresses = isDuplicate ? customer.addresses : [...customer.addresses, address];
  if (!isDuplicate) {
    await blocksDataCall(() =>
      blocksClient.data.graphql({
        operationName: "updateCommerceCustomer",
        query: UPDATE_CUSTOMER_MUTATION,
        variables: { where: { ItemId: { eq: customer.itemId } }, input: { Addresses: addresses } },
      })
    );
  }
  return addresses;
}

/**
 * Replaces the customer's whole address list.
 *
 * `Addresses` is an embedded array on one document, so there is no "delete one element"
 * mutation to reach for — the array is written whole, which also means two tabs editing
 * addresses at once will have the last writer win. Acceptable for a personal address book;
 * worth revisiting if addresses ever become their own entity (which is what would make them
 * individually queryable, per INDEX_PLAN.json's second hazard).
 */
export async function setCustomerAddresses(
  customer: CommerceCustomer,
  addresses: CommerceAddress[]
): Promise<CommerceAddress[]> {
  await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "updateCommerceCustomer",
      query: UPDATE_CUSTOMER_MUTATION,
      variables: { where: { ItemId: { eq: customer.itemId } }, input: { Addresses: addresses } },
    })
  );
  return addresses;
}

/**
 * Human-readable one-liner for an address, used wherever one is listed or picked. Takes a
 * partial rather than a full `CommerceAddress` because order records carry an address
 * snapshot whose fields are all individually optional — it only ever reads them.
 */
export function formatAddress(address: Partial<CommerceAddress>): string {
  return [address.Line1, address.Line2, address.City, address.State, address.PostalCode, address.CountryCode]
    .filter(Boolean)
    .join(", ");
}
