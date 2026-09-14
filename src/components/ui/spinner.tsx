import { useId } from "react";
import clsx from "clsx";

export function Spinner({ className }: { className?: string }) {
  const instanceId = useId().replace(/:/g, "");
  const dotMaskId = `cartio-dot-${instanceId}`;
  const lowerMaskId = `cartio-lower-${instanceId}`;
  const upperMaskId = `cartio-upper-${instanceId}`;

  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        "cartio-loader inline-grid h-4 w-4 flex-none place-items-center",
        className
      )}
    >
      <svg
        viewBox="0 0 173 173"
        aria-hidden="true"
        className="cartio-loader__svg h-full w-full overflow-visible"
      >
        <defs>
          <mask id={dotMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="173" height="173">
            <g transform="translate(-14 -14) scale(.392)">
              <circle className="cartio-loader__dot" cx="417" cy="274" r="58" fill="white" />
            </g>
          </mask>
          <mask id={lowerMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="173" height="173">
            <path
              className="cartio-loader__lower"
              pathLength="1"
              d="M417 292 C407 342 369 391 316 423 C249 463 163 451 104 401 C59 363 43 304 66 267 C81 242 101 233 119 243 C139 254 144 279 158 306"
              fill="none"
              stroke="white"
              strokeWidth="210"
              strokeLinecap="round"
              strokeLinejoin="round"
              transform="translate(-14 -14) scale(.392)"
            />
          </mask>
          <mask id={upperMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="173" height="173">
            <path
              className="cartio-loader__upper"
              pathLength="1"
              d="M55 238 C85 132 180 74 282 85 C371 95 428 151 422 210 C419 239 410 258 417 274"
              fill="none"
              stroke="white"
              strokeWidth="210"
              strokeLinecap="round"
              strokeLinejoin="round"
              transform="translate(-14 -14) scale(.392)"
            />
          </mask>
        </defs>
        <use
          href="/cartio-logo.svg#cartio-icon-dot"
          fill="var(--color-brand-accent)"
          mask={`url(#${dotMaskId})`}
        />
        <use
          href="/cartio-logo.svg#cartio-icon-lower"
          fill="var(--color-ink)"
          mask={`url(#${lowerMaskId})`}
        />
        <use
          href="/cartio-logo.svg#cartio-icon-upper"
          fill="var(--color-ink)"
          mask={`url(#${upperMaskId})`}
        />
      </svg>
    </span>
  );
}
