import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, House, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
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
    title: "Cartio — Decorate your Space with Us",
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

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <HeroBanner />

        <section aria-label="Shopping benefits" className="grid border-b border-hairline py-7 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Sparkles, title: "Considered selection", copy: "Quality pieces, thoughtfully chosen" },
            { icon: PackageCheck, title: "Order history", copy: "Keep purchases and details in one place" },
            { icon: ShieldCheck, title: "Secure account", copy: "Private email-based account setup" },
            { icon: House, title: "Browse by room", copy: "Focused collections for easier decisions" },
          ].map(({ icon: Icon, title, copy }, index) => (
            <div
              key={title}
              className={`flex items-center gap-3 px-3 py-3 ${index > 0 ? "lg:border-l lg:border-hairline" : ""}`}
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-accent-soft text-brand-accent">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">{title}</h2>
                <p className="mt-0.5 text-xs text-muted">{copy}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Above the generic rails: someone who's been here before is most likely to be
            coming back to something specific. Renders nothing on a first visit. */}
        <ProductRail
          eyebrow="Continue exploring"
          title="Recently viewed"
          description="Pick up where you left off."
          items={toRailItems(recentlyViewed, recentPlaceholders)}
        />

        <ProductRail
          eyebrow="Customer favourites"
          title="Popular chairs"
          description="Comfort-led seating selected for dining, working, and unwinding."
          viewAllHref="/products"
          items={toRailItems(popularChairs, popularPlaceholders)}
          loading={loadingRails}
        />

        <ProductRail
          eyebrow="Limited opportunities"
          title="Exceptional pieces, considered prices"
          description="Selected designs available at a reduced price while stock lasts."
          viewAllHref="/products"
          items={toRailItems(onSale, salePlaceholders)}
          loading={loadingRails}
        />

        {topCategories.length > 0 && (
          <section className="my-8 rounded-lg bg-surface-dark px-5 py-10 text-on-dark sm:px-8 sm:py-14 lg:px-12">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">Shop by room</p>
                <h2 className="mt-3 font-display text-3xl text-on-dark sm:text-4xl">Find your starting point</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-on-dark/60">
                  Explore focused collections created around the way each room needs to work and feel.
                </p>
              </div>
              <Link
                to="/products"
                className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-on-dark transition-colors hover:text-brand-accent"
              >
                Browse every product <ArrowRight size={14} />
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
              {topCategories.slice(0, 4).map((category, i) => (
                <Link
                  key={itemId(category)}
                  to={`/products?category=${itemId(category)}`}
                  className="group relative overflow-hidden rounded-md border border-white/10 bg-white/[0.04]"
                >
                  <div className="aspect-[4/5] overflow-hidden">
                    <img
                      src={categoryPlaceholders[i]}
                      alt={category.Name as string}
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-4 pt-14">
                    <p className="text-sm font-semibold text-white sm:text-base">{category.Name as string}</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-white/65 transition-colors group-hover:text-white">
                      Explore collection <ArrowRight size={12} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="my-16 grid overflow-hidden rounded-lg border border-hairline bg-surface shadow-[var(--shadow-card)] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">The Cartio approach</p>
            <h2 className="mt-4 max-w-lg font-display text-3xl leading-tight text-ink sm:text-4xl">
              Less noise. Better choices for every room.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-steel">
              We bring material, proportion, and everyday function into one considered edit—so creating a cohesive home feels simpler.
            </p>
            <Link
              to="/products"
              className="mt-7 inline-flex w-fit items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-brand-accent"
            >
              Explore the full collection <ArrowRight size={16} />
            </Link>
          </div>
          <div className="relative min-h-72 overflow-hidden bg-[linear-gradient(135deg,var(--color-surface-soft),var(--color-brand-accent-soft))] lg:min-h-[390px]">
            <div className="absolute -right-8 -top-12 h-60 w-60 rounded-full bg-brand-accent/85" />
            <div className="absolute bottom-[-12%] left-[12%] h-[72%] w-[56%] rounded-t-full bg-sage" />
            <div className="absolute bottom-[12%] right-[9%] h-[42%] w-[42%] rounded-md bg-surface-dark/90 shadow-2xl" />
            <div className="absolute left-[10%] top-[12%] h-28 w-28 rounded-full border-[18px] border-canvas/80" />
          </div>
        </section>
      </main>

      <StorefrontFooter />
    </div>
  );
}
