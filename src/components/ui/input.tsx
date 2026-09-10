import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        "h-[52px] w-full rounded-sm border border-hairline bg-surface px-4 text-sm text-ink placeholder:text-muted",
        "outline-none transition-colors focus:border-ink",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
