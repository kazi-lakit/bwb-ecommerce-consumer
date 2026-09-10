import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useEntityList } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { ProductCard } from "@/components/storefront/product-card";
import { PriceRangeSlider } from "@/components/storefront/price-range-slider";
import { CheckboxFilterGroup, type FilterOption } from "@/components/storefront/checkbox-filter-group";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { getProductPrice, getColorSwatchValues } from "@/lib/product-pricing";

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

export default function ProductListingPage() {
  const { theme } = useTheme();
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get("category") ?? "";
  const search = searchParams.get("q") ?? "";

  const [fabricColor, setFabricColor] = useState<string[]>([]);
  const [structureColor, setStructureColor] = useState<string[]>([]);
  const [material, setMaterial] = useState<string[]>([]);
  const [size, setSize] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [sort, setSort] = useState<SortOption>("newest");

  const categories = useEntityList("Category", { pageNo: 1, pageSize: 100 });
  const category = (categories.data?.items ?? []).find((c) => itemId(c) === categoryId);

  const where = useMemo(() => {
    const w: Record<string, unknown> = {};
    if (categoryId) w.CategoryIds = { contains: categoryId };
    if (search) w.or = [{ Name: { contains: search } }, { ShortDescription: { contains: search } }];
    return Object.keys(w).length > 0 ? w : undefined;
  }, [categoryId, search]);

  const products = useEntityList("Product", { pageNo: 1, pageSize: 100, where });
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

  const allProducts = products.data?.items ?? [];

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
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "price-asc") return (priceByProduct.get(itemId(a)) ?? 0) - (priceByProduct.get(itemId(b)) ?? 0);
      if (sort === "price-desc") return (priceByProduct.get(itemId(b)) ?? 0) - (priceByProduct.get(itemId(a)) ?? 0);
      return String(b.CreatedDate ?? "").localeCompare(String(a.CreatedDate ?? ""));
    });
    return list;
  }, [allProducts, priceByProduct, effectiveRange, fabricColor, structureColor, material, size, sort]);

  const placeholders = useMemo(() => assignPlaceholders(filtered, theme), [filtered, theme]);
  const loading = products.isLoading || variants.isLoading;
  const heading = (category?.Name as string) || (search ? `Results for "${search}"` : "All Products");

  function clearFilters() {
    setFabricColor([]);
    setStructureColor([]);
    setMaterial([]);
    setSize([]);
    setPriceRange(null);
  }

  const hasFilters =
    fabricColor.length > 0 || structureColor.length > 0 || material.length > 0 || size.length > 0 || priceRange !== null;

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
              <p className="py-20 text-center text-sm text-muted">No products match these filters.</p>
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
          </div>
        </div>
      </main>

      <StorefrontFooter />
    </div>
  );
}
