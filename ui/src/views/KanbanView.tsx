import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal, Settings2, Trash2 } from "lucide-react";
import { useBoards } from "../hooks/useBoards.js";
import { useColumns } from "../hooks/useColumns.js";
import { useTasks } from "../hooks/useTasks.js";
import { useRole } from "../hooks/useRoles.js";
import { ROUTES } from "../lib/routes.js";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";
import { KanbanBoard } from "../components/kanban/KanbanBoard.js";
import { SpacesList } from "../components/spaces/SpacesList.js";
import { BoardEditDialog } from "../components/boards/BoardEditDialog.js";
import { BoardDeleteDialog } from "../components/boards/BoardDeleteDialog.js";
import { AttachmentChipRow } from "../components/common/AttachmentChipRow.js";
import { usePromptGroups } from "../hooks/usePromptGroups.js";
import {
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from "../components/ui/DropdownMenu.js";
import { IconButton } from "../components/ui/IconButton.js";
import { PageLayout } from "../layout/PageLayout.js";

export function KanbanView() {
  const { id: boardId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: boards = [], isLoading: boardsLoading } = useBoards();
  const board = useMemo(() => boards.find((b) => b.id === boardId), [boards, boardId]);

  const { data: columns = [], isLoading: colLoading } = useColumns(boardId);
  const { data: tasks = [], isLoading: taskLoading } = useTasks(boardId);

  // Detail fetch gives us role + direct board prompts for the header. The
  // list hook above stays lean so sidebar reloads aren't coupled to
  // relation loads.
  const { data: detail } = useQuery({
    queryKey: boardId ? qk.board(boardId) : ["board", "_"],
    queryFn: () => api.boards.get(boardId as string),
    enabled: Boolean(boardId),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Pull the active role's prompts so we can hide direct board prompts that
  // are already provided via the role — the role badge next to the title
  // already implies them.
  const { data: roleDetail } = useRole(detail?.role_id ?? null);
  const rolePromptIds = useMemo(
    () => new Set((roleDetail?.prompts ?? []).map((p) => p.id)),
    [roleDetail]
  );
  // AttachmentChipRow also collapses fully-covered groups into a group chip
  // so "I added a group to this board" reads as a single chip, not N loose
  // prompts.
  const { data: allGroups = [] } = usePromptGroups();

  useEffect(() => {
    if (!boardsLoading && boardId && boards.length > 0 && !board) {
      toast.error("Board not found");
      setLocation(ROUTES.home, { replace: true });
    }
  }, [boardsLoading, boardId, boards.length, board, setLocation]);

  const handleAfterDelete = (deletedId: string) => {
    const next = boards.find((x) => x.id !== deletedId);
    setLocation(next ? ROUTES.board(next.id) : ROUTES.home, { replace: true });
  };

  const mainContent = boardsLoading ? (
    <div
      data-testid="kanban-view"
      data-loading="true"
      className="h-full grid place-items-center text-[var(--color-text-subtle)] text-[13px]"
    >
      Loading…
    </div>
  ) : (
    <div
      data-testid="kanban-view"
      data-board-id={boardId}
      className="grid grid-rows-[auto_1fr] h-full gap-5 p-6 min-h-0"
    >
      <header className="grid gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] truncate">
            {detail?.name ?? board?.name ?? " "}
          </h1>

          {detail?.role && (
            <span
              data-testid="board-role-chip"
              className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] bg-[var(--color-accent-soft)] text-[var(--color-text)] border border-[var(--color-accent-ring)]"
              title={`Board role: ${detail.role.name}`}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: detail.role.color || "#7a746a" }}
              />
              <span className="text-[var(--color-text-muted)]">role:</span>
              <span className="font-medium tracking-tight">{detail.role.name}</span>
            </span>
          )}

          <div className="ml-auto">
            {boardId && (
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <IconButton
                    label="Board actions"
                    size="md"
                    data-testid="board-header-menu"
                  >
                    <MoreHorizontal size={16} />
                  </IconButton>
                </DropdownTrigger>
                <DropdownContent align="end">
                  <DropdownItem onSelect={() => setEditOpen(true)}>
                    <Settings2 size={14} />
                    Edit role &amp; prompts
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => setDeleteOpen(true)} danger>
                    <Trash2 size={14} />
                    Delete board
                  </DropdownItem>
                </DropdownContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <AttachmentChipRow
          prompts={detail?.prompts ?? []}
          allGroups={allGroups}
          hiddenPromptIds={rolePromptIds}
          testId="board-prompt-chips"
        />
      </header>

      {colLoading || taskLoading ? (
        <div className="grid place-items-center text-[var(--color-text-subtle)] text-[13px]">
          Loading…
        </div>
      ) : boardId ? (
        <KanbanBoard boardId={boardId} columns={columns} tasks={tasks} />
      ) : null}

      {boardId && (
        <>
          <BoardEditDialog
            boardId={boardId}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          {board && (
            <BoardDeleteDialog
              boardId={boardId}
              boardName={board.name}
              open={deleteOpen}
              onClose={() => setDeleteOpen(false)}
              onDeleted={() => handleAfterDelete(boardId)}
            />
          )}
        </>
      )}
    </div>
  );

  return <PageLayout sidebarContent={<SpacesList />} mainContent={mainContent} />;
}
