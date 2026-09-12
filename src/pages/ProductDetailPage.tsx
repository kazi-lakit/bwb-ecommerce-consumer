import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronRight, Heart, Share2, Truck, RotateCcw, Headphones } from "lucide-react";
import clsx from "clsx";
import { useEntityList } from "@/lib/blocks/hooks";
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

  const productList = useEntityList("Product", { where: { Slug: { eq: slug } }, pageSize: 1 }, Boolean(slug));
  const product = productList.data?.items[0];
  const productId = product ? itemId(product) : undefined;

  const variantList = useEntityList(
    "ProductVariant",
    { where: { ProductId: { eq: productId } }, pageSize: 50 },
    Boolean(productId)
  );
  const variants = variantList.data?.items ?? [];

  const categories = useEntityList("Category", { pageNo: 1, pageSize: 100 });
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
  const perfectMatch = product ? relatedItems.filter((p) => itemId(p) !== itemId(product)).slice(0, 5) : [];
  const alsoViewed = product ? relatedItems.filter((p) => itemId(p) !== itemId(product)).slice(5, 10) : [];
  const perfectMatchPlaceholders = useMemo(() => assignPlaceholders(perfectMatch, theme), [perfectMatch, theme]);
  const alsoViewedPlaceholders = useMemo(() => assignPlaceholders(alsoViewed, theme), [alsoViewed, theme]);

  if (productList.isLoading) {
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <div className="flex justify-center py-24">
          <Spinner className="h-6 w-6" />
        </div>
      </div>
    );
  }

  if (!slug) return <Navigate to="/" replace />;

  if (!product) {
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <div className="mx-auto max-w-3xl p-6 text-center">
          <p className="py-16 text-sm text-muted">This product doesn't exist, or isn't available anymore.</p>
          <Link to="/" className="text-sm font-medium text-brand-accent hover:underline">
            Back to catalog
          </Link>
        </div>
        <StorefrontFooter />
      </div>
    );
  }

  const media = (Array.isArray(product.Media) ? (product.Media as MediaItem[]) : []).filter((m) => m.Url);
  const primary = getPrimaryImage(product);
  const mainImage = activeImage ?? primary?.Url ?? null;
  const attributes = Array.isArray(product.Attributes) ? (product.Attributes as AttributeItem[]) : [];
  const materialAttributes = attributes.filter((a) => /material/i.test(a.Code ?? "") || /material/i.test(a.Name ?? ""));
  const detailAttributes = attributes.filter((a) => !materialAttributes.includes(a));
  const dimensions = selectedVariant?.Dimensions as Dimensions | undefined;
  const name = (product.Name as string) || "Untitled product";
  const wishlisted = has(itemId(product));

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

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <nav className="mb-5 flex items-center gap-1.5 text-xs text-muted">
          <Link to="/" className="hover:text-ink">
            Home
          </Link>
          <ChevronRight size={12} />
          <Link to="/products" className="hover:text-ink">
            Furniture
          </Link>
          {categoryName && (
            <>
              <ChevronRight size={12} />
              <span>{categoryName}</span>
            </>
          )}
          <ChevronRight size={12} />
          <span className="text-ink">{name}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <div className="aspect-square overflow-hidden rounded-md bg-surface">
              <ImageWithFallback
                src={mainImage}
                fallback={placeholder}
                alt={primary?.AltText || name}
                className="h-full w-full object-cover"
              />
            </div>
            {media.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {media.map((m) => (
                  <button
                    key={m.MediaId ?? m.Url}
                    onClick={() => setActiveImage(m.Url ?? null)}
                    className="h-16 w-16 flex-none overflow-hidden rounded-md border border-hairline bg-surface"
                  >
                    <ImageWithFallback src={m.Url} fallback={placeholder} alt={m.AltText || name} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                {selectedVariant?.Sku ? <p className="text-xs font-medium text-muted">{selectedVariant.Sku as string}</p> : null}
                <h1 className="font-display mt-1 text-[28px] text-ink">{name}</h1>
                {brand ? (
                  <Link
                    to={`/brand/${(brand.Slug as string) || ((brand.ItemId ?? brand.itemId) as string)}`}
                    className="mt-1 inline-block text-sm text-brand-accent hover:underline"
                  >
                    {brand.Name as string}
                  </Link>
                ) : null}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                  onClick={() => toggle(itemId(product))}
                  className={clsx(
                    "flex h-9 w-9 items-center justify-center rounded-full border border-hairline",
                    wishlisted ? "text-brand-error" : "text-steel hover:text-brand-error"
                  )}
                >
                  <Heart size={16} fill={wishlisted ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  aria-label="Share"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-steel hover:text-ink"
                  onClick={() => {
                    void navigator.clipboard?.writeText(window.location.href);
                    toast.success("Link copied to clipboard.");
                  }}
                >
                  <Share2 size={15} />
                </button>
              </div>
            </div>

            {variantList.isLoading ? (
              <Spinner className="h-5 w-5" />
            ) : price ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl text-ink">{formatMoney(price.current, price.currency)}</span>
                {price.original && <span className="text-sm text-muted line-through">{formatMoney(price.original, price.currency)}</span>}
              </div>
            ) : null}

            {colorOptions.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
                  Color: {colorOptions.find((o) => o.variantId === (selectedVariant ? itemId(selectedVariant) : undefined))?.value ?? ""}
                </p>
                <div className="flex flex-wrap gap-3">
                  {colorOptions.map((option) => (
                    <button
                      key={option.variantId}
                      type="button"
                      onClick={() => setSelectedVariantId(option.variantId)}
                      aria-label={option.value}
                      className={clsx(
                        "h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-canvas transition-transform",
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

            {product.ShortDescription ? <p className="text-sm text-steel">{product.ShortDescription as string}</p> : null}

            {stockEnforced && !availability.isLoading && (
              <p className={clsx("text-xs font-medium", outOfStock ? "text-brand-error" : availability.totalAvailable <= 5 ? "text-brand-warn" : "text-brand-success")}>
                {outOfStock
                  ? "Out of stock"
                  : availability.totalAvailable <= 5
                    ? `Only ${availability.totalAvailable} left in stock`
                    : "In stock"}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                max={stockEnforced ? Math.max(1, availability.totalAvailable) : 99}
              />
              <Button variant="secondary" onClick={handleAddToCart} disabled={outOfStock}>
                Add to Cart
              </Button>
              <Button onClick={handleAddToCart} disabled={outOfStock}>
                Buy Now
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 border-t border-hairline-soft pt-8 sm:grid-cols-3">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Product Details</h2>
            <p className="text-sm text-steel">{(product.LongDescription as string) || (product.ShortDescription as string) || "—"}</p>
            {detailAttributes.length > 0 && (
              <dl className="mt-3 space-y-1 text-sm">
                {detailAttributes.map((a) => (
                  <div key={a.Code} className="flex justify-between gap-2">
                    <dt className="text-muted">{a.Name || a.Code}</dt>
                    <dd className="text-ink">{a.Value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Materials</h2>
            {materialAttributes.length > 0 ? (
              <dl className="space-y-1 text-sm">
                {materialAttributes.map((a) => (
                  <div key={a.Code} className="flex justify-between gap-2">
                    <dt className="text-muted">{a.Name || a.Code}</dt>
                    <dd className="text-ink">{a.Value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">—</p>
            )}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Dimensions</h2>
            {dimensions ? (
              <dl className="space-y-1 text-sm">
                {typeof dimensions.Length === "number" && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Length</dt>
                    <dd className="text-ink">
                      {dimensions.Length} {dimensions.DimensionUnit || "mm"}
                    </dd>
                  </div>
                )}
                {typeof dimensions.Width === "number" && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Width</dt>
                    <dd className="text-ink">
                      {dimensions.Width} {dimensions.DimensionUnit || "mm"}
                    </dd>
                  </div>
                )}
                {typeof dimensions.Height === "number" && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Height</dt>
                    <dd className="text-ink">
                      {dimensions.Height} {dimensions.DimensionUnit || "mm"}
                    </dd>
                  </div>
                )}
                {typeof dimensions.Weight === "number" && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Weight</dt>
                    <dd className="text-ink">
                      {dimensions.Weight} {dimensions.WeightUnit || "kg"}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted">—</p>
            )}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 rounded-md bg-surface-soft p-6 sm:grid-cols-3">
          <div>
            <RotateCcw size={18} strokeWidth={1.5} className="text-ink" />
            <p className="mt-2 text-sm font-medium text-ink">Return &amp; Refund Policy</p>
            <p className="mt-1 text-xs text-muted">Read our return policy for eligible items.</p>
          </div>
          <div>
            <Truck size={18} strokeWidth={1.5} className="text-ink" />
            <p className="mt-2 text-sm font-medium text-ink">Delivery &amp; Assembling</p>
            <p className="mt-1 text-xs text-muted">Doorstep delivery or local pickup, your choice.</p>
          </div>
          <div>
            <Headphones size={18} strokeWidth={1.5} className="text-ink" />
            <p className="mt-2 text-sm font-medium text-ink">Contact Customer Care</p>
            <p className="mt-1 text-xs text-muted">We're here to help before and after you buy.</p>
          </div>
        </div>

        <ProductRail title="Perfect Match with Your Furniture" items={toRailItems(perfectMatch, perfectMatchPlaceholders)} />

        <PaymentPartnersBar />

        <ProductRail title="Customer also Viewed these items" items={toRailItems(alsoViewed, alsoViewedPlaceholders)} />
      </main>
      <StorefrontFooter />
    </div>
  );
}
