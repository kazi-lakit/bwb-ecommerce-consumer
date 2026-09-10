import clsx from "clsx";

export interface TabOption {
  key: string;
  label: string;
}

export interface TabListProps {
  tabs: TabOption[];
  active: string;
  onChange: (key: string) => void;
}

/** A row of tab buttons — same active/inactive treatment as the sidebar's nav links. */
export function TabList({ tabs, active, onChange }: TabListProps) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === active}
          onClick={() => onChange(tab.key)}
          className={clsx(
            "rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
            tab.key === active ? "bg-brand-accent-soft text-brand-accent" : "text-steel hover:bg-surface hover:text-ink"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
