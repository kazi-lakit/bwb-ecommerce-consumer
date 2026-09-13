import { blocksClient } from "./client";
import { blocksDataCall } from "./http";

/**
 * Server-backed wishlist.
 *
 * Written against `FAVOURITE_SCHEMA_DRAFT.json`, not yet imported, so inert behind
 * `VITE_FAVOURITE_SCHEMA_LIVE`. Until then the wishlist stays exactly as it was:
 * localStorage, per-browser.
 *
 * **One row per favourite, rather than an array on `CommerceCustomer`.** The array shape
 * looks simpler and is worse on both counts that matter here: an embedded array can't be
 * indexed or filtered on (`INDEX_PLAN.json`'s second hazard), and removing one entry means
 * rewriting the whole list, which makes last-writer-wins the real behaviour across two open
 * tabs — the problem the saved-address book already has. A row per favourite removes and
 * queries independently.
 */

export const FAVOURITES_LIVE = import.meta.env.VITE_FAVOURITE_SCHEMA_LIVE === "true";

export interface Favourite {
  ItemId: string;
  ProductId?: string;
  VariantId?: string;
}

const LIST_QUERY = `query getFavourites($where: FavouriteFilterInput, $paging: PaginationInput) {
  getFavourites(where: $where, paging: $paging) {
    items { ItemId ProductId VariantId }
    totalCount
  }
}`;

const INSERT_MUTATION = `mutation insertFavourite($input: FavouriteInsertInput!) {
  insertFavourite(input: $input) { acknowledged itemId }
}`;

const DELETE_MUTATION = `mutation deleteFavourite($where: FavouriteFilterInput) {
  deleteFavourite(where: $where) { acknowledged totalImpactedData }
}`;

/**
 * Every caller's favourites, and only their own — the schema's owner policy is what enforces
 * that, and `CustomerId` is still passed here so the query is honest about what it wants
 * rather than relying on the server to narrow an unbounded read.
 */
export async function listFavourites(customerId: string): Promise<Favourite[]> {
  if (!FAVOURITES_LIVE || !customerId) return [];
  const response = (await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "getFavourites",
      query: LIST_QUERY,
      variables: { where: { CustomerId: { eq: customerId } }, paging: { pageNo: 1, pageSize: 200 } },
    })
  )) as { data?: { getFavourites?: { items?: Favourite[] } } };
  return response.data?.getFavourites?.items ?? [];
}

export async function addFavourite(customerId: string, productId: string): Promise<string | null> {
  const response = (await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "insertFavourite",
      query: INSERT_MUTATION,
      variables: { input: { CustomerId: customerId, ProductId: productId } },
    })
  )) as { data?: { insertFavourite?: { itemId?: string } } };
  return response.data?.insertFavourite?.itemId ?? null;
}

export async function removeFavourite(itemId: string): Promise<void> {
  await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "deleteFavourite",
      query: DELETE_MUTATION,
      variables: { where: { ItemId: { eq: itemId } } },
    })
  );
}

/**
 * Merges a guest's local wishlist into the server copy on sign-in.
 *
 * Union, never subtraction. Something favourited on a phone and absent here means "not synced
 * yet", not "removed" — there's no per-item timestamp to tell those apart, and of the two
 * possible mistakes, silently deleting something someone saved is the one they'd notice and
 * mind. Returns only what needs creating, so callers don't re-post what's already there.
 */
export function favouritesToCreate(localProductIds: string[], remote: Favourite[]): string[] {
  const known = new Set(remote.map((f) => f.ProductId).filter(Boolean) as string[]);
  return Array.from(new Set(localProductIds.filter((id) => id && !known.has(id))));
}

/** The merged view the UI shows: everything on the server plus anything still local. */
export function mergeFavourites(localProductIds: string[], remote: Favourite[]): string[] {
  const remoteIds = remote.map((f) => f.ProductId).filter(Boolean) as string[];
  return Array.from(new Set([...remoteIds, ...localProductIds.filter(Boolean)]));
}
