import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function HeroBanner() {
  return (
    <section
      className="relative overflow-hidden rounded-md bg-cover bg-center px-6 py-24 sm:px-14 sm:py-32"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(14,28,44,0.8) 0%, rgba(14,28,44,0.55) 40%, rgba(14,28,44,0.15) 65%), url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 800 400%22%3E%3Crect width=%22800%22 height=%22400%22 fill=%22%232a3a52%22/%3E%3Crect x=%22460%22 y=%22160%22 width=%22200%22 height=%22140%22 rx=%2212%22 fill=%22%23d49a8b%22/%3E%3Crect x=%22600%22 y=%2260%22 width=%22150%22 height=%22200%22 rx=%2212%22 fill=%22%23e9b461%22/%3E%3Ccircle cx=%22500%22 cy=%2270%22 r=%2270%22 fill=%22%23ece2cf%22/%3E%3C/svg%3E')",
      }}
    >
      <div className="relative max-w-lg">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-on-dark/85">New Collection</p>
        <h1 className="font-display mt-3 text-4xl text-on-dark sm:text-[56px] sm:leading-[1.05]">
          Decorate your Space with Us
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs tracking-[0.03em] text-on-dark/85">
          <span>Order</span>
          <span className="h-1 w-1 rounded-full bg-on-dark/60" />
          <span>Door Bell</span>
          <span className="h-1 w-1 rounded-full bg-on-dark/60" />
          <span>Space Solved</span>
        </div>
        <Link
          to="/products"
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-sm bg-canvas px-7 text-xs font-medium uppercase tracking-[0.06em] text-ink transition-transform hover:scale-[1.02]"
        >
          Buy Now <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
