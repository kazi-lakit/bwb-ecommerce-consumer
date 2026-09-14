import { blocksClient } from "./client";
import { blocksDataCall } from "./http";

export const STOREFRONT_CONTENT_LIVE = import.meta.env.VITE_STOREFRONT_CONTENT_LIVE === "true";
export const HOME_HERO_KEY = "home-primary";

export interface StorefrontHeroContent {
  ItemId?: string;
  PlacementKey: string;
  Status: "draft" | "published";
  Eyebrow: string;
  Heading: string;
  Description: string;
  PrimaryCtaLabel: string;
  PrimaryCtaHref: string;
  SecondaryCtaLabel: string;
  SecondaryCtaHref: string;
  ImageUrl: string;
  ImageFileId: string;
  ImageAltText: string;
  HighlightOne: string;
  HighlightTwo: string;
  HighlightThree: string;
}

export const DEFAULT_STOREFRONT_HERO: StorefrontHeroContent = {
  PlacementKey: HOME_HERO_KEY,
  Status: "published",
  Eyebrow: `Autumn collection · ${new Date().getFullYear()}`,
  Heading: "Considered pieces for modern living.",
  Description: "Furniture and objects selected for enduring quality, thoughtful function, and a home that feels distinctly yours.",
  PrimaryCtaLabel: "Shop the collection",
  PrimaryCtaHref: "/products",
  SecondaryCtaLabel: "Explore all pieces",
  SecondaryCtaHref: "/products",
  ImageUrl: "",
  ImageFileId: "",
  ImageAltText: "A considered collection of modern furniture and objects",
  HighlightOne: "Curated collections",
  HighlightTwo: "Secure account",
  HighlightThree: "Thoughtful delivery",
};

const GET_PUBLISHED_HOME_HERO = `query getStorefrontHeros($where: StorefrontHeroFilterInput) {
  getStorefrontHeros(where: $where, paging: { pageNo: 1, pageSize: 1 }) {
    items {
      ItemId PlacementKey Status Eyebrow Heading Description
      PrimaryCtaLabel PrimaryCtaHref SecondaryCtaLabel SecondaryCtaHref
      ImageUrl ImageFileId ImageAltText HighlightOne HighlightTwo HighlightThree
    }
  }
}`;

export async function getPublishedHomeHero(): Promise<StorefrontHeroContent | null> {
  if (!STOREFRONT_CONTENT_LIVE) return null;
  const response = await blocksDataCall(() =>
    blocksClient.data.graphql({
      operationName: "getStorefrontHeros",
      query: GET_PUBLISHED_HOME_HERO,
      variables: { where: { PlacementKey: { eq: HOME_HERO_KEY }, Status: { eq: "published" } } },
    })
  );
  const root = response as Record<string, unknown> | undefined;
  const data = (root?.data ?? root) as Record<string, unknown> | undefined;
  const result = data?.getStorefrontHeros as { items?: StorefrontHeroContent[] } | undefined;
  return result?.items?.[0] ?? null;
}
