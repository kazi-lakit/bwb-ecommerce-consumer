import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { EntityRecord } from "@/lib/blocks/collections";
import type { DisplayPrice } from "@/lib/product-pricing";
import { ProductCard } from "./product-card";
import { Spinner } from "@/components/ui/spinner";

export interface ProductRailItem {
  product: EntityRecord;
  placeholderImage: string;
  price?: DisplayPrice | null;
  colors?: string[];
}

export function ProductRail({
  eyebrow,
  title,
  description,
  viewAllHref,
  items,
  loading,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  viewAllHref?: string;
  items: ProductRailItem[];
  loading?: boolean;
}) {
  if (!loading && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16">
      <div className="mb-7 flex items-end justify-between gap-5 border-b border-hairline pb-5">
        <div>
          {eyebrow && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">{eyebrow}</p>}
          <h2 className="font-display text-2xl text-ink sm:text-3xl">{title}</h2>
          {description && <p className="mt-2 max-w-xl text-sm leading-6 text-steel">{description}</p>}
        </div>
        {viewAllHref && (
          <Link
            to={viewAllHref}
            className="hidden flex-none items-center gap-1 rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-surface sm:flex"
          >
            View all <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4 lg:grid-cols-5">
          {items.map(({ product, placeholderImage, price, colors }) => (
            <ProductCard
              key={(product.ItemId ?? product.itemId) as string}
              product={product}
              placeholderImage={placeholderImage}
              price={price}
              colors={colors}
            />
          ))}
        </div>
      )}
      {viewAllHref && !loading && (
        <Link
          to={viewAllHref}
          className="mt-7 inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-brand-accent sm:hidden"
        >
          View all products <ChevronRight size={14} />
        </Link>
      )}
    </section>
  );
}
