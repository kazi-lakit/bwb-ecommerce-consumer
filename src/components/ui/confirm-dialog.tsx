import { Modal } from "./modal";
import { Button } from "./button";

export interface ConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A reusable Yes/No dialog — used for every destructive (delete) action across the admin console. */
export function ConfirmDialog({ title, description, confirmLabel = "Confirm", danger, loading, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal onClose={onCancel} labelledBy="confirm-dialog-title">
      <h2 id="confirm-dialog-title" className="mb-2 text-lg font-semibold text-ink">
        {title}
      </h2>
      {description && <p className="mb-5 text-sm text-steel">{description}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>
          {loading ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
