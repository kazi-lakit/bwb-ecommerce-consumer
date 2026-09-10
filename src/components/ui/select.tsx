import { SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/**
 * A native <select>, but styled to match Input exactly (same height/padding/focus
 * treatment) instead of the browser default — `appearance-none` + a manual chevron so
 * it renders identically (and without a stray native focus ring) across browsers.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={clsx(
          "h-[52px] w-full appearance-none rounded-sm border border-hairline bg-surface pl-4 pr-9 text-sm text-ink",
          "outline-none transition-colors focus:border-ink",
          "disabled:opacity-50",
          className
        )}
        {...props}
      />
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  )
);
Select.displayName = "Select";
