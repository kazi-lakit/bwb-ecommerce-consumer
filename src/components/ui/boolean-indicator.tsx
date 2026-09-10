import { CheckCircle2, XCircle } from "lucide-react";

/** A labeled Yes/No flag shown as an icon + word — never color alone. */
export function BooleanIndicator({ value, label }: { value: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-steel">
      {value ? <CheckCircle2 size={14} className="text-brand-success" /> : <XCircle size={14} className="text-muted" />}
      {label}
    </span>
  );
}
