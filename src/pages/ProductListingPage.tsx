import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpDown, ChevronRight, SearchX, SlidersHorizontal, X } from "lucide-react";
import { useEntityInfiniteList, useEntityList } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { ProductCard } from "@/components/storefront/product-card";
import { PriceRangeSlider } from "@/components/storefront/price-range-slider";
import { CheckboxFilterGroup, type FilterOption } from "@/components/storefront/checkbox-filter-group";
import { FilterLinkList } from "@/components/storefront/filter-link-list";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { getProductPrice, getColorSwatchValues } from "@/lib/product-pricing";
import { useVariantAvailability } from "@/lib/blocks/inventory";
import { usePageMeta } from "@/lib/seo";

interface AttributeItem {
  Code?: string;
  Name?: string;
  Value?: string;
}

function itemId(record: EntityRecord): string {
  return (record.ItemId ?? record.itemId) as string;
}

function facetOptions(products: EntityRecord[], codePattern: RegExp): FilterOption[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    const attributes = Array.isArray(product.Attributes) ? (product.Attributes as AttributeItem[]) : [];
    for (const attr of attributes) {
      if (attr.Value && (codePattern.test(attr.Code ?? "") || codePattern.test(attr.Name ?? ""))) {
        counts.set(attr.Value, (counts.get(attr.Value) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value]) => ({ value, label: value }));
}

function productHasAttributeValue(product: EntityRecord, codePattern: RegExp, values: string[]): boolean {
  if (values.length === 0) return true;
  const attributes = Array.isArray(product.Attributes) ? (product.Attributes as AttributeItem[]) : [];
  return attributes.some(
    (attr) => attr.Value && values.includes(attr.Value) && (codePattern.test(attr.Code ?? "") || codePattern.test(attr.Name ?? ""))
  );
}

type SortOption = "newest" | "price-asc" | "price-desc";

/** One screenful-ish. Small enough that the first paint is quick, large enough that "load
 *  more" isn't a treadmill. */
const PAGE_SIZE = 24;

export default function ProductListingPage() {
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryId = searchParams.get("category") ?? "";
  const brandId = searchParams.get("brand") ?? "";
  const search = searchParams.get("q") ?? "";

  const [fabricColor, setFabricColor] = useState<string[]>([]);
  const [structureColor, setStructureColor] = useState<string[]>([]);
  const [material, setMaterial] = useState<string[]>([]);
  const [size, setSize] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [sort, setSort] = useState<SortOption>("newest");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileFiltersOpen]);

  const categories = useEntityList("Category", { pageNo: 1, pageSize: 100 });
  const category = (categories.data?.items ?? []).find((c) => itemId(c) === categoryId);

  // Direct children of whatever category is currently active — e.g. viewing "Bedroom" (a
  // top-level category) lists "Beds"/"Nightstands" so a shopper can narrow further. Nothing to
  // show for a leaf category (no children) or when browsing "All Products" (no category set).
  const subcategories = useMemo(() => {
    if (!categoryId) return [];
    return (categories.data?.items ?? []).filter((c) => (c.ParentId as string | undefined) === categoryId);
  }, [categories.data, categoryId]);

  const brands = useEntityList("Brand", { pageNo: 1, pageSize: 100 });
  // Same "no explicit status means visible" rule as BrandListingPage.
  const brandOptions = useMemo(
    () =>
      (brands.data?.items ?? [])
        .filter((b) => (b.Status as string | undefined) !== "inactive")
        .slice()
        .sort((a, b) => String(a.Name).localeCompare(String(b.Name))),
    [brands.data]
  );

  function hrefWithParam(key: "category" | "brand", value: string): string {
    const next = new URLSearchParams(searchParams);
    if (next.get(key) === value) next.delete(key); // clicking the active one clears it
    else next.set(key, value);
    const qs = next.toString();
    return qs ? `/products?${qs}` : "/products";
  }

  const where = useMemo(() => {
    const w: Record<string, unknown> = {};
    if (categoryId) w.CategoryIds = { contains: categoryId };
    if (brandId) w.BrandId = { eq: brandId };
    if (search) w.or = [{ Name: { contains: search } }, { ShortDescription: { contains: search } }];
    return Object.keys(w).length > 0 ? w : undefined;
  }, [categoryId, brandId, search]);

  // Was a single fixed `pageSize: 100` fetch — a silent cap that looked like the whole
  // catalog. Now pages in and accumulates, so the client-side facets/sort/price/stock filters
  // below still operate over one growing set rather than over whichever page you landed on.
  const products = useEntityInfiniteList("Product", { pageSize: PAGE_SIZE, where });
  const allProducts = products.items;

  // Scoped to the products actually loaded, instead of the old unbounded `pageSize: 500`
  // fetch of every variant in the catalog — that was the real scaling problem on this page,
  // not the product cap.
  const loadedProductIds = useMemo(() => allProducts.map(itemId), [allProducts]);
  const variants = useEntityList(
    "ProductVariant",
    { pageNo: 1, pageSize: Math.max(100, loadedProductIds.length * 6), where: { ProductId: { in: loadedProductIds } } },
    loadedProductIds.length > 0
  );

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, EntityRecord[]>();
    for (const variant of variants.data?.items ?? []) {
      const productId = variant.ProductId as string;
      if (!map.has(productId)) map.set(productId, []);
      map.get(productId)!.push(variant);
    }
    return map;
  }, [variants.data]);

  // Real stock check against WarehouseInventory (see lib/blocks/inventory.ts) — bounded to
  // this page's own variants, not the whole catalog, since the gateway can't aggregate this
  // server-side. `maxRows` raised past the hook's default since a listing page can easily
  // have more variant/warehouse combinations than a single product's detail page does.
  const allVariantIds = useMemo(() => (variants.data?.items ?? []).map(itemId), [variants.data]);
  const { availability: variantAvailability } = useVariantAvailability(
    allVariantIds,
    Math.max(200, allVariantIds.length * 3)
  );

  function productInStock(product: EntityRecord): boolean {
    if (product.IsInventoryTracked === false) return true;
    const productVariants = variantsByProduct.get(itemId(product)) ?? [];
    if (productVariants.length === 0) return true; // no variants to check yet — don't hide it
    return productVariants.some((variant) => {
      if (variant.IsInventoryTracked === false || variant.AllowBackorder === true) return true;
      return (variantAvailability.get(itemId(variant))?.totalAvailable ?? 0) > 0;
    });
  }

  const priceByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of allProducts) {
      const price = getProductPrice(product, variantsByProduct.get(itemId(product)) ?? []);
      if (price) map.set(itemId(product), price.current);
    }
    return map;
  }, [allProducts, variantsByProduct]);

  const priceBounds = useMemo<[number, number]>(() => {
    const values = [...priceByProduct.values()];
    if (values.length === 0) return [0, 1000];
    return [Math.floor(Math.min(...values)), Math.ceil(Math.max(...values))];
  }, [priceByProduct]);

  const effectiveRange = priceRange ?? priceBounds;

  const fabricOptions = useMemo(() => facetOptions(allProducts, /fabric.?colou?r/i), [allProducts]);
  const structureOptions = useMemo(() => facetOptions(allProducts, /structure.?colou?r/i), [allProducts]);
  const materialOptions = useMemo(() => facetOptions(allProducts, /^material$/i), [allProducts]);
  const sizeOptions = useMemo(() => facetOptions(allProducts, /^size$/i), [allProducts]);

  const filtered = useMemo(() => {
    let list = allProducts.filter((product) => {
      const price = priceByProduct.get(itemId(product));
      if (price !== undefined && (price < effectiveRange[0] || price > effectiveRange[1])) return false;
      if (!productHasAttributeValue(product, /fabric.?colou?r/i, fabricColor)) return false;
      if (!productHasAttributeValue(product, /structure.?colou?r/i, structureColor)) return false;
      if (!productHasAttributeValue(product, /^material$/i, material)) return false;
      if (!productHasAttributeValue(product, /^size$/i, size)) return false;
      if (inStockOnly && !productInStock(product)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "price-asc") return (priceByProduct.get(itemId(a)) ?? 0) - (priceByProduct.get(itemId(b)) ?? 0);
      if (sort === "price-desc") return (priceByProduct.get(itemId(b)) ?? 0) - (priceByProduct.get(itemId(a)) ?? 0);
      return String(b.CreatedDate ?? "").localeCompare(String(a.CreatedDate ?? ""));
    });
    return list;
  }, [
    allProducts,
    priceByProduct,
    effectiveRange,
    fabricColor,
    structureColor,
    material,
    size,
    sort,
    inStockOnly,
    variantsByProduct,
    variantAvailability,
  ]);

  const placeholders = useMemo(() => assignPlaceholders(filtered, theme), [filtered, theme]);
  const loading = products.isLoading || variants.isLoading;
  const heading = (category?.Name as string) || (search ? `Results for "${search}"` : "All Products");

  usePageMeta({
    title: `${heading} — Cartio`,
    description: category?.Name
      ? `Browse ${category.Name as string} at Cartio.`
      : "Browse everything we stock — furniture and home decor.",
    // Canonical drops the query string on purpose: /products?q=sofa and /products?q=couch are
    // the same page of the same catalog as far as search is concerned, and letting each
    // produce its own indexable URL is how a catalog ends up competing with itself.
    canonicalPath: "/products",
    // A search-results page has nothing durable to offer an index, and its content changes
    // with every query. Category and brand landing pages are the ones worth indexing.
    noIndex: Boolean(search),
  });

  function clearFilters() {
    setFabricColor([]);
    setStructureColor([]);
    setMaterial([]);
    setSize([]);
    setPriceRange(null);
    setInStockOnly(false);
    if (brandId) {
      const next = new URLSearchParams(searchParams);
      next.delete("brand");
      setSearchParams(next);
    }
  }

  const hasFilters =
    Boolean(brandId) ||
    fabricColor.length > 0 ||
    structureColor.length > 0 ||
    material.length > 0 ||
    size.length > 0 ||
    priceRange !== null ||
    inStockOnly;

  const selectedBrand = brandOptions.find((brand) => itemId(brand) === brandId);
  const activeFilterCount =
    (brandId ? 1 : 0) +
    fabricColor.length +
    structureColor.length +
    material.length +
    size.length +
    (priceRange ? 1 : 0) +
    (inStockOnly ? 1 : 0);

  function clearBrand() {
    const next = new URLSearchParams(searchParams);
    next.delete("brand");
    setSearchParams(next);
  }

  const activeFilterChips: { key: string; label: string; onClear: () => void }[] = [];
  if (selectedBrand) {
    activeFilterChips.push({ key: `brand-${brandId}`, label: `Brand: ${selectedBrand.Name as string}`, onClear: clearBrand });
  }
  for (const value of fabricColor) {
    activeFilterChips.push({
      key: `fabric-${value}`,
      label: `Fabric: ${value}`,
      onClear: () => setFabricColor((current) => current.filter((item) => item !== value)),
    });
  }
  for (const value of structureColor) {
    activeFilterChips.push({
      key: `structure-${value}`,
      label: `Structure: ${value}`,
      onClear: () => setStructureColor((current) => current.filter((item) => item !== value)),
    });
  }
  for (const value of material) {
    activeFilterChips.push({
      key: `material-${value}`,
      label: `Material: ${value}`,
      onClear: () => setMaterial((current) => current.filter((item) => item !== value)),
    });
  }
  for (const value of size) {
    activeFilterChips.push({
      key: `size-${value}`,
      label: `Size: ${value}`,
      onClear: () => setSize((current) => current.filter((item) => item !== value)),
    });
  }
  if (priceRange) {
    activeFilterChips.push({
      key: "price",
      label: `$${effectiveRange[0]}–$${effectiveRange[1]}`,
      onClear: () => setPriceRange(null),
    });
  }
  if (inStockOnly) {
    activeFilterChips.push({ key: "stock", label: "In stock", onClear: () => setInStockOnly(false) });
  }

  const listingDescription = search
    ? `Products matching “${search}”, refined by the filters you choose.`
    : category
      ? `Explore our considered ${String(category.Name).toLowerCase()} collection, selected for quality and everyday living.`
      : "Explore furniture and objects selected for enduring quality, useful detail, and modern homes.";

  function renderFilterControls() {
    return (
      <>
        <div className="border-b border-hairline-soft py-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">Price range</h3>
          <div className="mt-5">
            <PriceRangeSlider min={priceBounds[0]} max={priceBounds[1]} value={effectiveRange} onChange={setPriceRange} />
          </div>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-hairline-soft py-5 text-sm text-ink">
          <span>
            <span className="block font-medium">Available now</span>
            <span className="mt-0.5 block text-xs text-muted">Only show products currently in stock</span>
          </span>
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(event) => setInStockOnly(event.target.checked)}
            className="h-4 w-4 flex-none accent-[var(--color-brand-accent)]"
          />
        </label>
        <FilterLinkList
          title="Brands"
          items={brandOptions.map((brand) => ({ id: itemId(brand), label: brand.Name as string }))}
          activeId={brandId}
          hrefFor={(id) => hrefWithParam("brand", id)}
        />
        <CheckboxFilterGroup title="Fabric colour" options={fabricOptions} selected={fabricColor} onChange={setFabricColor} />
        <CheckboxFilterGroup title="Structure colour" options={structureOptions} selected={structureColor} onChange={setStructureColor} />
        <CheckboxFilterGroup title="Material" options={materialOptions} selected={material} onChange={setMaterial} />
        <CheckboxFilterGroup title="Size" options={sizeOptions} selected={size} onChange={setSize} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-lg border border-hairline bg-surface px-5 py-7 shadow-[var(--shadow-card)] sm:px-8 sm:py-9">
          <nav className="flex items-center gap-1.5 text-xs text-muted" aria-label="Breadcrumb">
            <Link to="/" className="transition-colors hover:text-ink">Home</Link>
            <ChevronRight size={12} />
            <span className="text-ink">{heading}</span>
          </nav>
          <div className="mt-7 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">The Cartio collection</p>
              <h1 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl lg:text-5xl">{heading}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-steel">{listingDescription}</p>
            </div>
            <div className="flex w-fit items-center gap-3 rounded-full border border-hairline bg-surface-soft px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-brand-accent" />
              <span className="text-xs font-semibold text-ink">
                {loading ? "Preparing collection" : `${products.totalCount || filtered.length} products`}
              </span>
            </div>
          </div>
          {subcategories.length > 0 && (
            <div className="mt-7 flex gap-2 overflow-x-auto border-t border-hairline pt-5">
              {subcategories.map((subcategory) => (
                <Link
                  key={itemId(subcategory)}
                  to={hrefWithParam("category", itemId(subcategory))}
                  className="flex-none rounded-full border border-border-strong px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface-soft"
                >
                  {subcategory.Name as string}
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-5 rounded-md border border-hairline bg-surface px-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between border-b border-hairline py-5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={17} />
                  <h2 className="text-sm font-semibold text-ink">Refine results</h2>
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1.5 text-[10px] font-semibold text-on-primary">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="text-xs font-semibold text-brand-accent hover:underline">
                    Clear
                  </button>
                )}
              </div>
              {renderFilterControls()}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="rounded-md border border-hairline bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(true)}
                    className="inline-flex h-[46px] items-center gap-2 rounded-full border border-border-strong px-4 text-sm font-semibold text-ink lg:hidden"
                  >
                    <SlidersHorizontal size={16} />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] text-on-primary">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  <p className="text-sm text-steel">
                    <span className="font-semibold text-ink">{filtered.length}</span>{" "}
                    {hasFilters ? "matching" : "currently shown"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpDown size={15} className="hidden text-muted sm:block" />
                  <Select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="w-44 sm:w-48" aria-label="Sort products">
                    <option value="newest">Newest arrivals</option>
                    <option value="price-asc">Price: Low to high</option>
                    <option value="price-desc">Price: High to low</option>
                  </Select>
                </div>
              </div>
              {activeFilterChips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
                  {activeFilterChips.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={filter.onClear}
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1.5 text-xs font-medium text-steel transition-colors hover:text-ink"
                    >
                      {filter.label}
                      <X size={12} />
                    </button>
                  ))}
                  <button type="button" onClick={clearFilters} className="px-2 py-1.5 text-xs font-semibold text-brand-accent hover:underline">
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="mt-5 flex min-h-[420px] flex-col items-center justify-center rounded-md border border-hairline bg-surface">
                <Spinner className="h-10 w-10" />
                <p className="mt-4 text-sm font-medium text-ink">Preparing the collection</p>
                <p className="mt-1 text-xs text-muted">Loading products and availability…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-5 flex min-h-[420px] flex-col items-center justify-center rounded-md border border-dashed border-border-strong bg-surface px-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-muted">
                  <SearchX size={24} strokeWidth={1.7} />
                </span>
                <h2 className="mt-5 font-display text-xl text-ink">No matching products</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                  {products.hasNextPage
                    ? "Nothing loaded so far matches this combination. Load more products or adjust the filters."
                    : "Try removing one or more filters to broaden the collection."}
                </p>
                {search ? (
                  <Link to="/products" className="mt-5 text-sm font-semibold text-brand-accent hover:underline">View the full collection</Link>
                ) : hasFilters ? (
                  <Button type="button" variant="secondary" className="mt-5" onClick={clearFilters}>Clear filters</Button>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3">
                {filtered.map((product, i) => (
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

            {/* Deliberately explicit about what's loaded versus what exists. The filters above
                run over the loaded set, so "12 of 240" is the difference between "no products
                match" and "no products match yet" — and the reason this says so rather than
                quietly implying the catalog is 24 items long, which the old fixed fetch did. */}
            {!loading && products.totalCount > 0 && (
              <div className="mt-12 flex flex-col items-center gap-4 rounded-md border border-hairline bg-surface px-5 py-7">
                <div className="w-full max-w-xs">
                  <div className="h-1.5 overflow-hidden rounded-full bg-hairline">
                    <div
                      className="h-full rounded-full bg-brand-accent transition-[width] duration-300"
                      style={{ width: `${Math.min(100, (products.loaded / products.totalCount) * 100)}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs font-medium text-muted">
                  {hasFilters
                    ? `${filtered.length} of ${products.loaded} loaded · ${products.totalCount} in total`
                    : `Showing ${products.loaded} of ${products.totalCount}`}
                </p>
                {products.hasNextPage && (
                  <Button
                    variant="secondary"
                    disabled={products.isFetchingNextPage}
                    onClick={() => void products.fetchNextPage()}
                  >
                    {products.isFetchingNextPage ? (
                      <><Spinner className="h-4 w-4" /> Loading more…</>
                    ) : "Load more products"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setMobileFiltersOpen(false)}
            className="absolute inset-0 bg-scrim backdrop-blur-[2px]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filter-title"
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-canvas shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 id="mobile-filter-title" className="font-display text-xl text-ink">Refine results</h2>
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1.5 text-[10px] font-semibold text-on-primary">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                autoFocus
                aria-label="Close filters"
                onClick={() => setMobileFiltersOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5">{renderFilterControls()}</div>
            <div className="grid grid-cols-2 gap-3 border-t border-hairline bg-surface px-5 py-4">
              <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasFilters}>Clear all</Button>
              <Button type="button" onClick={() => setMobileFiltersOpen(false)}>Show {filtered.length}</Button>
            </div>
          </aside>
        </div>
      )}

      <StorefrontFooter />
    </div>
  );
}
