import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal } from "lucide-react";
import type { Column, Task } from "../../lib/types.js";
import { KanbanColumn } from "./KanbanColumn.js";

interface Props {
  boardId: string;
  column: Column;
  tasks: Task[];
  /** When true the card is being rendered inside DragOverlay. */
  dragOverlay?: boolean;
}

/**
 * Wraps KanbanColumn with dnd-kit's useSortable so individual columns can be
 * reordered horizontally. The drag handle is a grip icon in the column header
 * area; the whole column card is NOT the drag target to avoid conflicting with
 * task drags inside it.
 *
 * - While dragging: opacity-30 + pointer-events:none on the original slot so
 *   the layout placeholder is visible but inactive.
 * - The DragOverlay in KanbanBoard shows a full-opacity copy via dragOverlay=true.
 */
export function SortableColumn({ boardId, column, tasks, dragOverlay }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: "column", column },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex-none w-[280px] h-full min-h-0"
    >
      {/* Faded placeholder while dragging; full opacity in overlay. */}
      <div
        className={
          isDragging && !dragOverlay
            ? "opacity-30 pointer-events-none h-full"
            : "h-full"
        }
      >
        <KanbanColumn
          boardId={boardId}
          column={column}
          tasks={tasks}
          dragHandle={
            <button
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder column"
              className="cursor-grab active:cursor-grabbing opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100 transition-opacity p-0.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] focus:outline-none"
              // Stop pointer events reaching the column card so clicks to open
              // dialogs aren't accidentally interpreted as drag starts.
              onPointerDown={(e) => e.stopPropagation()}
            >
              <GripHorizontal size={14} />
            </button>
          }
        />
      </div>
    </div>
  );
}
