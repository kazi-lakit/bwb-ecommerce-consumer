export function PriceRangeSlider({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}) {
  const [low, high] = value;

  if (max <= min) {
    return (
      <div className="flex items-center justify-between rounded-sm bg-surface-soft px-3 py-2 text-xs text-steel">
        <span>Current price</span>
        <span className="font-semibold text-ink">${min}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-hairline" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-accent"
          style={{
            left: `${((low - min) / (max - min)) * 100}%`,
            right: `${100 - ((high - min) / (max - min)) * 100}%`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={low}
          onChange={(event) => onChange([Math.min(Number(event.target.value), high - 1), high])}
          className="pointer-events-none absolute inset-0 z-20 h-5 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-brand-accent [&::-moz-range-thumb]:bg-canvas [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-accent [&::-webkit-slider-thumb]:bg-canvas [&::-webkit-slider-thumb]:shadow-sm"
          aria-label="Minimum price"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={high}
          onChange={(event) => onChange([low, Math.max(Number(event.target.value), low + 1)])}
          className="pointer-events-none absolute inset-0 z-10 h-5 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-brand-accent [&::-moz-range-thumb]:bg-canvas [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-accent [&::-webkit-slider-thumb]:bg-canvas [&::-webkit-slider-thumb]:shadow-sm"
          aria-label="Maximum price"
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-steel">
        <span className="rounded-sm bg-surface-soft px-2 py-1 font-medium text-ink">${low}</span>
        <span className="rounded-sm bg-surface-soft px-2 py-1 font-medium text-ink">${high}</span>
      </div>
    </div>
  );
}
