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

  return (
    <div>
      <div className="relative h-1 rounded-full bg-hairline">
        <div
          className="absolute h-1 rounded-full bg-brand-accent"
          style={{
            left: `${((low - min) / (max - min)) * 100}%`,
            right: `${100 - ((high - min) / (max - min)) * 100}%`,
          }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={low}
        onChange={(e) => onChange([Math.min(Number(e.target.value), high - 1), high])}
        className="relative mt-[-4px] h-4 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-accent [&::-webkit-slider-thumb]:bg-canvas"
        aria-label="Minimum price"
      />
      <input
        type="range"
        min={min}
        max={max}
        value={high}
        onChange={(e) => onChange([low, Math.max(Number(e.target.value), low + 1)])}
        className="relative mt-[-16px] h-4 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-accent [&::-webkit-slider-thumb]:bg-canvas"
        aria-label="Maximum price"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-steel">
        <span>${low}</span>
        <span>${high}</span>
      </div>
    </div>
  );
}
