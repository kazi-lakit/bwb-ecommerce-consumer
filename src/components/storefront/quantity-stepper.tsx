import { Minus, Plus } from "lucide-react";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="inline-flex h-12 items-center rounded-sm border border-hairline bg-surface">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-full w-11 items-center justify-center text-steel hover:text-ink disabled:opacity-40"
      >
        <Minus size={14} />
      </button>
      <span className="w-8 text-center text-sm text-ink">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-full w-11 items-center justify-center text-steel hover:text-ink disabled:opacity-40"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
