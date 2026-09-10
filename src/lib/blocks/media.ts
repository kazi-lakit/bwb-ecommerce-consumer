import type { EntityRecord } from "./collections";

interface MediaItem {
  Url?: string;
  AltText?: string;
  IsPrimary?: boolean;
  Type?: string;
}

/** The primary (or first) image in a Product's `Media` array, if it has one. */
export function getPrimaryImage(record: EntityRecord): MediaItem | undefined {
  const media = record.Media;
  if (!Array.isArray(media)) return undefined;
  const items = media as MediaItem[];
  const withUrl = items.filter((m) => typeof m.Url === "string" && m.Url.length > 0);
  return withUrl.find((m) => m.IsPrimary && m.Type === "image") ?? withUrl.find((m) => m.Type === "image") ?? withUrl[0];
}
