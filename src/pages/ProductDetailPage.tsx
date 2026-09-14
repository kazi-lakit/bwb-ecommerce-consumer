import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { BadgeCheck, ChevronRight, Heart, Headphones, PackageCheck, RotateCcw, Share2, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import clsx from "clsx";
import { useEntityList, useEntityListBatch } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { getPrimaryImage } from "@/lib/blocks/media";
import { useSingleVariantAvailability } from "@/lib/blocks/inventory";
import { assignPlaceholders } from "@/lib/placeholder-images";
import { useTheme } from "@/components/providers/theme-provider";
import { useCart } from "@/components/providers/cart-provider";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { toast } from "@/lib/toast-store";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { PaymentPartnersBar } from "@/components/storefront/payment-partners-bar";
import { ProductRail, type ProductRailItem } from "@/components/storefront/product-rail";
import { QuantityStepper } from "@/components/storefront/quantity-stepper";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { getVariantPrice, getProductPrice, formatMoney } from "@/lib/product-pricing";
import { breadcrumbJsonLd, metaDescription, productJsonLd, usePageMeta } from "@/lib/seo";
import { recordProductView, sortByViewOrder, useRecentlyViewed, whereProductIds } from "@/lib/recently-viewed";
import { ProductReviews } from "@/components/storefront/product-reviews";

interface MediaItem {
  MediaId?: string;
  Url?: string;
  AltText?: string;
  IsPrimary?: boolean;
  Type?: string;
}

interface AttributeItem {
  Code?: string;
  Name?: string;
  Value?: string;
}

interface OptionValue {
  Code?: string;
  Name?: string;
  Value?: string;
}

interface Dimensions {
  Weight?: number;
  WeightUnit?: string;
  Length?: number;
  Width?: number;
  Height?: number;
  DimensionUnit?: string;
}

function itemId(record: EntityRecord): string {
  return (record.ItemId ?? record.itemId) as string;
}

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { theme } = useTheme();
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  // `productList` and `categories` are independent of each other (and stable once fetched
  // for a given slug) — one round trip instead of two. `recentProducts` below stays a
  // separate query: its params depend on this page's own product (via `useRecentlyViewed`
  // recording the current view), so bundling it here would force `productList`/`categories`
  // to refetch every time that changes, which they otherwise never would.
  const detailBatch = useEntityListBatch([
    { key: "product", schemaName: "Product", params: { where: { Slug: { eq: slug } }, pageSize: 1 }, enabled: Boolean(slug) },
    { key: "categories", schemaName: "Category", params: { pageNo: 1, pageSize: 100 } },
  ]);
  const productList = { data: detailBatch.data?.product, isLoading: detailBatch.isLoading };
  const product = productList.data?.items[0];
  const productId = product ? itemId(product) : undefined;

  const variantList = useEntityList(
    "ProductVariant",
    { where: { ProductId: { eq: productId } }, pageSize: 50 },
    Boolean(productId)
  );
  const variants = variantList.data?.items ?? [];

  const categories = { data: detailBatch.data?.categories };
  // One extra query only when the product actually has a brand — most of the catalog does,
  // but a product without one shouldn't pay for the lookup.
  const brandId = product?.BrandId as string | undefined;
  const brandList = useEntityList("Brand", { pageSize: 1, where: { ItemId: { eq: brandId } } }, Boolean(brandId));
  const brand = brandList.data?.items?.[0];
  const categoryName = useMemo(() => {
    if (!product || !Array.isArray(product.CategoryIds)) return null;
    const firstId = (product.CategoryIds as string[])[0];
    return (categories.data?.items ?? []).find((c) => itemId(c) === firstId)?.Name as string | undefined;
  }, [product, categories.data]);

  const productItemId = product ? itemId(product) : undefined;

  useEffect(() => {
    if (productItemId) recordProductView(productItemId);
  }, [productItemId]);

  const recentIds = useRecentlyViewed(productItemId);
  const recentWhere = useMemo(() => whereProductIds(recentIds.slice(0, 8)), [recentIds]);
  const recentProducts = useEntityList("Product", { pageSize: 8, where: recentWhere }, Boolean(recentWhere));
  const recentlyViewed = useMemo(
    () => sortByViewOrder(recentProducts.data?.items ?? [], recentIds, itemId),
    [recentProducts.data, recentIds]
  );
  const recentPlaceholders = useMemo(() => assignPlaceholders(recentlyViewed, theme), [recentlyViewed, theme]);

  const relatedWhere = useMemo(() => {
    if (!product || !Array.isArray(product.CategoryIds) || !product.CategoryIds.length) return undefined;
    return { CategoryIds: { contains: (product.CategoryIds as string[])[0] } };
  }, [product]);
  const related = useEntityList("Product", { pageSize: 12, where: relatedWhere }, Boolean(relatedWhere));
  const otherProducts = useEntityList("Product", { pageSize: 12 }, !relatedWhere);

  const placeholder = useMemo(() => (product ? assignPlaceholders([product], theme)[0] : ""), [product, theme]);

  const defaultVariant = variants.find((v) => itemId(v) === product?.DefaultVariantId) ?? variants[0];
  const selectedVariant = variants.find((v) => itemId(v) === selectedVariantId) ?? defaultVariant;
  const price = getVariantPrice(selectedVariant);

  // Real stock check against WarehouseInventory — see lib/blocks/inventory.ts. A
  // product/variant can opt out of tracking (IsInventoryTracked=false) or allow selling past
  // zero (AllowBackorder=true); either one means "never block on availability".
  const inventoryTracked = (selectedVariant?.IsInventoryTracked as boolean | undefined) ?? (product?.IsInventoryTracked as boolean | undefined) ?? true;
  const allowBackorder = (selectedVariant?.AllowBackorder as boolean | undefined) ?? (product?.AllowBackorder as boolean | undefined) ?? false;
  const availability = useSingleVariantAvailability(selectedVariant ? itemId(selectedVariant) : undefined);
  const stockEnforced = inventoryTracked && !allowBackorder;
  const outOfStock = stockEnforced && !availability.isLoading && availability.totalAvailable <= 0;

  const colorOptions = useMemo(() => {
    const seen = new Map<string, { value: string; variantId: string }>();
    for (const variant of variants) {
      const optionValues = Array.isArray(variant.OptionValues) ? (variant.OptionValues as OptionValue[]) : [];
      const color = optionValues.find((o) => o.Code && /colou?r/i.test(o.Code));
      if (color?.Value && !seen.has(color.Value)) seen.set(color.Value, { value: color.Value, variantId: itemId(variant) });
    }
    return [...seen.values()];
  }, [variants]);

  const relatedItems = related.data?.items ?? otherProducts.data?.items ?? [];
  // Was two rails — "Perfect Match with Your Furniture" and "Customer also Viewed these
  // items" — both fed from this same list, arbitrarily split at index 5. The second was a
  // claim about other customers' behaviour that nothing in this app tracked. One rail now,
  // labelled for what it is: other products in the same category.
  const moreLikeThis = product ? relatedItems.filter((p) => itemId(p) !== itemId(product)).slice(0, 10) : [];
  const moreLikeThisPlaceholders = useMemo(() => assignPlaceholders(moreLikeThis, theme), [moreLikeThis, theme]);

  const primary = product ? getPrimaryImage(product) : undefined;

  // Every hook above this point runs on every render regardless of load state — this one
  // must too. It used to sit below the early returns for isLoading/!slug/!product, which
  // meant the very first render (still loading) called fewer hooks than every render after
  // (product loaded), tripping React's "rendered more hooks than during the previous render"
  // check (#310) — the crash reproduced on nearly every product once traffic wasn't already
  // sitting on a warm query cache. `product` being possibly undefined here is already handled
  // throughout via `product?.`.
  usePageMeta(
    useMemo(() => {
      const productName = (product?.Name as string) || "Product";
      const canonical = `/product/${(product?.Slug as string) || slug || ""}`;
      const image = primary?.Url as string | undefined;
      return {
        title: product ? `${productName} — Cartio` : "Cartio",
        description: metaDescription(
          (product?.ShortDescription as string) || (product?.LongDescription as string),
          `Buy ${productName} at Cartio.`
        ),
        canonicalPath: canonical,
        image,
        type: "product" as const,
        // Only emitted once the product has actually loaded — structured data describing a
        // placeholder is worse than none, because it's the version a crawler may cache.
        jsonLd: product
          ? {
              ...productJsonLd({
                name: productName,
                description: (product.ShortDescription as string) || undefined,
                image,
                sku: (selectedVariant?.Sku as string) || undefined,
                brand: (brand?.Name as string) || undefined,
                price: price?.current,
                currency: price?.currency,
                // Left undefined while the stock query is in flight, so the page never
                // asserts availability it doesn't know yet.
                inStock: !stockEnforced ? true : availability.isLoading ? undefined : !outOfStock,
                url: `${window.location.origin}${canonical}`,
              }),
              breadcrumb: breadcrumbJsonLd([
                { name: "Home", path: "/" },
                { name: "Products", path: "/products" },
                { name: productName, path: canonical },
              ]),
            }
          : undefined,
      };
    }, [product, slug, primary, selectedVariant, brand, price, stockEnforced, outOfStock, availability.isLoading])
  );

  if (productList.isLoading) {
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <main className="mx-auto flex max-w-[1440px] justify-center px-4 py-20 sm:px-6 lg:px-8">
          <div className="flex w-full max-w-md flex-col items-center rounded-lg border border-hairline bg-surface px-6 py-14 text-center shadow-[var(--shadow-card)]">
            <Spinner className="h-9 w-9" />
            <p className="mt-5 text-sm font-semibold text-ink">Preparing product details</p>
            <p className="mt-1 text-xs text-muted">Checking the latest options and availability.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!slug) return <Navigate to="/" replace />;

  if (!product) {
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <div className="rounded-lg border border-hairline bg-surface px-6 py-14 shadow-[var(--shadow-card)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">Product unavailable</p>
            <h1 className="font-display mt-3 text-3xl text-ink">We couldn't find this item</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-steel">
              It may have been removed or is no longer available. Explore the catalog to find a suitable alternative.
            </p>
            <Link
              to="/products"
              className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-accent px-6 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-accent-deep"
            >
              Explore the catalog
            </Link>
          </div>
        </main>
        <StorefrontFooter />
      </div>
    );
  }

  const media = (Array.isArray(product.Media) ? (product.Media as MediaItem[]) : []).filter((m) => m.Url);
  const mainImage = activeImage ?? primary?.Url ?? null;
  const attributes = Array.isArray(product.Attributes) ? (product.Attributes as AttributeItem[]) : [];
  const materialAttributes = attributes.filter((a) => /material/i.test(a.Code ?? "") || /material/i.test(a.Name ?? ""));
  const detailAttributes = attributes.filter((a) => !materialAttributes.includes(a));
  const dimensions = selectedVariant?.Dimensions as Dimensions | undefined;
  const name = (product.Name as string) || "Untitled product";
  const wishlisted = has(itemId(product));
  const activeColor = colorOptions.find((option) => option.variantId === (selectedVariant ? itemId(selectedVariant) : undefined))?.value;
  const salePercentage = price?.original && price.original > price.current
    ? Math.max(1, Math.round(((price.original - price.current) / price.original) * 100))
    : null;
  const canPurchase = Boolean(selectedVariant && price) && !outOfStock;

  function handleAddToCart() {
    if (!product || !selectedVariant || !price) {
      toast.error("This product isn't available to purchase right now.");
      return;
    }
    if (outOfStock) {
      toast.error("This item is out of stock.");
      return;
    }
    add(
      {
        key: itemId(selectedVariant),
        productId: itemId(product),
        variantId: itemId(selectedVariant),
        sku: (selectedVariant.Sku as string) || undefined,
        slug: (product.Slug as string) || itemId(product),
        name,
        imageUrl: primary?.Url,
        unitPrice: price.current,
        currency: price.currency,
      },
      quantity
    );
    toast.success(`Added ${quantity} × ${name} to your cart.`);
  }

  function toRailItems(list: EntityRecord[], placeholders: string[]): ProductRailItem[] {
    return list.map((p, i) => ({ product: p, placeholderImage: placeholders[i], price: getProductPrice(p, []) }));
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard.");
    } catch {
      toast.error("We couldn't copy the link. Copy it from your browser instead.");
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted">
          <Link to="/" className="hover:text-ink">Home</Link>
          <ChevronRight size={12} />
          <Link to="/products" className="hover:text-ink">Products</Link>
          {categoryName && (
            <>
              <ChevronRight size={12} />
              <span className="whitespace-nowrap">{categoryName}</span>
            </>
          )}
          <ChevronRight size={12} />
          <span aria-current="page" className="truncate text-ink">{name}</span>
        </nav>

        <section className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)] lg:gap-10 xl:gap-14">
          <div className="min-w-0">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-hairline bg-surface shadow-[var(--shadow-card)] sm:aspect-[5/4] lg:aspect-[4/5] xl:aspect-[5/4]">
              <ImageWithFallback src={mainImage} fallback={placeholder} alt={primary?.AltText || name} className="h-full w-full object-cover" />
              {categoryName && (
                <span className="absolute left-4 top-4 rounded-full border border-white/60 bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-900 shadow-sm backdrop-blur-sm">
                  {categoryName}
                </span>
              )}
            </div>
            {media.length > 1 && (
              <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1" aria-label="Product images">
                {media.map((m) => (
                  <button
                    key={m.MediaId ?? m.Url}
                    type="button"
                    onClick={() => setActiveImage(m.Url ?? null)}
                    aria-label={`View ${m.AltText || name}`}
                    aria-pressed={mainImage === m.Url}
                    className={clsx(
                      "h-20 w-20 flex-none overflow-hidden rounded-md border-2 bg-surface transition-all sm:h-24 sm:w-24",
                      mainImage === m.Url
                        ? "border-ink shadow-[var(--shadow-card)]"
                        : "border-transparent opacity-70 hover:border-border-strong hover:opacity-100"
                    )}
                  >
                    <ImageWithFallback src={m.Url} fallback={placeholder} alt={m.AltText || name} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-hairline bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7 lg:sticky lg:top-5 xl:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {brand ? (
                    <Link
                      to={`/brand/${(brand.Slug as string) || ((brand.ItemId ?? brand.itemId) as string)}`}
                      className="text-brand-accent hover:text-brand-accent-deep"
                    >
                      {brand.Name as string}
                    </Link>
                  ) : (
                    <span className="text-brand-accent">The Cartio collection</span>
                  )}
                  {selectedVariant?.Sku ? <span className="text-muted">SKU {selectedVariant.Sku as string}</span> : null}
                </div>
                <h1 className="font-display mt-3 text-3xl leading-tight text-ink sm:text-4xl">{name}</h1>
              </div>
              <div className="flex flex-none gap-2">
                <button
                  type="button"
                  aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                  onClick={() => toggle(itemId(product))}
                  className={clsx(
                    "flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-canvas transition-colors",
                    wishlisted ? "text-brand-error" : "text-steel hover:border-border-strong hover:text-brand-error"
                  )}
                >
                  <Heart size={17} fill={wishlisted ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  aria-label="Copy product link"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-canvas text-steel transition-colors hover:border-border-strong hover:text-ink"
                  onClick={() => void handleShare()}
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>

            {variantList.isLoading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-muted"><Spinner className="h-5 w-5" /> Loading options</div>
            ) : price ? (
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <span className="text-3xl font-semibold tracking-tight text-ink">{formatMoney(price.current, price.currency)}</span>
                {price.original && <span className="text-sm text-muted line-through">{formatMoney(price.original, price.currency)}</span>}
                {salePercentage && (
                  <span className="rounded-full bg-brand-accent/10 px-2.5 py-1 text-[11px] font-semibold text-brand-accent">Save {salePercentage}%</span>
                )}
              </div>
            ) : null}

            {product.ShortDescription ? <p className="mt-5 text-sm leading-6 text-steel">{product.ShortDescription as string}</p> : null}

            <div className="my-6 border-t border-hairline-soft" />

            {colorOptions.length > 0 && (
              <div>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <p className="text-xs font-semibold text-ink">Choose a colour</p>
                  {activeColor && <span className="text-xs text-muted">{activeColor}</span>}
                </div>
                <div className="flex flex-wrap gap-3">
                  {colorOptions.map((option) => (
                    <button
                      key={option.variantId}
                      type="button"
                      onClick={() => setSelectedVariantId(option.variantId)}
                      aria-label={option.value}
                      className={clsx(
                        "h-10 w-10 rounded-full border border-black/10 ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-105",
                        (selectedVariant ? itemId(selectedVariant) : defaultVariant && itemId(defaultVariant)) === option.variantId
                          ? "ring-ink"
                          : "ring-transparent"
                      )}
                      style={{ background: option.value }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className={clsx("flex items-center gap-2 text-xs font-semibold", colorOptions.length > 0 ? "mt-6" : "")}>
              {availability.isLoading && stockEnforced ? (
                <><Spinner className="h-4 w-4" /> <span className="text-muted">Checking availability</span></>
              ) : (
                <>
                  <span className={clsx("h-2 w-2 rounded-full", outOfStock ? "bg-brand-error" : stockEnforced && availability.totalAvailable <= 5 ? "bg-brand-warn" : "bg-brand-success")} />
                  <span className={outOfStock ? "text-brand-error" : stockEnforced && availability.totalAvailable <= 5 ? "text-brand-warn" : "text-brand-success"}>
                    {outOfStock
                      ? "Currently out of stock"
                      : stockEnforced && availability.totalAvailable <= 5
                        ? `Only ${availability.totalAvailable} available`
                        : stockEnforced
                          ? "In stock and ready to order"
                          : "Available to order"}
                  </span>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <QuantityStepper value={quantity} onChange={setQuantity} max={stockEnforced ? Math.max(1, availability.totalAvailable) : 99} />
              <Button onClick={handleAddToCart} disabled={!canPurchase} className="flex-1">Buy Now</Button>
            </div>
            <Button variant="secondary" onClick={handleAddToCart} disabled={!canPurchase} className="mt-3 w-full">
              <ShoppingBag size={17} /> Add to cart
            </Button>

            <div className="mt-6 grid gap-3 border-t border-hairline-soft pt-5 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <ShieldCheck size={18} className="mt-0.5 flex-none text-brand-accent" />
                <div>
                  <p className="text-xs font-semibold text-ink">Secure checkout</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted">Protected payment experience</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <PackageCheck size={18} className="mt-0.5 flex-none text-brand-accent" />
                <div>
                  <p className="text-xs font-semibold text-ink">Order support</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted">Help before and after purchase</p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-12 overflow-hidden rounded-lg border border-hairline bg-surface shadow-[var(--shadow-card)] sm:mt-16">
          <div className="border-b border-hairline-soft px-5 py-6 sm:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">Made for everyday living</p>
            <h2 className="font-display mt-2 text-2xl text-ink sm:text-3xl">Product information</h2>
          </div>
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="px-5 py-7 sm:px-8 sm:py-9 lg:border-r lg:border-hairline-soft">
              <h3 className="text-sm font-semibold text-ink">Overview</h3>
              <p className="mt-3 max-w-xl text-sm leading-7 text-steel">
                {(product.LongDescription as string) || (product.ShortDescription as string) || "Product details will be available soon."}
              </p>
              <div className="mt-7 flex items-center gap-3 rounded-md bg-surface-soft px-4 py-3 text-xs text-steel">
                <BadgeCheck size={18} className="flex-none text-brand-accent" />
                Carefully selected for quality, function, and lasting appeal.
              </div>
            </div>
            <div className="px-5 py-7 sm:px-8 sm:py-9">
              <h3 className="text-sm font-semibold text-ink">Specifications</h3>
              {detailAttributes.length > 0 || materialAttributes.length > 0 || dimensions ? (
                <dl className="mt-3 divide-y divide-hairline-soft">
                  {[...detailAttributes, ...materialAttributes].map((attribute) => (
                    <div key={`${attribute.Code ?? attribute.Name}-${attribute.Value}`} className="grid grid-cols-[minmax(110px,0.75fr)_1.25fr] gap-4 py-3 text-sm">
                      <dt className="text-muted">{attribute.Name || attribute.Code}</dt>
                      <dd className="text-right font-medium text-ink">{attribute.Value}</dd>
                    </div>
                  ))}
                  {typeof dimensions?.Length === "number" && (
                    <div className="grid grid-cols-[minmax(110px,0.75fr)_1.25fr] gap-4 py-3 text-sm">
                      <dt className="text-muted">Length</dt>
                      <dd className="text-right font-medium text-ink">{dimensions.Length} {dimensions.DimensionUnit || "mm"}</dd>
                    </div>
                  )}
                  {typeof dimensions?.Width === "number" && (
                    <div className="grid grid-cols-[minmax(110px,0.75fr)_1.25fr] gap-4 py-3 text-sm">
                      <dt className="text-muted">Width</dt>
                      <dd className="text-right font-medium text-ink">{dimensions.Width} {dimensions.DimensionUnit || "mm"}</dd>
                    </div>
                  )}
                  {typeof dimensions?.Height === "number" && (
                    <div className="grid grid-cols-[minmax(110px,0.75fr)_1.25fr] gap-4 py-3 text-sm">
                      <dt className="text-muted">Height</dt>
                      <dd className="text-right font-medium text-ink">{dimensions.Height} {dimensions.DimensionUnit || "mm"}</dd>
                    </div>
                  )}
                  {typeof dimensions?.Weight === "number" && (
                    <div className="grid grid-cols-[minmax(110px,0.75fr)_1.25fr] gap-4 py-3 text-sm">
                      <dt className="text-muted">Weight</dt>
                      <dd className="text-right font-medium text-ink">{dimensions.Weight} {dimensions.WeightUnit || "kg"}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-3 text-sm text-muted">Additional specifications will be available soon.</p>
              )}
            </div>
          </div>
        </section>

        <section aria-label="Shopping services" className="mt-8 grid grid-cols-1 overflow-hidden rounded-lg bg-surface-dark text-on-dark sm:grid-cols-3">
          <div className="border-white/10 p-6 sm:border-r lg:p-7">
            <RotateCcw size={20} strokeWidth={1.5} className="text-brand-accent" />
            <p className="mt-3 text-sm font-semibold">Returns &amp; refunds</p>
            <p className="mt-1 text-xs leading-5 text-on-dark/65">Review eligibility and return guidance before ordering.</p>
          </div>
          <div className="border-t border-white/10 p-6 sm:border-r sm:border-t-0 lg:p-7">
            <Truck size={20} strokeWidth={1.5} className="text-brand-accent" />
            <p className="mt-3 text-sm font-semibold">Delivery options</p>
            <p className="mt-1 text-xs leading-5 text-on-dark/65">See the delivery options available during checkout.</p>
          </div>
          <div className="border-t border-white/10 p-6 sm:border-t-0 lg:p-7">
            <Headphones size={20} strokeWidth={1.5} className="text-brand-accent" />
            <p className="mt-3 text-sm font-semibold">Customer care</p>
            <p className="mt-1 text-xs leading-5 text-on-dark/65">Get help with product questions and existing orders.</p>
          </div>
        </section>

        {product ? <ProductReviews productId={itemId(product)} variantId={selectedVariant ? itemId(selectedVariant) : undefined} /> : null}

        <ProductRail
          eyebrow="Complete the room"
          title={categoryName ? `More in ${categoryName}` : "More like this"}
          description="Explore complementary pieces selected from the same collection."
          items={toRailItems(moreLikeThis, moreLikeThisPlaceholders)}
        />

        <PaymentPartnersBar />

        {/* Real view history now, from this browser's own localStorage — not a claim about
            what other customers did. Renders nothing on a first visit, which is correct. */}
        <ProductRail
          eyebrow="Continue exploring"
          title="Recently viewed"
          description="Return to products you explored earlier on this device."
          items={toRailItems(recentlyViewed, recentPlaceholders)}
        />
      </main>
      <StorefrontFooter />
    </div>
  );
}
