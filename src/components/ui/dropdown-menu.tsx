import { useEffect, useRef, useState, type ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";
import clsx from "clsx";
import type { LucideProps } from "lucide-react";

export interface DropdownMenuItem {
  label: string;
  icon?: ComponentType<LucideProps>;
  onClick: () => void;
  danger?: boolean;
}

/** A small, dependency-free kebab menu — used for per-row actions in admin tables. */
export function DropdownMenu({ items, label = "Row actions" }: { items: DropdownMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-steel hover:bg-surface hover:text-ink"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-hairline bg-canvas py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={clsx(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface",
                item.danger ? "text-brand-error" : "text-ink"
              )}
            >
              {item.icon && <item.icon size={14} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
