import { TextareaHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        "w-full rounded-md border border-hairline bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-muted",
        "outline-none transition-shadow focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
