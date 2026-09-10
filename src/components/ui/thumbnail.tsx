import clsx from "clsx";
import { ImageWithFallback } from "./image-with-fallback";

export interface ThumbnailProps {
  src?: string | null;
  fallback: string;
  alt: string;
  size?: "sm" | "md";
  className?: string;
}

/** A small rounded product/entity image, used in tables and cards — always shows something (real photo or its placeholder). */
export function Thumbnail({ src, fallback, alt, size = "sm", className }: ThumbnailProps) {
  return (
    <div
      className={clsx(
        "flex-none overflow-hidden rounded-md bg-surface",
        size === "sm" ? "h-10 w-10" : "h-14 w-14",
        className
      )}
    >
      <ImageWithFallback src={src} fallback={fallback} alt={alt} className="h-full w-full object-cover" />
    </div>
  );
}
