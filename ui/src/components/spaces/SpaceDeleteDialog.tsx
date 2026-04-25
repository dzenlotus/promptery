import { toast } from "sonner";
import { ApiError } from "../../lib/api.js";
import { useDeleteSpace } from "../../hooks/useSpaces.js";
import type { Space } from "../../lib/types.js";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";

interface Props {
  space: Space;
  /** Number of boards inside the space — used both for the warning copy and
   *  for the front-line guard against the "SpaceHasBoards" 409 from the API. */
  boardCount: number;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export function SpaceDeleteDialog({
  space,
  boardCount,
  open,
  onClose,
  onDeleted,
}: Props) {
  const { mutate, isPending } = useDeleteSpace();

  const submit = () => {
    mutate(space.id, {
      onSuccess: () => {
        onDeleted?.();
        onClose();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          // Reasoned message either way — 409 fires for default-space and
          // has-boards. The component's `boardCount > 0` and `is_default`
          // checks below already prevent the user from getting here in the
          // happy path; this catches the race where another tab created a
          // board between dialog open and submit.
          toast.error(err.message || "Cannot delete this space");
        } else {
          toast.error(
            err instanceof Error ? err.message : "Failed to delete space"
          );
        }
      },
    });
  };

  const blocked = space.is_default || boardCount > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Delete space "${space.name}"?`}
      size="sm"
      data-testid="space-delete-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            disabled={isPending || blocked}
          >
            Delete
          </Button>
        </>
      }
    >
      <div className="py-2 text-[13px] text-[var(--color-text-muted)] grid gap-2">
        {space.is_default ? (
          <p>The default space is system-managed and cannot be deleted.</p>
        ) : boardCount > 0 ? (
          <>
            <p>
              This space contains <strong>{boardCount}</strong> board
              {boardCount === 1 ? "" : "s"}. Move or delete them first.
            </p>
            <p className="text-[var(--color-text-subtle)]">
              Deleting boards is permanent; moving boards re-slugs every task
              on each one to the destination space's prefix.
            </p>
          </>
        ) : (
          <p>This action cannot be undone.</p>
        )}
      </div>
    </Dialog>
  );
}
