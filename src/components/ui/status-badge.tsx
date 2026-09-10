import clsx from "clsx";

/**
 * Status text mapped to a tone — never color alone: every tone still renders the
 * status word itself plus a small dot, so meaning survives grayscale/color-blindness.
 */
const TONE_BY_STATUS: Record<string, "positive" | "neutral" | "warning" | "negative"> = {
  active: "positive",
  approved: "positive",
  received: "positive",
  committed: "positive",
  closed: "positive",
  inactive: "neutral",
  draft: "neutral",
  released: "neutral",
  submitted: "warning",
  pending: "warning",
  in_transit: "warning",
  partially_received: "warning",
  quality_hold: "warning",
  blocked: "negative",
  archived: "negative",
  cancelled: "negative",
  expired: "negative",
};

const TONE_CLASSES: Record<"positive" | "neutral" | "warning" | "negative", string> = {
  positive: "bg-brand-success/15 text-status-positive-text",
  neutral: "bg-surface text-steel",
  warning: "bg-brand-warn/15 text-status-warning-text",
  negative: "bg-brand-error/15 text-brand-error",
};

const DOT_CLASSES: Record<"positive" | "neutral" | "warning" | "negative", string> = {
  positive: "bg-brand-success",
  neutral: "bg-muted",
  warning: "bg-brand-warn",
  negative: "bg-brand-error",
};

function toneFor(status: string): "positive" | "neutral" | "warning" | "negative" {
  return TONE_BY_STATUS[status.toLowerCase()] ?? "neutral";
}

function humanize(status: string): string {
  return status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = toneFor(status);
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold", TONE_CLASSES[tone], className)}>
      <span className={clsx("h-1.5 w-1.5 flex-none rounded-full", DOT_CLASSES[tone])} aria-hidden="true" />
      {humanize(status)}
    </span>
  );
}
