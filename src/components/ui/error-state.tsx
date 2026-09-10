import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-hairline bg-surface py-16 text-center">
      <AlertTriangle size={28} className="text-brand-error" aria-hidden="true" />
      <p className="text-sm font-medium text-ink">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted">{message || "This couldn't be loaded. Please try again."}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
