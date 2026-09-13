import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useEntityListBatch } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { HeroBanner } from "@/components/storefront/hero-banner";
import { ProductRail, type ProductRailItem } from "@/components/storefront/product-rail";
import { getProductPrice, getColorSwatchValues, isOnSale } from "@/lib/product-pricing";
import { usePageMeta } from "@/lib/seo";
import { sortByViewOrder, useRecentlyViewed, whereProductIds } from "@/lib/recently-viewed";

function itemId(record: EntityRecord): string {
  return (record.ItemId ?? record.itemId) as string;
}

export default function HomePage() {
  usePageMeta({
    title: "Logoipsum — Decorate your Space with Us",
    description: "Furniture and home decor, chosen well. Browse by room, brand or style.",
    canonicalPath: "/",
  });
  const { theme } = useTheme();

  // Only fetched when there's a history to fetch — a first-time visitor issues no extra query
  // and sees no empty rail. Declared before the batch below so it can join the same request.
  const recentIds = useRecentlyViewed();
  const recentWhere = useMemo(() => whereProductIds(recentIds.slice(0, 8)), [recentIds]);

  // Four independent reads (none needs another's result) in one round trip instead of four —
  // see `useEntityListBatch` / `collections.ts`'s `runBatchList`.
  const batch = useEntityListBatch([
    { key: "categories", schemaName: "Category", params: { pageNo: 1, pageSize: 100 } },
    { key: "products", schemaName: "Product", params: { pageNo: 1, pageSize: 200 } },
    { key: "variants", schemaName: "ProductVariant", params: { pageNo: 1, pageSize: 500 } },
    { key: "recentProducts", schemaName: "Product", params: { pageSize: 8, where: recentWhere }, enabled: Boolean(recentWhere) },
  ]);
  const categories = { data: batch.data?.categories, isLoading: batch.isLoading };
  const products = { data: batch.data?.products, isLoading: batch.isLoading };
  const variants = { data: batch.data?.variants, isLoading: batch.isLoading };
  const recentProducts = { data: batch.data?.recentProducts, isLoading: batch.isLoading };

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, EntityRecord[]>();
    for (const variant of variants.data?.items ?? []) {
      const productId = variant.ProductId as string;
      if (!map.has(productId)) map.set(productId, []);
      map.get(productId)!.push(variant);
    }
    return map;
  }, [variants.data]);

  const topCategories = useMemo(
    () =>
      (categories.data?.items ?? [])
        .filter((c) => !c.ParentId)
        .sort((a, b) => String(a.Name).localeCompare(String(b.Name))),
    [categories.data]
  );

  const chairCategory = topCategories.find((c) => /chair/i.test(String(c.Name)));
  const allProducts = products.data?.items ?? [];

  const popularChairs = useMemo(() => {
    if (chairCategory) {
      const chairId = itemId(chairCategory);
      const inChairCategory = allProducts.filter(
        (p) => Array.isArray(p.CategoryIds) && (p.CategoryIds as string[]).includes(chairId)
      );
      if (inChairCategory.length > 0) return inChairCategory.slice(0, 5);
    }
    return allProducts.slice(0, 5);
  }, [allProducts, chairCategory]);

  const onSale = useMemo(
    () => allProducts.filter((p) => (variantsByProduct.get(itemId(p)) ?? []).some((v) => isOnSale(v))).slice(0, 5),
    [allProducts, variantsByProduct]
  );

  const popularPlaceholders = useMemo(() => assignPlaceholders(popularChairs, theme), [popularChairs, theme]);
  const salePlaceholders = useMemo(() => assignPlaceholders(onSale, theme), [onSale, theme]);
  const categoryPlaceholders = useMemo(() => assignPlaceholders(topCategories.slice(0, 4), theme), [topCategories, theme]);

  function toRailItems(list: EntityRecord[], placeholders: string[]): ProductRailItem[] {
    return list.map((product, i) => {
      const productVariants = variantsByProduct.get(itemId(product)) ?? [];
      return {
        product,
        placeholderImage: placeholders[i],
        price: getProductPrice(product, productVariants),
        colors: getColorSwatchValues(productVariants),
      };
    });
  }

  const loadingRails = products.isLoading || variants.isLoading;

  const recentlyViewed = useMemo(
    () => sortByViewOrder(recentProducts.data?.items ?? [], recentIds, itemId),
    [recentProducts.data, recentIds]
  );
  const recentPlaceholders = useMemo(() => assignPlaceholders(recentlyViewed, theme), [recentlyViewed, theme]);

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <HeroBanner />

        {/* Above the generic rails: someone who's been here before is most likely to be
            coming back to something specific. Renders nothing on a first visit. */}
        <ProductRail title="Recently viewed" items={toRailItems(recentlyViewed, recentPlaceholders)} />

        <ProductRail title="Popular Chairs" viewAllHref="/products" items={toRailItems(popularChairs, popularPlaceholders)} loading={loadingRails} />

        <ProductRail title="Products on Sale" viewAllHref="/products" items={toRailItems(onSale, salePlaceholders)} loading={loadingRails} />

        {topCategories.length > 0 && (
          <section className="rounded-2xl bg-gradient-to-br from-brand-accent-soft via-surface-soft to-brand-accent-soft px-6 py-10 sm:px-10">
            <h2 className="font-display text-center text-[28px] text-ink">Pick your Category</h2>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {topCategories.slice(0, 4).map((category, i) => (
                <Link
                  key={itemId(category)}
                  to={`/products?category=${itemId(category)}`}
                  className="group overflow-hidden rounded-xl bg-canvas shadow-[var(--shadow-card)]"
                >
                  <div className="aspect-[4/5] overflow-hidden">
                    <img
                      src={categoryPlaceholders[i]}
                      alt={category.Name as string}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <p className="px-3 py-2.5 text-center text-sm font-medium text-ink">{category.Name as string}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <StorefrontFooter />
    </div>
  );
}
