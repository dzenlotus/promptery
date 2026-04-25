import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRoles } from "../../hooks/useRoles.js";
import { usePrompts } from "../../hooks/usePrompts.js";
import { usePromptGroups } from "../../hooks/usePromptGroups.js";
import { ROUTES } from "../../lib/routes.js";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { RoleSelector } from "../tasks/RoleSelector.js";
import { PromptsMultiSelector } from "../common/PromptsMultiSelector.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * The space this board lands in. Pass `null` to use the default space —
   * matches the API's `space_id?` semantics. Both call sites (per-space
   * "+" button and the "Boards" section "+" button) use this.
   */
  spaceId: string | null;
  spaceName?: string;
}

/**
 * Reuses the dialog body of the original BoardsList create form but takes
 * an explicit `space_id` so the same component covers both "create in
 * this space" (per-space + button) and "create in default space" (the
 * orphan-Boards section).
 */
export function BoardCreateDialog({ open, onClose, spaceId, spaceName }: Props) {
  const { data: roles = [] } = useRoles();
  const { data: allPrompts = [] } = usePrompts();
  const { data: groups = [] } = usePromptGroups();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [promptIds, setPromptIds] = useState<string[]>([]);

  const reset = () => {
    setName("");
    setRoleId(null);
    setPromptIds([]);
  };

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      const board = await api.boards.create(
        trimmed,
        spaceId ? { space_id: spaceId } : undefined
      );
      if (roleId) await api.boards.setRole(board.id, roleId);
      if (promptIds.length > 0) await api.boards.setPrompts(board.id, promptIds);
      return board;
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: qk.boards });
      qc.invalidateQueries({ queryKey: qk.board(b.id) });
      qc.invalidateQueries({ queryKey: qk.spaces });
      setLocation(ROUTES.board(b.id));
      reset();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create board"),
  });

  const onCreate = () => {
    if (!name.trim()) return;
    create.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !create.isPending) {
          reset();
          onClose();
        }
      }}
      title={spaceName ? `New board in ${spaceName}` : "New board"}
      size="md"
      data-testid="board-create-dialog"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onCreate}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">Name</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreate();
            }}
            placeholder="My project"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Default role (optional)
            </label>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              inherited by all tasks
            </span>
          </div>
          <RoleSelector selectedRoleId={roleId} onChange={setRoleId} roles={roles} />
        </div>

        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">
            Default prompts (optional)
          </label>
          <PromptsMultiSelector
            allPrompts={allPrompts}
            allGroups={groups}
            value={promptIds}
            onChange={setPromptIds}
            testId="board-create-prompts"
          />
        </div>
      </div>
    </Dialog>
  );
}
