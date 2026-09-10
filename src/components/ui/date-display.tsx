import { formatDate } from "@/lib/format";

export function DateDisplay({ value }: { value?: string }) {
  return <span className="tabular-nums text-ink">{formatDate(value)}</span>;
}
