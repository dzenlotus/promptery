import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { Column, Task } from "../../lib/types.js";
import { IconButton } from "../ui/IconButton.js";
import { TaskCard } from "./TaskCard.js";
import { TaskDialog } from "../tasks/TaskDialog.js";
import { ColumnContextMenu } from "./ColumnContextMenu.js";
import { ColumnRenameDialog } from "./ColumnRenameDialog.js";
import { ColumnDeleteDialog } from "./ColumnDeleteDialog.js";

interface Props {
  boardId: string;
  column: Column;
  tasks: Task[];
}

export function KanbanColumn({ boardId, column, tasks }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  return (
    <div
      data-testid={`kanban-column-${column.id}`}
      data-column-name={column.name}
      className="grid grid-rows-[auto_1fr] gap-3 h-full min-h-0 rounded-xl p-3 border border-[var(--color-border)] bg-transparent"
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-[13px] font-medium tracking-tight truncate text-[var(--color-text-muted)]">
            {column.name}
          </h3>
          <span className="text-[11px] tabular-nums text-[var(--color-text-subtle)]">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Add task" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
          </IconButton>
          <ColumnContextMenu
            onRename={() => setRenameOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        </div>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`overflow-y-auto scroll-thin grid auto-rows-max gap-2.5 min-h-[40px] rounded-md transition-colors ${
            isOver ? "bg-[var(--hover-overlay)]" : ""
          }`}
        >
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-[12px] text-[var(--color-text-subtle)]">
              Drop tasks here
            </div>
          ) : (
            tasks.map((t) => <TaskCard key={t.id} task={t} boardId={boardId} />)
          )}
        </div>
      </SortableContext>

      <TaskDialog
        mode="create"
        boardId={boardId}
        columnId={column.id}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <ColumnRenameDialog
        boardId={boardId}
        column={column}
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
      />
      <ColumnDeleteDialog
        boardId={boardId}
        column={column}
        taskCount={tasks.length}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
