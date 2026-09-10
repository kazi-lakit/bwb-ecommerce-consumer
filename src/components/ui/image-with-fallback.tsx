import { useEffect, useState } from "react";

export interface ImageWithFallbackProps {
  /** The real photo URL, if any — may be empty/undefined, or present but dead (404, unreachable). */
  src?: string | null;
  /** Shown immediately when there's no `src`, or swapped in the moment `src` fails to load. */
  fallback: string;
  alt: string;
  className?: string;
}

/** An `<img>` that falls back to an abstract placeholder both when there's no real photo and when the real one fails to load. */
export function ImageWithFallback({ src, fallback, alt, className }: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);
  // A different `src` (e.g. picking another thumbnail) deserves its own fresh attempt.
  useEffect(() => setFailed(false), [src]);

  return <img src={src && !failed ? src : fallback} alt={alt} className={className} onError={() => setFailed(true)} />;
}
