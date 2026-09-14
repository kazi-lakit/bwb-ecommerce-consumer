import { Link } from "react-router-dom";

export interface FilterLinkItem {
  id: string;
  label: string;
}

/**
 * A sidebar filter section of navigational links — unlike `CheckboxFilterGroup` (an in-memory
 * multi-select toggle array), each item here is a real URL that sets one search param via the
 * gateway `where` clause (`CategoryIds`/`BrandId`), so only one can be active at a time and the
 * selection survives a reload/share. `href` is built by the caller (via `hrefFor`) so it can
 * preserve whichever other search params are already set rather than overwriting them.
 */
export function FilterLinkList({
  title,
  items,
  activeId,
  hrefFor,
}: {
  title: string;
  items: FilterLinkItem[];
  activeId: string;
  hrefFor: (id: string) => string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="border-b border-hairline-soft py-4">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            to={hrefFor(item.id)}
            className={
              item.id === activeId
                ? "block truncate text-sm font-medium text-brand-accent"
                : "block truncate text-sm text-steel hover:text-ink"
            }
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
