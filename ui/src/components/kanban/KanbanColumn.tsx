import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "../../hooks/useRoles.js";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { Column, Task } from "../../lib/types.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { IconButton } from "../ui/IconButton.js";
import { AttachmentChipRow } from "../common/AttachmentChipRow.js";
import { usePromptGroups } from "../../hooks/usePromptGroups.js";
import { TaskCard } from "./TaskCard.js";
import { TaskDialog } from "../tasks/TaskDialog.js";
import { ColumnContextMenu } from "./ColumnContextMenu.js";
import { ColumnRenameDialog } from "./ColumnRenameDialog.js";
import { ColumnEditDialog } from "./ColumnEditDialog.js";
import { ColumnDeleteDialog } from "./ColumnDeleteDialog.js";

interface Props {
  boardId: string;
  column: Column;
  tasks: Task[];
}

export function KanbanColumn({ boardId, column, tasks }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  // Column detail drives the role chip + prompt chips under the title. The
  // base Column row from the board listing carries only role_id, not the
  // joined role payload, so we fetch on demand.
  const { data: detail } = useQuery({
    queryKey: qk.column(column.id),
    queryFn: () => api.columns.get(column.id),
    // The column list endpoint doesn't include role+prompts, so the detail
    // fetch is the only way to show them. Keep it running; small payload.
    staleTime: 30_000,
  });

  const role = detail?.role ?? null;
  // Hide direct column prompts the column-role already provides (the role
  // chip above implies them) and collapse fully-covered groups into a
  // group chip via AttachmentChipRow below.
  const { data: roleDetail } = useRole(role?.id ?? null);
  const rolePromptIds = useMemo(
    () => new Set((roleDetail?.prompts ?? []).map((p) => p.id)),
    [roleDetail]
  );
  const directPrompts = detail?.prompts ?? [];
  const { data: allGroups = [] } = usePromptGroups();

  return (
    <div
      data-testid={`kanban-column-${column.id}`}
      data-column-name={column.name}
      className="grid grid-rows-[auto_1fr] gap-3 h-full min-h-0 rounded-xl p-3 border border-[var(--color-border)] bg-transparent"
    >
      <div className="grid gap-1.5">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <h3 className="text-[13px] font-medium tracking-tight truncate text-[var(--color-text-muted)]">
              {column.name}
            </h3>
            <span className="text-[11px] tabular-nums text-[var(--color-text-subtle)]">
              {tasks.length}
            </span>
          </div>

          {role ? (
            <span
              data-testid={`column-role-chip-${column.id}`}
              title={`Column role: ${role.name}`}
              className="justify-self-center min-w-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] bg-[var(--hover-overlay)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
            >
              <span
                aria-hidden
                className="h-1 w-1 rounded-full shrink-0"
                style={{ backgroundColor: role.color || "#7a746a" }}
              />
              <span className="truncate">{role.name}</span>
            </span>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-0.5">
            <IconButton label="Add task" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
            </IconButton>
            <ColumnContextMenu
              onRename={() => setRenameOpen(true)}
              onEdit={() => setEditOpen(true)}
              onDelete={() => setDeleteOpen(true)}
            />
          </div>
        </div>

        <AttachmentChipRow
          prompts={directPrompts}
          allGroups={allGroups}
          hiddenPromptIds={rolePromptIds}
          testId={`column-prompt-chips-${column.id}`}
        />
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
      <ColumnEditDialog
        columnId={column.id}
        boardId={boardId}
        open={editOpen}
        onOpenChange={setEditOpen}
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
