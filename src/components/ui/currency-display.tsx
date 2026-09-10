import { formatCurrency } from "@/lib/format";

export function CurrencyDisplay({ amount, currency }: { amount?: number | null; currency?: string }) {
  return <span className="tabular-nums text-ink">{formatCurrency(amount, currency)}</span>;
}
