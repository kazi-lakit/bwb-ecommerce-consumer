import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "rounded-full bg-brand-accent text-on-primary shadow-[0_8px_20px_rgba(234,88,12,0.3)] hover:bg-brand-accent-deep hover:-translate-y-0.5 disabled:translate-y-0 disabled:bg-hairline disabled:text-muted disabled:shadow-none",
  accent:
    "rounded-full bg-brand-accent text-on-primary shadow-[0_8px_20px_rgba(234,88,12,0.3)] hover:bg-brand-accent-deep hover:-translate-y-0.5",
  secondary: "rounded-full border border-border-strong bg-transparent text-ink hover:bg-surface-soft",
  ghost: "rounded-full bg-transparent text-ink hover:underline",
  danger: "rounded-full border border-brand-error/30 bg-brand-error/10 text-brand-error hover:bg-brand-error/15",
};

const sizeClasses: Record<Size, string> = {
  md: "min-h-12 px-7 py-3.5 text-sm",
  sm: "min-h-9 px-4 py-1.5 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-semibold leading-tight transition-all duration-300 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
