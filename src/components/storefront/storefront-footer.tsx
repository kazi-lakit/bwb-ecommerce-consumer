import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { toast } from "@/lib/toast-store";

const COLUMNS: { title: string; links: string[] }[] = [
  { title: "Shop", links: ["All Products", "New Arrivals", "Best Sellers"] },
  { title: "Learn", links: ["Blog", "Care Guides", "Sustainability"] },
  { title: "Support", links: ["Contact Us", "Shipping & Returns", "FAQ"] },
  { title: "Connect", links: ["Instagram", "Pinterest", "Newsletter"] },
];

export function StorefrontFooter() {
  const [email, setEmail] = useState("");

  function subscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    toast.success("Thanks for subscribing.");
    setEmail("");
  }

  return (
    <footer className="bg-surface-dark text-on-dark">
      <div className="mx-auto grid grid-cols-2 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-5">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-on-dark text-surface-dark">
              <ShoppingBag size={16} strokeWidth={2.2} />
            </div>
            <span className="font-display text-lg text-on-dark">Logoipsum</span>
          </div>
          <p className="mt-3 text-sm text-on-dark/70">Decorate your Space with Us</p>

          <form onSubmit={subscribe} className="mt-6 max-w-xs">
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-on-dark/70">Newsletter</label>
            <div className="mt-2 flex items-end gap-3 border-b border-on-dark/40 pb-2 focus-within:border-on-dark">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="h-8 flex-1 bg-transparent text-sm text-on-dark outline-none placeholder:text-on-dark/40"
              />
              <button type="submit" className="rounded-sm bg-canvas px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink">
                Sign Up
              </button>
            </div>
          </form>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-on-dark/70">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm text-on-dark hover:underline">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-on-dark/10 px-4 py-4 text-center text-xs text-on-dark/50 sm:px-6">
        © {new Date().getFullYear()} Logoipsum. All rights reserved.
      </div>
    </footer>
  );
}
