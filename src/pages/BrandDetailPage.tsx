import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useEntityList, useEntityListBatch } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { ProductCard } from "@/components/storefront/product-card";
import { Spinner } from "@/components/ui/spinner";
import { getProductPrice, getColorSwatchValues } from "@/lib/product-pricing";
import { metaDescription, usePageMeta } from "@/lib/seo";

function itemId(record: EntityRecord): string {
  return (record.ItemId ?? record.itemId) as string;
}

export default function BrandDetailPage() {
  const { slug } = useParams();
  const { theme } = useTheme();

  // Resolved by slug rather than id so the URL stays readable and shareable, matching
  // /product/:slug. Slug is declared unique on the schema (though nothing enforces that yet —
  // see INDEX_PLAN.json tier 2), so the first match is the only match in practice.
  const brands = useEntityList("Brand", { pageNo: 1, pageSize: 1, where: { Slug: { eq: slug } } }, Boolean(slug));
  const brand = brands.data?.items?.[0];
  const brandId = brand ? itemId(brand) : undefined;

  // Both only need `brandId` to know *when* to fire (variants isn't even scoped by it) —
  // neither needs the other's result, so one round trip instead of two once it's known.
  const productsBatch = useEntityListBatch([
    { key: "products", schemaName: "Product", params: { pageNo: 1, pageSize: 100, where: { BrandId: { eq: brandId } } }, enabled: Boolean(brandId) },
    { key: "variants", schemaName: "ProductVariant", params: { pageNo: 1, pageSize: 500 }, enabled: Boolean(brandId) },
  ]);
  const products = { data: productsBatch.data?.products, isLoading: productsBatch.isLoading };
  const variants = { data: productsBatch.data?.variants };

  const items = products.data?.items ?? [];
  const placeholders = useMemo(() => assignPlaceholders(items, theme), [items, theme]);

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, EntityRecord[]>();
    for (const variant of variants.data?.items ?? []) {
      const productId = variant.ProductId as string;
      if (!map.has(productId)) map.set(productId, []);
      map.get(productId)!.push(variant);
    }
    return map;
  }, [variants.data]);

  const name = (brand?.Name as string) || "Brand";

  usePageMeta({
    title: brand ? `${name} — Cartio` : "Brands — Cartio",
    description: metaDescription(brand?.Description as string, `Shop ${name} at Cartio.`),
    canonicalPath: `/brand/${(brand?.Slug as string) || slug || ""}`,
    image: (brand?.LogoUrl as string) || undefined,
  });

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <nav className="mb-4 flex items-center gap-1 text-xs text-muted">
          <Link to="/brands" className="hover:text-ink">Brands</Link>
          <ChevronRight size={12} />
          <span className="text-ink">{name}</span>
        </nav>

        {brands.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !brand ? (
          <p className="py-20 text-center text-sm text-muted">We couldn't find that brand.</p>
        ) : (
          <>
            <header className="mb-6 flex flex-wrap items-center gap-4">
              {brand.LogoUrl ? (
                <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded bg-surface">
                  <img
                    src={brand.LogoUrl as string}
                    alt={name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : null}
              <div className="min-w-0">
                <h1 className="font-display text-[28px] text-ink">{name}</h1>
                {brand.Description ? <p className="mt-1 text-sm text-muted">{brand.Description as string}</p> : null}
                {brand.WebsiteUrl ? (
                  <a
                    href={brand.WebsiteUrl as string}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block text-xs text-brand-accent hover:underline"
                  >
                    Visit website
                  </a>
                ) : null}
              </div>
            </header>

            {products.isLoading ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted">Nothing from {name} in stock right now.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((product, i) => {
                  const productVariants = variantsByProduct.get(itemId(product)) ?? [];
                  return (
                    <ProductCard
                      key={itemId(product)}
                      product={product}
                      placeholderImage={placeholders[i]}
                      price={getProductPrice(product, productVariants)}
                      colors={getColorSwatchValues(productVariants)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
      <StorefrontFooter />
    </div>
  );
}
