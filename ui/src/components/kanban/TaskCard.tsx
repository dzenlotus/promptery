import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Trash2 } from "lucide-react";
import type { Task } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";
import { IconButton } from "../ui/IconButton.js";
import { Chip } from "../ui/Chip.js";
import { TaskDialog } from "../tasks/TaskDialog.js";
import { TaskDeleteDialog } from "../tasks/TaskDeleteDialog.js";

interface Props {
  task: Task;
  boardId: string;
  dragOverlay?: boolean;
}

export function TaskCard({ task, boardId, dragOverlay }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", columnId: task.column_id, task },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !dragOverlay ? 0 : 1,
  };

  const plainDesc = task.description
    .replace(/[#*`>\-\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const extrasCount =
    task.prompts.length + task.skills.length + task.mcp_tools.length;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        data-testid={`task-card-${task.id}`}
        data-task-number={task.number}
        {...attributes}
        {...listeners}
        onDoubleClick={() => setEditOpen(true)}
        className={cn(
          "group gradient-border liquid-glass rounded-lg p-3 grid gap-1.5",
          "cursor-grab active:cursor-grabbing",
          dragOverlay && "dnd-overlay shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
        )}
      >
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1">
          <span className="text-[11px] tabular-nums text-[var(--color-text-subtle)]">
            #{task.number}
          </span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
            <IconButton
              label="Edit task"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setEditOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Pencil size={12} />
            </IconButton>
            <IconButton
              label="Delete task"
              size="sm"
              tone="danger"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Trash2 size={12} />
            </IconButton>
          </div>
        </div>
        <h4 className="text-[13px] font-medium tracking-tight line-clamp-2">{task.title}</h4>
        {plainDesc ? (
          <p className="text-[12px] text-[var(--color-text-muted)] line-clamp-3">{plainDesc}</p>
        ) : null}
        {task.role || extrasCount > 0 ? (
          <div className="flex items-center gap-1.5 mt-1">
            {task.role ? (
              <Chip
                name={task.role.name}
                color={task.role.color}
                size="sm"
                data-testid={`task-card-role-${task.role.id}`}
              />
            ) : null}
            {extrasCount > 0 ? (
              <span className="text-[10px] tabular-nums text-[var(--color-text-subtle)]">
                +{extrasCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <TaskDialog
        mode="edit"
        boardId={boardId}
        task={task}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <TaskDeleteDialog
        boardId={boardId}
        taskId={task.id}
        taskTitle={task.title}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}
