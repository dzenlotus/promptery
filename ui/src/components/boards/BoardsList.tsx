import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Plus } from "lucide-react";
import { useBoards, useCreateBoard } from "../../hooks/useBoards.js";
import { ROUTES } from "../../lib/routes.js";
import { BoardRow } from "./BoardRow.js";
import { IconButton } from "../ui/IconButton.js";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { SidebarSection } from "../../layout/SidebarSection.js";

export function BoardsList() {
  const { data: boards = [], isLoading } = useBoards();
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ id: string }>("/board/:id");
  const activeId = params?.id;

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const createBoard = useCreateBoard();

  const onCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createBoard.mutate(trimmed, {
      onSuccess: (b) => {
        setLocation(ROUTES.board(b.id));
        setName("");
        setCreateOpen(false);
      },
    });
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
        onOpenChange={(o) => !o && setCreateOpen(false)}
        title="New board"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onCreate} disabled={!name.trim()}>
              Create
            </Button>
          </>
        }
      >
        <div className="grid gap-2 py-2">
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
      </Dialog>
    </SidebarSection>
  );
}
