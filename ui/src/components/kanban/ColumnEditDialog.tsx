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
  columnId: string;
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Column-level edit dialog — name, column role, and direct column prompts.
 * Role here overrides the board-level role for tasks in this column unless
 * the task itself sets its own role.
 */
export function ColumnEditDialog({ columnId, boardId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const { data: allPrompts = [] } = usePrompts();
  const { data: groups = [] } = usePromptGroups();

  const { data: column } = useQuery({
    queryKey: qk.column(columnId),
    queryFn: () => api.columns.get(columnId),
    enabled: open,
  });

  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [promptIds, setPromptIds] = useState<string[]>([]);

  useEffect(() => {
    if (!column || !open) return;
    setName(column.name);
    setRoleId(column.role_id ?? null);
    setPromptIds(column.prompts.map((p) => p.id));
  }, [column, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (trimmed && trimmed !== column?.name) {
        await api.columns.update(columnId, { name: trimmed });
      }
      if ((column?.role_id ?? null) !== roleId) {
        await api.columns.setRole(columnId, roleId);
      }
      const currentIds = column?.prompts.map((p) => p.id) ?? [];
      if (!sameList(currentIds, promptIds)) {
        await api.columns.setPrompts(columnId, promptIds);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.columns(boardId) });
      qc.invalidateQueries({ queryKey: qk.column(columnId) });
      qc.invalidateQueries({ queryKey: ["task-context"] });
      toast.success("Column updated");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update column"),
  });

  const submit = () => {
    if (!name.trim()) return;
    saveMutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saveMutation.isPending && onOpenChange(false)}
      title="Edit column"
      size="md"
      data-testid="column-edit-dialog"
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
            data-testid="column-edit-name"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Column role
            </label>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              overrides board role
            </span>
          </div>
          <RoleSelector selectedRoleId={roleId} onChange={setRoleId} roles={roles} />
        </div>

        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">
            Column prompts
          </label>
          <PromptsMultiSelector
            allPrompts={allPrompts}
            allGroups={groups}
            value={promptIds}
            onChange={setPromptIds}
            testId="column-edit-prompts"
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
