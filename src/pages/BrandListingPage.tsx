import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useEntityList } from "@/lib/blocks/hooks";
import type { EntityRecord } from "@/lib/blocks/collections";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { Spinner } from "@/components/ui/spinner";
import { usePageMeta } from "@/lib/seo";

function itemId(record: EntityRecord): string {
  return (record.ItemId ?? record.itemId) as string;
}

/**
 * The `Brand` schema has existed and been fully manageable in the backoffice since the start,
 * with no storefront surface at all — products showed a brand's products only by accident of
 * search. This is that surface.
 */
export default function BrandListingPage() {
  usePageMeta({
    title: "Brands — Logoipsum",
    description: "Every brand we stock, in one place.",
    canonicalPath: "/brands",
  });
  const brands = useEntityList("Brand", { pageNo: 1, pageSize: 100 });

  // Inactive brands stay out of the storefront. The field is optional, so anything without an
  // explicit status is treated as visible rather than hidden — a brand nobody has set a status
  // on should still show, and hiding it would look like data loss.
  const visible = useMemo(
    () => (brands.data?.items ?? []).filter((b) => (b.Status as string | undefined) !== "inactive"),
    [brands.data]
  );

  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="font-display mb-1 text-[28px] text-ink">Brands</h1>
        <p className="mb-6 text-sm text-muted">Everyone we stock.</p>

        {brands.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-6 w-6" />
          </div>
        ) : visible.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">No brands to show yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((brand) => {
              const name = (brand.Name as string) || "Untitled brand";
              const slug = (brand.Slug as string) || itemId(brand);
              return (
                <Link
                  key={itemId(brand)}
                  to={`/brand/${slug}`}
                  className="group rounded-md border border-hairline p-4 transition-colors hover:border-brand-accent"
                >
                  <div className="mb-3 flex h-20 items-center justify-center overflow-hidden rounded bg-surface">
                    {brand.LogoUrl ? (
                      <img
                        src={brand.LogoUrl as string}
                        alt={name}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="font-display text-lg text-muted">{name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-ink">{name}</p>
                  {brand.Description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{brand.Description as string}</p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <StorefrontFooter />
    </div>
  );
}
