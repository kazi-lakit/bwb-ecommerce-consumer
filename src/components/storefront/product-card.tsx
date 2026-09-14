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
  const description = product.ShortDescription as string | undefined;
  const salePercentage = price?.original && price.original > price.current
    ? Math.max(1, Math.round(((price.original - price.current) / price.original) * 100))
    : null;

  return (
    <article className="group relative h-full">
      <Link to={`/product/${slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-surface shadow-[var(--shadow-card)]">
          <ImageWithFallback
            src={image?.Url}
            fallback={placeholderImage}
            alt={image?.AltText || name}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          {salePercentage && (
            <span className="absolute left-3 top-3 rounded-full bg-brand-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-on-primary shadow-sm">
              Save {salePercentage}%
            </span>
          )}
        </div>
        <div className="mt-4">
          <h3 className="line-clamp-1 text-sm font-semibold text-ink transition-colors group-hover:text-brand-accent">{name}</h3>
          {description && <p className="mt-1 line-clamp-1 text-xs text-muted">{description}</p>}
          {price && (
            <div className="mt-2 flex items-baseline gap-2 text-sm text-ink">
              <span className="font-semibold">{formatMoney(price.current, price.currency)}</span>
              {price.original && (
                <span className="text-xs text-muted line-through">{formatMoney(price.original, price.currency)}</span>
              )}
            </div>
          )}
        </div>
        {colors.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            {colors.slice(0, 5).map((value) => (
              <span
                key={value}
                title={value}
                className="h-3.5 w-3.5 flex-none rounded-full border border-border-strong shadow-sm"
                style={{ background: value }}
              />
            ))}
            {colors.length > 5 && <span className="ml-1 text-[10px] font-medium text-muted">+{colors.length - 5}</span>}
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
          "absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-canvas/95 shadow-sm backdrop-blur-sm transition-all hover:scale-105",
          wishlisted ? "text-brand-error" : "text-steel hover:text-brand-error"
        )}
      >
        <Heart size={16} fill={wishlisted ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
