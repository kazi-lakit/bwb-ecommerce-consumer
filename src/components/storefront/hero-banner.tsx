import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function HeroBanner() {
  return (
    <section
      className="relative isolate min-h-[520px] overflow-hidden rounded-lg bg-cover bg-center px-6 py-16 shadow-[var(--shadow-card)] sm:px-12 sm:py-20 lg:flex lg:min-h-[590px] lg:items-center lg:px-16"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(12,10,9,0.94) 0%, rgba(28,25,23,0.82) 43%, rgba(28,25,23,0.18) 74%), url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1200 600%22%3E%3Crect width=%221200%22 height=%22600%22 fill=%22%233c3835%22/%3E%3Crect x=%22665%22 y=%22285%22 width=%22335%22 height=%22240%22 rx=%2236%22 fill=%22%23b54a1f%22/%3E%3Crect x=%22910%22 y=%2285%22 width=%22235%22 height=%22345%22 rx=%2238%22 fill=%22%234d7025%22/%3E%3Ccircle cx=%22755%22 cy=%22130%22 r=%22135%22 fill=%22%23e8e5df%22/%3E%3C/svg%3E')",
      }}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,rgba(249,115,22,0.18),transparent_28%)]" />
      <div className="relative max-w-xl">
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-on-dark/90 backdrop-blur-sm">
          Autumn collection · {new Date().getFullYear()}
        </span>
        <h1 className="mt-6 max-w-xl font-display text-4xl leading-[1.02] text-on-dark sm:text-[58px] lg:text-[68px]">
          Considered pieces for modern living.
        </h1>
        <p className="mt-6 max-w-md text-sm leading-6 text-on-dark/70 sm:text-base sm:leading-7">
          Furniture and objects selected for enduring quality, thoughtful function, and a home that feels distinctly yours.
        </p>
        <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link to="/products">
            <Button className="min-w-44">
              Shop the collection <ArrowRight size={16} />
            </Button>
          </Link>
          <Link
            to="/products"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-on-dark transition-colors hover:bg-white/10"
          >
            Explore all pieces
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-on-dark/55">
          <span>Curated collections</span>
          <span className="h-1 w-1 rounded-full bg-brand-accent" />
          <span>Secure account</span>
          <span className="h-1 w-1 rounded-full bg-brand-accent" />
          <span>Thoughtful delivery</span>
        </div>
      </div>
    </section>
  );
}
