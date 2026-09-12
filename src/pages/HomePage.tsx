import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useEntityList } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { HeroBanner } from "@/components/storefront/hero-banner";
import { ProductRail, type ProductRailItem } from "@/components/storefront/product-rail";
import { getProductPrice, getColorSwatchValues, isOnSale } from "@/lib/product-pricing";
import { usePageMeta } from "@/lib/seo";

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

  const categories = useEntityList("Category", { pageNo: 1, pageSize: 100 });
  const products = useEntityList("Product", { pageNo: 1, pageSize: 200 });
  const variants = useEntityList("ProductVariant", { pageNo: 1, pageSize: 500 });

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

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <HeroBanner />

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
