import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: "rounded-sm bg-brand-accent text-on-primary hover:bg-brand-accent-deep disabled:bg-hairline disabled:text-muted",
  accent: "rounded-sm bg-brand-accent text-on-primary hover:bg-brand-accent-deep",
  secondary: "rounded-sm border border-border-strong bg-transparent text-ink hover:bg-surface-soft",
  ghost: "rounded-sm bg-transparent text-ink hover:underline",
  danger: "rounded-sm border border-brand-error/30 bg-brand-error/10 text-brand-error hover:bg-brand-error/15",
};

const sizeClasses: Record<Size, string> = {
  md: "min-h-12 px-7 py-3.5 text-xs uppercase tracking-[0.06em]",
  sm: "min-h-9 px-4 py-1.5 text-[11px] uppercase tracking-[0.06em]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-medium leading-tight transition-colors duration-150 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
