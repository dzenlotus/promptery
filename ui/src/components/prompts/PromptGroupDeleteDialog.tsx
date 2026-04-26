import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { useUndoRedoStore } from "../../store/undoRedo.js";
import type { PromptGroup } from "../../lib/types.js";

interface Props {
  group: PromptGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function PromptGroupDeleteDialog({ group, open, onOpenChange, onDeleted }: Props) {
  const qc = useQueryClient();
  const { recordAction } = useUndoRedoStore();

  const mutation = useMutation({
    mutationFn: (id: string) => api.promptGroups.delete(id),
    onSuccess: (_res, _id) => {
      qc.invalidateQueries({ queryKey: qk.promptGroups });
      const label = group ? `Delete group "${group.name}"` : "Delete group";
      toast.success(group ? `Group "${group.name}" deleted` : "Group deleted");
      onOpenChange(false);
      onDeleted?.();

      if (!group) return;

      // Snapshot before mutation clears the reference.
      const snapshot = group;

      recordAction({
        label,
        do: async () => {
          await api.promptGroups.delete(snapshot.id);
          await qc.invalidateQueries({ queryKey: qk.promptGroups });
        },
        undo: async () => {
          const restored = await api.promptGroups.create({
            name: snapshot.name,
            color: snapshot.color ?? undefined,
            prompt_ids: snapshot.member_ids,
          });
          await qc.invalidateQueries({ queryKey: qk.promptGroups });
          toast.success(`Group "${restored.name}" restored`);
        },
      });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete group"),
  });

  const confirm = () => {
    if (group) mutation.mutate(group.id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !mutation.isPending && onOpenChange(false)}
      title={group ? `Delete "${group.name}"?` : "Delete group?"}
      size="sm"
      data-testid="prompt-group-delete-dialog"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirm}
            disabled={mutation.isPending}
            data-testid="prompt-group-delete-confirm"
          >
            {mutation.isPending ? "Deleting…" : "Delete group"}
          </Button>
        </>
      }
    >
      <div className="py-2 text-[13px] text-[var(--color-text-muted)]">
        The group will be removed. The {group?.prompt_count ?? 0} prompt
        {group?.prompt_count === 1 ? "" : "s"} inside the group will NOT be
        deleted — they stay available in the main prompts list.
      </div>
    </Dialog>
  );
}
