import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { useDeleteColumn } from "../../hooks/useColumns.js";
import { useUndoRedoStore } from "../../store/undoRedo.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
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
 *
 * Undo note: since the backend only allows deleting empty columns, undo
 * simply recreates the column at the same position. No tasks need to be
 * restored.
 */
export function ColumnDeleteDialog({
  boardId,
  column,
  taskCount,
  open,
  onClose,
}: Props) {
  const { mutate, isPending } = useDeleteColumn(boardId);
  const { recordAction } = useUndoRedoStore();
  const qc = useQueryClient();
  const hasTasks = taskCount > 0;

  const submit = () => {
    // Snapshot column metadata before deletion so undo can recreate it.
    const snapshot = column;

    mutate(column.id, {
      onSuccess: () => {
        toast.success(`Column "${column.name}" deleted`);
        onClose();

        recordAction({
          label: `Delete column "${snapshot.name}"`,
          do: async () => {
            await api.columns.delete(snapshot.id);
            qc.setQueryData<Column[]>(qk.columns(boardId), (old) =>
              old?.filter((c) => c.id !== snapshot.id) ?? []
            );
          },
          undo: async () => {
            const restored = await api.columns.create(boardId, snapshot.name);
            await qc.invalidateQueries({ queryKey: qk.columns(boardId) });
            toast.success(`Column "${restored.name}" restored`);
          },
        });
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
