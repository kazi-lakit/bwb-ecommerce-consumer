import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/**
 * A pill-shaped toggle button — the app's one control for checkbox/radio-style
 * choices (a single on/off toggle, or one option in a multi-select group), used
 * instead of a native checkbox/radio input. Selected state is shown by fill + a check
 * mark, never color alone.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(({ selected, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-pressed={selected}
    className={clsx(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
      "outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1",
      selected
        ? "border-brand-accent bg-brand-accent text-on-dark"
        : "border-hairline bg-canvas text-steel hover:bg-surface hover:text-ink",
      className
    )}
    {...props}
  >
    {selected && <Check size={13} className="flex-none" aria-hidden="true" />}
    {children}
  </button>
));
Chip.displayName = "Chip";
