import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { useDeleteTask } from "../../hooks/useTasks.js";

interface Props {
  boardId: string;
  taskId: string;
  taskTitle: string;
  open: boolean;
  onClose: () => void;
}

export function TaskDeleteDialog({ boardId, taskId, taskTitle, open, onClose }: Props) {
  const { mutate, isPending } = useDeleteTask(boardId);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Delete task?"
      description={`"${taskTitle}" will be permanently removed.`}
      size="sm"
      data-testid="task-delete-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={isPending}
            onClick={() => mutate(taskId, { onSuccess: () => onClose() })}
          >
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
