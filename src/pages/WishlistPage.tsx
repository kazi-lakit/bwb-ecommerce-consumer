import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useEntityList } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { ProductCard } from "@/components/storefront/product-card";
import { Spinner } from "@/components/ui/spinner";
import { getProductPrice, getColorSwatchValues } from "@/lib/product-pricing";

function itemId(record: EntityRecord): string {
  return (record.ItemId ?? record.itemId) as string;
}

export default function WishlistPage() {
  const { theme } = useTheme();
  const { productIds } = useWishlist();

  const products = useEntityList("Product", { pageSize: 200 });
  const variants = useEntityList("ProductVariant", { pageSize: 500 });

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, EntityRecord[]>();
    for (const variant of variants.data?.items ?? []) {
      const productId = variant.ProductId as string;
      if (!map.has(productId)) map.set(productId, []);
      map.get(productId)!.push(variant);
    }
    return map;
  }, [variants.data]);

  const wishlisted = (products.data?.items ?? []).filter((p) => productIds.includes(itemId(p)));
  const placeholders = useMemo(() => assignPlaceholders(wishlisted, theme), [wishlisted, theme]);
  const loading = products.isLoading || variants.isLoading;

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="font-display mb-6 text-[28px] text-ink">Wishlist</h1>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-6 w-6" />
          </div>
        ) : wishlisted.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-muted">Nothing in your wishlist yet.</p>
            <Link to="/products" className="mt-3 inline-block text-sm font-medium text-brand-accent hover:underline">
              Browse products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {wishlisted.map((product, i) => (
              <ProductCard
                key={itemId(product)}
                product={product}
                placeholderImage={placeholders[i]}
                price={getProductPrice(product, variantsByProduct.get(itemId(product)) ?? [])}
                colors={getColorSwatchValues(variantsByProduct.get(itemId(product)) ?? [])}
              />
            ))}
          </div>
        )}
      </main>
      <StorefrontFooter />
    </div>
  );
}
