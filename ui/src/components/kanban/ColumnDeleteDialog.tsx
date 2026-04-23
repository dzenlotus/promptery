import { toast } from "sonner";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { useDeleteColumn } from "../../hooks/useColumns.js";
import type { Column } from "../../lib/types.js";

interface Props {
  boardId: string;
  column: Column;
  taskCount: number;
  open: boolean;
  onClose: () => void;
}

/**
 * Two shapes:
 *   - empty column → confirm-and-delete (destructive action)
 *   - non-empty column → explanation-only, no Delete button
 *
 * The backend rejects non-empty deletes regardless, so this is the UX layer
 * on top of that hard guarantee. Keeping the same dialog for both states
 * means the ⋯ menu's Delete action is never a dead end.
 */
export function ColumnDeleteDialog({
  boardId,
  column,
  taskCount,
  open,
  onClose,
}: Props) {
  const { mutate, isPending } = useDeleteColumn(boardId);
  const hasTasks = taskCount > 0;

  const submit = () => {
    mutate(column.id, {
      onSuccess: () => {
        toast.success(`Column "${column.name}" deleted`);
        onClose();
      },
      onError: (err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to delete column");
        onClose();
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={hasTasks ? "Cannot delete column" : `Delete column "${column.name}"?`}
      description={
        hasTasks
          ? `This column contains ${taskCount} task${taskCount === 1 ? "" : "s"}. Move or delete them before removing the column.`
          : "The column will be permanently removed. This cannot be undone."
      }
      size="sm"
      data-testid="column-delete-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            {hasTasks ? "OK" : "Cancel"}
          </Button>
          {hasTasks ? null : (
            <Button variant="danger" onClick={submit} disabled={isPending}>
              Delete
            </Button>
          )}
        </>
      }
    >
      <div className="py-2" />
    </Dialog>
  );
}
