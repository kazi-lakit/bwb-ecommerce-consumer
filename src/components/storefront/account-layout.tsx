import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { Package, MapPin, User } from "lucide-react";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";

const TABS = [
  { to: "/account/orders", label: "Orders", icon: Package },
  { to: "/account/addresses", label: "Addresses", icon: MapPin },
  { to: "/account/profile", label: "Profile", icon: User },
];

/** Shared chrome for every /account page: header, side nav, footer. */
export function AccountLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <StorefrontHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="font-display mb-6 text-[28px] text-ink">{title}</h1>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
          <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    "flex flex-none items-center gap-2 rounded-md px-3 py-2 text-sm",
                    isActive ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink"
                  )
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <StorefrontFooter />
    </div>
  );
}
