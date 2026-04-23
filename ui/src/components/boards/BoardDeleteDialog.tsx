import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { useDeleteBoard } from "../../hooks/useBoards.js";

interface Props {
  boardId: string;
  boardName: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export function BoardDeleteDialog({ boardId, boardName, open, onClose, onDeleted }: Props) {
  const { mutate, isPending } = useDeleteBoard();

  const submit = () => {
    mutate(boardId, {
      onSuccess: () => {
        onDeleted?.();
        onClose();
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Delete board?"
      description={`"${boardName}" and all of its tasks will be permanently removed.`}
      size="sm"
      data-testid="board-delete-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={isPending}>
            Delete
          </Button>
        </>
      }
    >
      <div className="py-2 text-[13px] text-[var(--color-text-muted)]">
        This action cannot be undone.
      </div>
    </Dialog>
  );
}
