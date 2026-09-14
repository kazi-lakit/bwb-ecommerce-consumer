import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_STOREFRONT_HERO, getPublishedHomeHero, STOREFRONT_CONTENT_LIVE } from "@/lib/blocks/storefront-content";

const DEFAULT_HERO_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1200 600%22%3E%3Crect width=%221200%22 height=%22600%22 fill=%22%233c3835%22/%3E%3Crect x=%22665%22 y=%22285%22 width=%22335%22 height=%22240%22 rx=%2236%22 fill=%22%23b54a1f%22/%3E%3Crect x=%22910%22 y=%2285%22 width=%22235%22 height=%22345%22 rx=%2238%22 fill=%22%234d7025%22/%3E%3Ccircle cx=%22755%22 cy=%22130%22 r=%22135%22 fill=%22%23e8e5df%22/%3E%3C/svg%3E";

export function HeroBanner() {
  const heroQuery = useQuery({
    queryKey: ["storefront-content", "home-hero"],
    queryFn: getPublishedHomeHero,
    enabled: STOREFRONT_CONTENT_LIVE,
    staleTime: 5 * 60 * 1000,
  });
  const hero = heroQuery.data ?? DEFAULT_STOREFRONT_HERO;
  const highlights = [hero.HighlightOne, hero.HighlightTwo, hero.HighlightThree].filter(Boolean);

  return (
    <section className="relative isolate min-h-[520px] overflow-hidden rounded-lg bg-[#1c1917] px-6 py-16 shadow-[var(--shadow-card)] sm:px-12 sm:py-20 lg:flex lg:min-h-[590px] lg:items-center lg:px-16">
      <img
        src={hero.ImageUrl || DEFAULT_HERO_IMAGE}
        alt={hero.ImageUrl ? hero.ImageAltText : ""}
        aria-hidden={hero.ImageUrl ? undefined : true}
        loading="eager"
        fetchPriority="high"
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(12,10,9,0.95)_0%,rgba(28,25,23,0.84)_43%,rgba(28,25,23,0.20)_74%)]" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,rgba(249,115,22,0.18),transparent_28%)]" />
      <div className="relative max-w-xl">
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-on-dark/90 backdrop-blur-sm">
          {hero.Eyebrow}
        </span>
        <h1 className="mt-6 max-w-xl font-display text-4xl leading-[1.02] text-on-dark sm:text-[58px] lg:text-[68px]">
          {hero.Heading}
        </h1>
        <p className="mt-6 max-w-md text-sm leading-6 text-on-dark/70 sm:text-base sm:leading-7">
          {hero.Description}
        </p>
        <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link
            to={hero.PrimaryCtaHref || "/products"}
            className="inline-flex min-h-12 min-w-44 items-center justify-center gap-2 rounded-full bg-brand-accent px-6 py-3 text-sm font-semibold text-on-dark shadow-[0_8px_22px_rgba(234,88,12,0.28)] transition-colors hover:bg-brand-accent-deep"
          >
            {hero.PrimaryCtaLabel} <ArrowRight size={16} />
          </Link>
          {hero.SecondaryCtaLabel && (
            <Link
              to={hero.SecondaryCtaHref || "/products"}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-on-dark transition-colors hover:bg-white/10"
            >
              {hero.SecondaryCtaLabel}
            </Link>
          )}
        </div>
        {highlights.length > 0 && (
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-on-dark/55">
            {highlights.map((highlight, index) => (
              <span key={`${highlight}-${index}`} className="contents">
                {index > 0 && <span className="h-1 w-1 rounded-full bg-brand-accent" />}
                <span>{highlight}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
