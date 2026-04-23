import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useBoards } from "../../hooks/useBoards.js";
import { useRoles } from "../../hooks/useRoles.js";
import { usePrompts } from "../../hooks/usePrompts.js";
import { usePromptGroups } from "../../hooks/usePromptGroups.js";
import { ROUTES } from "../../lib/routes.js";
import { BoardRow } from "./BoardRow.js";
import { IconButton } from "../ui/IconButton.js";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { SidebarSection } from "../../layout/SidebarSection.js";
import { RoleSelector } from "../tasks/RoleSelector.js";
import { PromptsMultiSelector } from "../common/PromptsMultiSelector.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";

export function BoardsList() {
  const { data: boards = [], isLoading } = useBoards();
  const { data: roles = [] } = useRoles();
  const { data: allPrompts = [] } = usePrompts();
  const { data: groups = [] } = usePromptGroups();
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ id: string }>("/board/:id");
  const activeId = params?.id;
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [promptIds, setPromptIds] = useState<string[]>([]);

  const createBoard = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      const board = await api.boards.create(trimmed);
      // Role and prompts are a separate API surface — fire them only when
      // the user actually picked something so a plain "new board" stays a
      // single POST in the common case.
      if (roleId) await api.boards.setRole(board.id, roleId);
      if (promptIds.length > 0) await api.boards.setPrompts(board.id, promptIds);
      return board;
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: qk.boards });
      qc.invalidateQueries({ queryKey: qk.board(b.id) });
      setLocation(ROUTES.board(b.id));
      resetForm();
      setCreateOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create board"),
  });

  const resetForm = () => {
    setName("");
    setRoleId(null);
    setPromptIds([]);
  };

  const onCreate = () => {
    if (!name.trim()) return;
    createBoard.mutate();
  };

  const handleAfterDelete = (deletedId: string) => {
    if (deletedId !== activeId) return;
    const next = boards.find((x) => x.id !== deletedId);
    setLocation(next ? ROUTES.board(next.id) : ROUTES.home, { replace: true });
  };

  return (
    <SidebarSection
      label="Boards"
      action={
        <IconButton label="New board" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
        </IconButton>
      }
    >
      {isLoading ? (
        <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">Loading…</div>
      ) : boards.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
          No boards yet. Create one to get started.
        </div>
      ) : (
        boards.map((b, i) => (
          <BoardRow key={b.id} index={i + 1} board={b} onAfterDelete={handleAfterDelete} />
        ))
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          if (!o && !createBoard.isPending) {
            setCreateOpen(false);
            resetForm();
          }
        }}
        title="New board"
        size="md"
        data-testid="board-create-dialog"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                resetForm();
              }}
              disabled={createBoard.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onCreate}
              disabled={!name.trim() || createBoard.isPending}
            >
              {createBoard.isPending ? "Creating…" : "Create"}
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
    </SidebarSection>
  );
}
