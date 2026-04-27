import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";

interface Props {
  open: boolean;
  selectedCount: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function BulkDeleteDialog({
  open,
  selectedCount,
  isPending,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Delete ${selectedCount} task${selectedCount === 1 ? "" : "s"}?`}
      description={`${selectedCount} task${selectedCount === 1 ? "" : "s"} will be permanently removed.`}
      size="sm"
      data-testid="bulk-delete-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </>
      }
    >
      <div className="py-2 text-[13px] text-[var(--color-text-muted)]">
        This action will delete all selected tasks. Deleted tasks can be restored
        with <kbd className="font-mono text-[11px] px-1 rounded bg-[var(--hover-overlay)]">⌘Z</kbd> (with
        new IDs; your board will reflect the change immediately).
      </div>
    </Dialog>
  );
}
