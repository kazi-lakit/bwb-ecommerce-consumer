import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/providers/auth-provider";
import { startLogin } from "@/lib/blocks/auth";
import { REVIEWS_LIVE, listProductReviews, submitReview, summarizeRatings } from "@/lib/blocks/reviews";
import { toast } from "@/lib/toast-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(value) ? "fill-brand-warn text-brand-warn" : "text-hairline"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function RatingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star size={20} className={n <= value ? "fill-brand-warn text-brand-warn" : "text-hairline hover:text-muted"} />
        </button>
      ))}
    </div>
  );
}

export function ProductReviews({ productId, variantId }: { productId: string; variantId?: string }) {
  const { status, user } = useAuth();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const query = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => listProductReviews(productId),
    enabled: REVIEWS_LIVE && Boolean(productId),
  });

  if (!REVIEWS_LIVE) return null;

  const reviews = query.data?.items ?? [];
  const summary = summarizeRatings(reviews);
  const mine = user ? reviews.find((r) => r.CustomerId === user.itemId) : undefined;

  async function send() {
    if (rating < 1) {
      toast.error("Pick a rating first.");
      return;
    }
    setSubmitting(true);
    try {
      await submitReview({
        productId,
        variantId,
        customerId: user!.itemId,
        authorName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined,
        rating,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
      });
      setRating(0);
      setTitle("");
      setBody("");
      await query.refetch();
      // Said explicitly: a review that silently doesn't appear reads as a bug, and the
      // customer would reasonably submit it again.
      toast.success("Thanks — your review will appear once it's been checked.");
    } catch {
      // blocksDataCall already surfaced the specific error.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-10 border-t border-hairline pt-6">
      <h2 className="font-display text-xl text-ink">Reviews</h2>

      {query.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <>
          {summary.average === null ? (
            <p className="mt-2 text-sm text-muted">No reviews yet. Be the first.</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Stars value={summary.average} size={16} />
              <span className="text-sm font-medium text-ink">{summary.average.toFixed(1)}</span>
              <span className="text-sm text-muted">
                {summary.count} review{summary.count === 1 ? "" : "s"}
              </span>
            </div>
          )}

          <ul className="mt-5 space-y-4">
            {reviews.map((review) => (
              <li key={review.ItemId} className="border-b border-hairline-soft pb-4 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={review.Rating ?? 0} />
                  {review.Title ? <span className="text-sm font-medium text-ink">{review.Title}</span> : null}
                  {review.IsVerifiedPurchase ? (
                    <span className="rounded bg-brand-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-success">
                      Verified
                    </span>
                  ) : null}
                  {/* A customer's own pending review is visible to them by policy; labelling it
                      prevents "why can't my friend see this?" */}
                  {review.Status && review.Status !== "approved" ? (
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                      Awaiting review
                    </span>
                  ) : null}
                </div>
                {review.Body ? <p className="mt-1 text-sm text-steel">{review.Body}</p> : null}
                <p className="mt-1 text-xs text-muted">
                  {review.AuthorName || "Anonymous"}
                  {review.CreatedDate ? ` · ${new Date(review.CreatedDate).toLocaleDateString()}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 rounded-md border border-hairline p-4">
        {status !== "authenticated" ? (
          <div className="text-sm text-muted">
            <p>Sign in to leave a review.</p>
            <Button className="mt-3" size="sm" onClick={() => void startLogin(window.location.pathname)}>
              Log in
            </Button>
          </div>
        ) : mine ? (
          <p className="text-sm text-muted">You've already reviewed this product.</p>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Write a review</h3>
            <RatingPicker value={rating} onChange={setRating} />
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline (optional)" />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did you think?"
              rows={4}
              className={clsx(
                "w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink",
                "outline-none focus:border-brand-accent"
              )}
            />
            <Button size="sm" disabled={submitting} onClick={() => void send()}>
              {submitting && <Spinner className="h-3.5 w-3.5" />}
              {submitting ? "Sending…" : "Submit review"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
