"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export interface DrawerProps {
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A right-side slide-over panel — the standard pattern for a create/edit form that's
 * too long to feel right in a small centered dialog (see ConfirmDialog/Modal for that
 * case instead). Header and footer stay fixed; only the field area in between scrolls,
 * so the Cancel/Save buttons are never lost while filling out a long form.
 */
export function Drawer({ onClose, title, description, children, className }: DrawerProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-overlay backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={clsx("flex h-full w-full flex-col bg-canvas shadow-2xl sm:max-w-2xl", className)}
      >
        <div className="flex flex-none items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div>
            <h2 id="drawer-title" className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-steel hover:bg-surface hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
