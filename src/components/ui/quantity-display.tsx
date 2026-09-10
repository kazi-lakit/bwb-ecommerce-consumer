import { formatQuantity } from "@/lib/format";

export function QuantityDisplay({ value, unit }: { value?: number | null; unit?: string }) {
  return (
    <span className="tabular-nums text-ink">
      {formatQuantity(value)}
      {unit && value != null ? ` ${unit}` : ""}
    </span>
  );
}
