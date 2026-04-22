import { useEffect } from "react";
import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import { useBoards, useCreateBoard } from "../hooks/useBoards.js";
import { ROUTES } from "../lib/routes.js";
import { Button } from "../components/ui/Button.js";
import { useState } from "react";
import { Dialog } from "../components/ui/Dialog.js";
import { Input } from "../components/ui/Input.js";

export function HomeRedirect() {
  const { data: boards, isLoading } = useBoards();
  const [, setLocation] = useLocation();
  const createBoard = useCreateBoard();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!isLoading && boards && boards.length > 0) {
      setLocation(ROUTES.board(boards[0]!.id), { replace: true });
    }
  }, [isLoading, boards, setLocation]);

  // Render a neutral loading placeholder while either boards are loading or
  // the post-load redirect hasn't propagated yet — avoids a blank frame
  // between `/` and `/board/:id`.
  const loadingEl = (
    <div className="h-full grid place-items-center text-[var(--color-text-subtle)] text-[13px]">
      Loading…
    </div>
  );
  if (isLoading) return loadingEl;

  if (!boards || boards.length === 0) {
    const submit = () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      createBoard.mutate(trimmed, {
        onSuccess: (b) => {
          setLocation(ROUTES.board(b.id), { replace: true });
          setName("");
          setOpen(false);
        },
      });
    };

    return (
      <div className="h-full grid place-items-center">
        <div className="text-center max-w-[360px]">
          <h2 className="text-[18px] font-semibold tracking-tight mb-1.5">No boards yet</h2>
          <p className="text-[13px] text-[var(--color-text-muted)] mb-4">
            Create your first board to start organising tasks.
          </p>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={14} />
            Create board
          </Button>
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => !o && setOpen(false)}
          title="New board"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={!name.trim()}>
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
                if (e.key === "Enter") submit();
              }}
              placeholder="My project"
            />
          </div>
        </Dialog>
      </div>
    );
  }

  return loadingEl;
}
