import { blocksClient } from "./client";
import { blocksDataCall } from "./http";

/**
 * Product reviews.
 *
 * Written against `REVIEW_SCHEMA_DRAFT.json`, not yet imported, so this is inert behind
 * `VITE_REVIEW_SCHEMA_LIVE`.
 *
 * Unlike most read paths here, **this one doesn't filter by status client-side**, and that's
 * deliberate: the schema carries a row-level policy (`Status == "approved"`) that the gateway
 * compiles into a data filter on every read. Filtering here as well would suggest the client
 * is what keeps unapproved reviews private, and someone would eventually "simplify" the policy
 * away. The queries below ask for what they want; the server decides what they may have.
 */

export const REVIEWS_LIVE = import.meta.env.VITE_REVIEW_SCHEMA_LIVE === "true";

export interface Review {
  ItemId: string;
  ProductId?: string;
  CustomerId?: string;
  AuthorName?: string;
  Rating?: number;
  Title?: string;
  Body?: string;
  Status?: string;
  IsVerifiedPurchase?: boolean;
  CreatedDate?: string;
}

export interface RatingSummary {
  /** Mean rating, or null when there's nothing to average. */
  average: number | null;
  count: number;
  /** Count per star, 1-indexed at [1]..[5]. */
  histogram: number[];
}

const REVIEW_FIELDS = "ItemId ProductId CustomerId AuthorName Rating Title Body Status IsVerifiedPurchase CreatedDate";

const LIST_QUERY = `query getReviews($where: ReviewFilterInput, $paging: PaginationInput) {
  getReviews(where: $where, paging: $paging) {
    items { ${REVIEW_FIELDS} }
    totalCount
  }
}`;

const INSERT_MUTATION = `mutation insertReview($input: ReviewInsertInput!) {
  insertReview(input: $input) { acknowledged itemId message }
}`;

export async function listProductReviews(
  productId: string,
  params: { pageNo?: number; pageSize?: number } = {}
): Promise<{ items: Review[]; totalCount: number }> {
  if (!REVIEWS_LIVE || !productId) return { items: [], totalCount: 0 };

  const response = (await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "getReviews",
      query: LIST_QUERY,
      variables: {
        where: { ProductId: { eq: productId } },
        paging: { pageNo: params.pageNo ?? 1, pageSize: params.pageSize ?? 20 },
      },
    })
  )) as { data?: { getReviews?: { items?: Review[]; totalCount?: number } } };

  const items = response.data?.getReviews?.items ?? [];
  // Newest first, done here because the gateway has no confirmed sort input for this project
  // (see collections.ts's HC0017 note) — so it's newest within the page, and the page is small.
  const sorted = [...items].sort((a, b) => String(b.CreatedDate ?? "").localeCompare(String(a.CreatedDate ?? "")));
  return { items: sorted, totalCount: response.data?.getReviews?.totalCount ?? sorted.length };
}

/**
 * Averages what was actually read.
 *
 * Only approved reviews come back (the policy sees to that), but a customer also sees their
 * own pending one — so this skips anything not approved before averaging. Otherwise your own
 * unpublished 1-star would move the number only you can see, which looks like a bug.
 */
export function summarizeRatings(reviews: Review[]): RatingSummary {
  const histogram = [0, 0, 0, 0, 0, 0];
  let total = 0;
  let count = 0;

  for (const review of reviews) {
    if (review.Status && review.Status !== "approved") continue;
    const rating = Math.round(review.Rating ?? 0);
    if (rating < 1 || rating > 5) continue;
    histogram[rating] += 1;
    total += rating;
    count += 1;
  }

  return { average: count > 0 ? Math.round((total / count) * 10) / 10 : null, count, histogram };
}

export interface NewReview {
  productId: string;
  variantId?: string;
  customerId: string;
  authorName?: string;
  rating: number;
  title?: string;
  body?: string;
}

export async function submitReview(input: NewReview): Promise<string> {
  const response = (await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "insertReview",
      query: INSERT_MUTATION,
      variables: {
        input: {
          ProductId: input.productId,
          VariantId: input.variantId,
          CustomerId: input.customerId,
          AuthorName: input.authorName,
          Rating: Math.max(1, Math.min(5, Math.round(input.rating))),
          Title: input.title,
          Body: input.body,
          // Sent for clarity, but the schema's CLS policy is what actually prevents a
          // customer publishing their own review — this line being here is a convenience,
          // not the control. A client that posts "approved" is refused by the gateway.
          Status: "pending",
        },
      },
    })
  )) as { data?: { insertReview?: { itemId?: string } } };

  const itemId = response.data?.insertReview?.itemId;
  if (!itemId) throw new Error("The review wasn't saved.");
  return itemId;
}
