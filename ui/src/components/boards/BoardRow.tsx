import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import type { Board } from "../../lib/types.js";
import { ROUTES } from "../../lib/routes.js";
import { cn } from "../../lib/cn.js";
import { BoardContextMenu } from "./BoardContextMenu.js";
import { BoardRenameDialog } from "./BoardRenameDialog.js";
import { BoardDeleteDialog } from "./BoardDeleteDialog.js";

interface Props {
  index: number;
  board: Board;
  onAfterDelete: (deletedId: string) => void;
}

export function BoardRow({ index, board, onAfterDelete }: Props) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ id: string }>("/board/:id");
  const active = params?.id === board.id;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-testid={`board-row-${board.id}`}
        onClick={() => setLocation(ROUTES.board(board.id))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setLocation(ROUTES.board(board.id));
          }
        }}
        className={cn(
          "group grid grid-cols-[24px_1fr_24px] items-center gap-2 h-9 px-3 rounded-md cursor-pointer",
          "transition-colors duration-150",
          active
            ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
            : "hover:bg-[var(--hover-overlay)] text-[var(--color-text)]"
        )}
      >
        <span
          className={cn(
            "text-[12px] tabular-nums",
            active ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]"
          )}
        >
          #{index}
        </span>
        <span className="truncate text-[13px] tracking-tight">{board.name}</span>
        <div className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity">
          <BoardContextMenu
            onRename={() => setRenameOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        </div>
      </div>
      <BoardRenameDialog
        boardId={board.id}
        currentName={board.name}
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
      />
      <BoardDeleteDialog
        boardId={board.id}
        boardName={board.name}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => onAfterDelete(board.id)}
      />
    </>
  );
}
