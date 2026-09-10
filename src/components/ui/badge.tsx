import { HTMLAttributes } from "react";
import clsx from "clsx";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-sm bg-brand-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink",
        className
      )}
      {...props}
    />
  );
}
