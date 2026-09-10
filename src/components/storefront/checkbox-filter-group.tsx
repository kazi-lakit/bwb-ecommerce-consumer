export interface FilterOption {
  value: string;
  label: string;
  swatch?: string;
}

export function CheckboxFilterGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  if (options.length === 0) return null;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="border-b border-hairline-soft py-4">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink">{title}</h3>
      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm text-steel">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
              className="h-3.5 w-3.5 rounded border-hairline accent-[var(--color-brand-accent)]"
            />
            {option.swatch && (
              <span
                className="h-3.5 w-3.5 flex-none rounded-full border border-hairline"
                style={{ background: option.swatch }}
              />
            )}
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
