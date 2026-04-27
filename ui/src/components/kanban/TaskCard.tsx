import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal, Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Role, Task } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { IconButton } from "../ui/IconButton.js";
import { Chip } from "../ui/Chip.js";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
} from "../ui/DropdownMenu.js";
import { TaskDialog } from "../tasks/TaskDialog.js";
import { TaskDeleteDialog } from "../tasks/TaskDeleteDialog.js";
import { useUndoRedoStore } from "../../store/undoRedo.js";
import { BoardMoveDialog } from "../tasks/BoardMoveDialog.js";

interface Props {
  task: Task;
  boardId: string;
  dragOverlay?: boolean;
  /** When true, clicking the card body toggles selection instead of opening edit dialog. Drag is disabled. */
  selectMode?: boolean;
  /** Whether this card is currently selected in bulk-select mode. */
  selected?: boolean;
  /** Called when the user clicks the card body or the checkbox in select mode. */
  onToggleSelected?: () => void;
}

export function TaskCard({ task, boardId, dragOverlay, selectMode, selected, onToggleSelected }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [boardMoveOpen, setBoardMoveOpen] = useState(false);

  const qc = useQueryClient();
  const { recordAction } = useUndoRedoStore();

  // Inherited role: resolve column → board when task has no direct role.
  // Both queries are already populated by KanbanColumn / KanbanView, so
  // this reads from cache without issuing new network requests.
  const { data: columnDetail } = useQuery({
    queryKey: qk.column(task.column_id),
    queryFn: () => api.columns.get(task.column_id),
    staleTime: 30_000,
    enabled: !task.role,
  });
  const { data: boardDetail } = useQuery({
    queryKey: qk.board(task.board_id),
    queryFn: () => api.boards.get(task.board_id),
    staleTime: 30_000,
    enabled: !task.role && !columnDetail?.role,
  });
  const inheritedRole: Role | null =
    task.role ? null : (columnDetail?.role ?? boardDetail?.role ?? null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", columnId: task.column_id, task },
    // Disable drag when in select mode
    disabled: selectMode,
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

  const handleDeleted = (_id: string) => {
    // Capture task snapshot at deletion time so undo can recreate it.
    const snapshot = task;
    recordAction({
      label: `Delete task "${snapshot.title}"`,
      do: async () => {
        await api.tasks.delete(snapshot.id);
        qc.setQueryData<Task[]>(qk.tasks(boardId), (old) =>
          old?.filter((t) => t.id !== snapshot.id) ?? []
        );
      },
      undo: async () => {
        const restored = await api.tasks.create(boardId, {
          column_id: snapshot.column_id,
          title: snapshot.title,
          description: snapshot.description,
        });
        await qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
        toast.success(`Task restored as ${restored.slug}`);
      },
    });
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        data-testid={`task-card-${task.id}`}
        data-task-slug={task.slug}
        {...attributes}
        {...(!selectMode ? listeners : {})}
        onClick={selectMode ? onToggleSelected : undefined}
        onDoubleClick={!selectMode ? () => setEditOpen(true) : undefined}
        className={cn(
          "group gradient-border liquid-glass rounded-lg p-3 grid gap-1.5",
          !selectMode && "cursor-grab active:cursor-grabbing",
          selectMode && "cursor-pointer",
          selectMode && selected && "ring-2 ring-[var(--color-accent)] ring-offset-0",
          dragOverlay && "dnd-overlay shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
        )}
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-1">
          <span className="text-[11px] tabular-nums text-[var(--color-text-subtle)]">
            {task.slug}
          </span>
          {selectMode ? (
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={!!selected}
                onChange={onToggleSelected}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select task ${task.title}`}
                className="h-3.5 w-3.5 accent-[var(--color-accent)] cursor-pointer"
              />
            </div>
          ) : (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
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
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <IconButton
                    label="More task actions"
                    size="sm"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal size={12} />
                  </IconButton>
                </DropdownTrigger>
                <DropdownContent align="end">
                  <DropdownItem onSelect={() => setBoardMoveOpen(true)}>
                    <ArrowRightLeft size={13} />
                    Move to board...
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => setDeleteOpen(true)} danger>
                    <Trash2 size={13} />
                    Delete
                  </DropdownItem>
                </DropdownContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <h4 className="text-[13px] font-medium tracking-tight line-clamp-2">{task.title}</h4>
        {plainDesc ? (
          <p className="text-[12px] text-[var(--color-text-muted)] line-clamp-3">{plainDesc}</p>
        ) : null}
        {task.role || inheritedRole || extrasCount > 0 ? (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {task.role ? (
              <Chip
                name={task.role.name}
                color={task.role.color}
                size="sm"
                data-testid={`task-card-role-${task.role.id}`}
              />
            ) : inheritedRole ? (
              <Chip
                name={inheritedRole.name}
                color={inheritedRole.color}
                size="sm"
                inherited
                tooltip={`Inherited role: ${inheritedRole.name}`}
                data-testid={`task-card-inherited-role-${inheritedRole.id}`}
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
        onDeleted={handleDeleted}
      />
      <BoardMoveDialog
        task={task}
        sourceBoardId={boardId}
        open={boardMoveOpen}
        onClose={() => setBoardMoveOpen(false)}
      />
    </>
  );
}
