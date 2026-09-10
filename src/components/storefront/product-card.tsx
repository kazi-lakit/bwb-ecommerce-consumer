import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import clsx from "clsx";
import type { EntityRecord } from "@/lib/blocks/collections";
import { getPrimaryImage } from "@/lib/blocks/media";
import { formatMoney, type DisplayPrice } from "@/lib/product-pricing";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";

export interface ProductCardProps {
  product: EntityRecord;
  placeholderImage: string;
  price?: DisplayPrice | null;
  /** Real color-option values from the product's variants — rendered as swatch chips. */
  colors?: string[];
}

export function ProductCard({ product, placeholderImage, price, colors = [] }: ProductCardProps) {
  const { has, toggle } = useWishlist();
  const image = getPrimaryImage(product);
  const name = (product.Name as string) || "Untitled product";
  const slug = (product.Slug as string) || (product.ItemId as string) || (product.itemId as string);
  const productId = (product.ItemId ?? product.itemId) as string;
  const wishlisted = has(productId);

  return (
    <div className="group relative">
      <Link to={`/product/${slug}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-md bg-surface transition-shadow duration-200 group-hover:shadow-[var(--shadow-card)]">
          <ImageWithFallback
            src={image?.Url}
            fallback={placeholderImage}
            alt={image?.AltText || name}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="mt-3">
          <h3 className="line-clamp-1 text-sm font-medium text-ink">{name}</h3>
          {price && (
            <div className="mt-0.5 flex items-baseline gap-1.5 text-sm text-ink">
              <span>{formatMoney(price.current, price.currency)}</span>
              {price.original && (
                <span className="text-xs text-muted line-through">{formatMoney(price.original, price.currency)}</span>
              )}
            </div>
          )}
        </div>
        {colors.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            {colors.slice(0, 7).map((value) => (
              <span
                key={value}
                title={value}
                className="h-3.5 w-3.5 flex-none rounded-full border border-hairline"
                style={{ background: value }}
              />
            ))}
          </div>
        )}
      </Link>
      <button
        type="button"
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        onClick={(e) => {
          e.preventDefault();
          toggle(productId);
        }}
        className={clsx(
          "absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-canvas/90 transition-colors",
          wishlisted ? "text-brand-error" : "text-steel hover:text-brand-error"
        )}
      >
        <Heart size={15} fill={wishlisted ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
