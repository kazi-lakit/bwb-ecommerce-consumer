import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Heart, Search, ShoppingBag, User, ChevronDown, Menu, X } from "lucide-react";
import clsx from "clsx";
import { useEntityList } from "@/lib/blocks/hooks";
import { useAuth } from "@/components/providers/auth-provider";
import { useCart } from "@/components/providers/cart-provider";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { startLogin } from "@/lib/blocks/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const FALLBACK_CATEGORIES = ["Chair", "Table", "Sofa", "Dining", "Bed", "Interior"];

function itemId(record: Record<string, unknown>): string {
  return (record.ItemId ?? record.itemId) as string;
}

export function StorefrontHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { status, user, logout } = useAuth();
  const { count: cartCount } = useCart();
  const { productIds } = useWishlist();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const categories = useEntityList("Category", { pageNo: 1, pageSize: 100 });
  const topCategories = (categories.data?.items ?? [])
    .filter((c) => !c.ParentId)
    .sort((a, b) => String(a.Name).localeCompare(String(b.Name)));

  const activeCategory = searchParams.get("category") ?? "";

  useEffect(() => {
    if (!userMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [userMenuOpen]);

  return (
    <header className="bg-canvas">
      <div className="flex h-9 items-center justify-center bg-surface-dark px-4 text-center">
        <p className="text-[13px] tracking-[0.02em] text-on-dark">Thoughtfully chosen pieces for every room.</p>
      </div>

      <div className="border-b border-hairline">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center text-ink md:hidden"
              aria-label="Menu"
              onClick={() => setMobileNavOpen((o) => !o)}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-accent text-on-primary">
                <ShoppingBag size={16} strokeWidth={2.2} />
              </div>
              <span className="font-display text-lg text-ink">Logoipsum</span>
            </Link>
          </div>

          <nav className="hidden min-w-0 flex-1 flex-wrap items-center justify-center gap-x-5 gap-y-1.5 md:flex">
            {(topCategories.length > 0 ? topCategories.slice(0, 6) : FALLBACK_CATEGORIES.map((name) => ({ Name: name }))).map(
              (c, i) => {
                const id = "ItemId" in c || "itemId" in c ? itemId(c as Record<string, unknown>) : "";
                const name = (c.Name as string).toUpperCase();
                const to = id ? `/products?category=${id}` : `/products?q=${encodeURIComponent(c.Name as string)}`;
                const active = id ? activeCategory === id : false;
                return (
                  <Link
                    key={id || `${name}-${i}`}
                    to={to}
                    className={clsx(
                      "flex-none whitespace-nowrap text-xs font-medium tracking-[0.03em] transition-colors hover:text-ink hover:underline hover:underline-offset-4",
                      active ? "text-ink" : "text-steel"
                    )}
                  >
                    {name}
                  </Link>
                );
              }
            )}
            {/* Last, after the categories: browsing by brand is a secondary way in, and the
                category nav is what most people arrive looking for. */}
            <Link
              to="/brands"
              className={clsx(
                "flex-none whitespace-nowrap text-xs font-medium tracking-[0.03em] transition-colors hover:text-ink hover:underline hover:underline-offset-4",
                location.pathname.startsWith("/brand") ? "text-ink" : "text-steel"
              )}
            >
              BRANDS
            </Link>
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center text-ink hover:text-steel"
              aria-label="Search"
              onClick={() => navigate("/products")}
            >
              <Search size={18} strokeWidth={1.75} />
            </button>
            <Link
              to="/wishlist"
              className="relative flex h-9 w-9 items-center justify-center text-ink hover:text-steel"
              aria-label="Wishlist"
            >
              <Heart size={18} strokeWidth={1.75} />
              {productIds.length > 0 && (
                <span className="absolute right-0 top-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-brand-accent text-[9px] font-semibold text-on-primary">
                  {productIds.length}
                </span>
              )}
            </Link>
            <Link
              to="/cart"
              className="relative flex h-9 w-9 items-center justify-center text-ink hover:text-steel"
              aria-label="Cart"
            >
              <ShoppingBag size={18} strokeWidth={1.75} />
              {cartCount > 0 && (
                <span className="absolute right-0 top-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-brand-accent text-[9px] font-semibold text-on-primary">
                  {cartCount}
                </span>
              )}
            </Link>

            {status === "authenticated" ? (
              <div className="relative ml-1" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-1.5 py-1.5 pl-1.5 pr-1 text-xs font-medium tracking-[0.03em] text-ink"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-accent-soft text-ink">
                    <User size={13} />
                  </span>
                  <span className="hidden sm:inline">{user?.firstName || "Account"}</span>
                  <ChevronDown size={13} className="text-muted" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-sm border border-hairline bg-surface py-1">
                    <Link
                      to="/account/orders"
                      onClick={() => setUserMenuOpen(false)}
                      className="block w-full px-3 py-2 text-left text-xs uppercase tracking-[0.05em] text-ink hover:bg-surface-soft"
                    >
                      Your orders
                    </Link>
                    <Link
                      to="/account/addresses"
                      onClick={() => setUserMenuOpen(false)}
                      className="block w-full px-3 py-2 text-left text-xs uppercase tracking-[0.05em] text-ink hover:bg-surface-soft"
                    >
                      Addresses
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void logout();
                      }}
                      className="block w-full px-3 py-2 text-left text-xs uppercase tracking-[0.05em] text-ink hover:bg-surface-soft"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="ml-1 hidden items-center gap-2 sm:flex">
                <Button size="sm" variant="secondary" onClick={() => void startLogin()}>
                  Log in
                </Button>
                <Button size="sm" onClick={() => void startLogin()}>
                  Create Account
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={clsx(
          "border-b border-hairline-soft bg-surface-soft",
          mobileNavOpen ? "block md:hidden" : "hidden"
        )}
      >
        <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
          {(topCategories.length > 0 ? topCategories : FALLBACK_CATEGORIES.map((name) => ({ Name: name }))).map((c, i) => {
            const id = "ItemId" in c || "itemId" in c ? itemId(c as Record<string, unknown>) : "";
            const name = c.Name as string;
            const to = id ? `/products?category=${id}` : `/products?q=${encodeURIComponent(name)}`;
            return (
              <Link
                key={id || `${name}-${i}`}
                to={to}
                onClick={() => setMobileNavOpen(false)}
                className="py-1.5 text-sm font-medium tracking-[0.02em] text-ink"
              >
                {name.toUpperCase()}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 px-4 py-2 sm:px-6">
        <div className="relative">
          <select
            aria-label="Jump to category"
            value={activeCategory}
            onChange={(e) => navigate(e.target.value ? `/products?category=${e.target.value}` : "/products")}
            className="h-8 appearance-none rounded-sm border border-hairline bg-transparent pl-3 pr-7 text-xs tracking-[0.02em] text-steel outline-none"
          >
            <option value="">All Categories</option>
            {(categories.data?.items ?? [])
              .slice()
              .sort((a, b) => String(a.Name).localeCompare(String(b.Name)))
              .map((c) => (
                <option key={itemId(c)} value={itemId(c)}>
                  {c.Name as string}
                </option>
              ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      </div>
    </header>
  );
}
