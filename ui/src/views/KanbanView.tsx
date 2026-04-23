import { useEffect, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useBoards } from "../hooks/useBoards.js";
import { useColumns } from "../hooks/useColumns.js";
import { useTasks } from "../hooks/useTasks.js";
import { ROUTES } from "../lib/routes.js";
import { KanbanBoard } from "../components/kanban/KanbanBoard.js";
import { BoardsList } from "../components/boards/BoardsList.js";
import { PageLayout } from "../layout/PageLayout.js";

export function KanbanView() {
  const { id: boardId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: boards = [], isLoading: boardsLoading } = useBoards();
  const board = useMemo(() => boards.find((b) => b.id === boardId), [boards, boardId]);

  const { data: columns = [], isLoading: colLoading } = useColumns(boardId);
  const { data: tasks = [], isLoading: taskLoading } = useTasks(boardId);

  useEffect(() => {
    if (!boardsLoading && boardId && boards.length > 0 && !board) {
      toast.error("Board not found");
      setLocation(ROUTES.home, { replace: true });
    }
  }, [boardsLoading, boardId, boards.length, board, setLocation]);

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
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{board?.name ?? " "}</h1>
      </header>
      {colLoading || taskLoading ? (
        <div className="grid place-items-center text-[var(--color-text-subtle)] text-[13px]">
          Loading…
        </div>
      ) : boardId ? (
        <KanbanBoard boardId={boardId} columns={columns} tasks={tasks} />
      ) : null}
    </div>
  );

  return <PageLayout sidebarContent={<BoardsList />} mainContent={mainContent} />;
}
