import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { RoleSelector } from "../tasks/RoleSelector.js";
import { PromptsMultiSelector } from "../common/PromptsMultiSelector.js";
import { useRoles } from "../../hooks/useRoles.js";
import { usePrompts } from "../../hooks/usePrompts.js";
import { usePromptGroups } from "../../hooks/usePromptGroups.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";

interface Props {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit dialog for a board — name, default role, and direct prompts. Name
 * patches and role/prompts updates fire as three separate requests because
 * the API keeps them on distinct endpoints; the dialog ties them into a
 * single optimistic "Save" action.
 */
export function BoardEditDialog({ boardId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const { data: allPrompts = [] } = usePrompts();
  const { data: groups = [] } = usePromptGroups();

  const { data: board } = useQuery({
    queryKey: qk.board(boardId),
    queryFn: () => api.boards.get(boardId),
    enabled: open,
  });

  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [promptIds, setPromptIds] = useState<string[]>([]);

  useEffect(() => {
    if (!board || !open) return;
    setName(board.name);
    setRoleId(board.role_id ?? null);
    setPromptIds(board.prompts.map((p) => p.id));
  }, [board, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (trimmed && trimmed !== board?.name) {
        await api.boards.update(boardId, trimmed);
      }
      if ((board?.role_id ?? null) !== roleId) {
        await api.boards.setRole(boardId, roleId);
      }
      const currentIds = board?.prompts.map((p) => p.id) ?? [];
      if (!sameList(currentIds, promptIds)) {
        await api.boards.setPrompts(boardId, promptIds);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.boards });
      qc.invalidateQueries({ queryKey: qk.board(boardId) });
      qc.invalidateQueries({ queryKey: ["task-context"] });
      toast.success("Board updated");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update board"),
  });

  const submit = () => {
    if (!name.trim()) return;
    saveMutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saveMutation.isPending && onOpenChange(false)}
      title="Edit board"
      size="md"
      data-testid="board-edit-dialog"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={saveMutation.isPending || !name.trim()}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoFocus
            data-testid="board-edit-name"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Default role
            </label>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              inherited by all tasks on this board
            </span>
          </div>
          <RoleSelector selectedRoleId={roleId} onChange={setRoleId} roles={roles} />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Board prompts
            </label>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              attached to every task on this board
            </span>
          </div>
          <PromptsMultiSelector
            allPrompts={allPrompts}
            allGroups={groups}
            value={promptIds}
            onChange={setPromptIds}
            testId="board-edit-prompts"
          />
        </div>
      </div>
    </Dialog>
  );
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
