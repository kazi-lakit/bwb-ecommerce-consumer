"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import clsx from "clsx";
import { subscribeToasts, toast, type ToastItem, type ToastVariant } from "@/lib/toast-store";

const ICONS: Record<ToastVariant, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  error: "border-brand-error/30",
  success: "border-brand-accent/40",
  info: "border-hairline",
};

const ICON_CLASSES: Record<ToastVariant, string> = {
  error: "text-brand-error",
  success: "text-brand-accent-deep",
  info: "text-steel",
};

/** Mounted once, app-wide — see Providers. Renders whatever toast.error/success/info pushed. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {items.map((item) => {
        const Icon = ICONS[item.variant];
        return (
          <div
            key={item.id}
            role="alert"
            className={clsx(
              "pointer-events-auto flex items-start gap-2.5 rounded-md border bg-canvas p-3.5 shadow-lg",
              VARIANT_CLASSES[item.variant]
            )}
          >
            <Icon size={18} className={clsx("mt-0.5 shrink-0", ICON_CLASSES[item.variant])} />
            <p className="flex-1 text-sm text-ink">{item.message}</p>
            <button
              onClick={() => toast.dismiss(item.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded-sm p-0.5 text-muted hover:bg-surface hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
