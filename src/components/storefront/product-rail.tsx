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
  title,
  viewAllHref,
  items,
  loading,
}: {
  title: string;
  viewAllHref?: string;
  items: ProductRailItem[];
  loading?: boolean;
}) {
  if (!loading && items.length === 0) return null;

  return (
    <section className="py-10">
      <div className="mb-5 flex items-end justify-between border-b border-hairline pb-4">
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        {viewAllHref && (
          <Link
            to={viewAllHref}
            className="flex items-center gap-0.5 text-xs font-medium uppercase tracking-[0.06em] text-ink hover:underline"
          >
            View All <ChevronRight size={13} />
          </Link>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
    </section>
  );
}
