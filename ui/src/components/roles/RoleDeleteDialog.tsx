import { useQuery } from "@tanstack/react-query";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { api } from "../../lib/api.js";

interface Props {
  roleId: string;
  roleName: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function RoleDeleteDialog({
  roleId,
  roleName,
  open,
  onClose,
  onConfirm,
  isDeleting,
}: Props) {
  // Count only fetches while the dialog is open so we avoid hitting the
  // endpoint for every role in the sidebar.
  const { data } = useQuery({
    queryKey: ["role-tasks-count", roleId],
    queryFn: () => api.roles.tasksCount(roleId),
    enabled: open,
    staleTime: 5_000,
  });
  const count = data?.count ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !isDeleting && onClose()}
      title={`Delete role «${roleName}»?`}
      size="sm"
      data-testid="role-delete-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="role-delete-confirm"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </>
      }
    >
      <div className="grid gap-2 py-2 text-[13px] text-[var(--color-text-muted)]">
        {count > 0 ? (
          <p>
            This role is used by <strong>{count}</strong> task{count === 1 ? "" : "s"}.
            Removing it will detach the role from those tasks and drop any prompts
            they inherited from it.
          </p>
        ) : (
          <p>No tasks currently use this role. This action cannot be undone.</p>
        )}
      </div>
    </Dialog>
  );
}
