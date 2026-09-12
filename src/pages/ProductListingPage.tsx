import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useEntityInfiniteList, useEntityList } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { ProductCard } from "@/components/storefront/product-card";
import { PriceRangeSlider } from "@/components/storefront/price-range-slider";
import { CheckboxFilterGroup, type FilterOption } from "@/components/storefront/checkbox-filter-group";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { getProductPrice, getColorSwatchValues } from "@/lib/product-pricing";
import { useVariantAvailability } from "@/lib/blocks/inventory";

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
  const [searchParams] = useSearchParams();
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

  const categories = useEntityList("Category", { pageNo: 1, pageSize: 100 });
  const category = (categories.data?.items ?? []).find((c) => itemId(c) === categoryId);

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

  function clearFilters() {
    setFabricColor([]);
    setStructureColor([]);
    setMaterial([]);
    setSize([]);
    setPriceRange(null);
    setInStockOnly(false);
  }

  const hasFilters =
    fabricColor.length > 0 ||
    structureColor.length > 0 ||
    material.length > 0 ||
    size.length > 0 ||
    priceRange !== null ||
    inStockOnly;

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted">
          <Link to="/" className="hover:text-ink">
            Home
          </Link>
          <ChevronRight size={12} />
          <span className="text-ink">{heading}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-1">
            <div className="border-b border-hairline-soft py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Price</h3>
                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="text-xs font-medium text-brand-accent hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              <div className="mt-4">
                <PriceRangeSlider min={priceBounds[0]} max={priceBounds[1]} value={effectiveRange} onChange={setPriceRange} />
              </div>
            </div>
            <label className="flex items-center gap-2 border-b border-hairline-soft py-4 text-sm text-ink">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="accent-[var(--color-brand-accent)]"
              />
              In stock only
            </label>
            <CheckboxFilterGroup title="Fabric Color" options={fabricOptions} selected={fabricColor} onChange={setFabricColor} />
            <CheckboxFilterGroup title="Structure Color" options={structureOptions} selected={structureColor} onChange={setStructureColor} />
            <CheckboxFilterGroup title="Material" options={materialOptions} selected={material} onChange={setMaterial} />
            <CheckboxFilterGroup title="Size" options={sizeOptions} selected={size} onChange={setSize} />
          </aside>

          <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-[28px] text-ink">{heading}</h1>
                <p className="text-sm text-muted">{filtered.length} products</p>
              </div>
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} className="w-44" aria-label="Sort by">
                <option value="newest">Filter by: Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </Select>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <Spinner className="h-6 w-6" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-20 text-center text-sm text-muted">
                {products.hasNextPage
                  ? "Nothing in what's loaded so far matches these filters — try loading more."
                  : "No products match these filters."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
              <div className="mt-8 flex flex-col items-center gap-3">
                <p className="text-xs text-muted">
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
                    {products.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <StorefrontFooter />
    </div>
  );
}
