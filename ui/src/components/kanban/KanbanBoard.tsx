import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import type { Column, Task } from "../../lib/types.js";
import { qk } from "../../lib/query.js";
import { useMoveTask } from "../../hooks/useTasks.js";
import { useUndoRedoStore } from "../../store/undoRedo.js";
import { api } from "../../lib/api.js";
import { useReorderColumns } from "../../hooks/useColumns.js";
import { SortableColumn } from "./SortableColumn.js";
import { TaskCard } from "./TaskCard.js";
import { AddColumnButton } from "./AddColumnButton.js";
import { ScrollArea } from "../ui/ScrollArea.js";

interface Props {
  boardId: string;
  columns: Column[];
  tasks: Task[];
}

function tasksByColumn(tasks: Task[], columns: Column[]): Record<string, Task[]> {
  const out: Record<string, Task[]> = {};
  for (const c of columns) out[c.id] = [];
  for (const t of [...tasks].sort((a, b) => a.position - b.position)) {
    (out[t.column_id] ??= []).push(t);
  }
  return out;
}

function positionBetween(before: Task | undefined, after: Task | undefined): number {
  if (before && after) return (before.position + after.position) / 2;
  if (before) return before.position + 1;
  if (after) return after.position / 2;
  return 1;
}

/**
 * KanbanBoard renders two nested DndContexts:
 *
 * Outer context — COLUMN reordering:
 *   - SortableContext with horizontalListSortingStrategy wraps the column list.
 *   - PointerSensor (6px activation) + KeyboardSensor with sortableKeyboardCoordinates.
 *   - Drag handle on each column header (GripHorizontal icon, visible on hover).
 *   - onDragEnd: arrayMove optimistic update then PATCH /api/boards/:id/columns/order.
 *   - DragOverlay shows a faded column copy while dragging.
 *
 * Inner context — TASK reordering (unchanged from original MultipleContainers approach):
 *   - Custom collision detection: pointerWithin → closestCenter → rectIntersection.
 *   - onDragOver handles cross-column migration in the cache.
 *   - onDragEnd fires useMoveTask mutation.
 *
 * Nesting is safe: dnd-kit contexts are isolated. A task drag never triggers
 * column handlers and vice-versa because the active.data.current.type check
 * separates them in the outer context.
 */
export function KanbanBoard({ boardId, columns, tasks }: Props) {
  const qc = useQueryClient();
  const moveTask = useMoveTask(boardId);
  const reorderColumns = useReorderColumns(boardId);

  // Tracks which column card is being dragged (for DragOverlay in the outer ctx).
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  // Tracks which task card is being dragged (for DragOverlay in the inner ctx).
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const { recordAction } = useUndoRedoStore();

  // Sensors for column DnD (outer context).
  const columnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Sensors for task DnD (inner context) — pointer only, keyboard not needed for tasks.
  const taskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Use optimistic column order from query cache when available.
  const latestColumns = useCallback(
    () => qc.getQueryData<Column[]>(qk.columns(boardId)) ?? columns,
    [qc, boardId, columns]
  );

  const grouped = useMemo(() => tasksByColumn(tasks, columns), [tasks, columns]);

  // ── Column drag handlers ─────────────────────────────────────────────────

  const onColumnDragStart = (event: DragStartEvent) => {
    const col = latestColumns().find((c) => c.id === String(event.active.id));
    if (col) setActiveColumn(col);
  };

  const onColumnDragEnd = (event: DragEndEvent) => {
    setActiveColumn(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const cols = latestColumns();
    const oldIdx = cols.findIndex((c) => c.id === String(active.id));
    const newIdx = cols.findIndex((c) => c.id === String(over.id));
    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

    const reordered = arrayMove(cols, oldIdx, newIdx);
    reorderColumns.mutate(reordered.map((c) => c.id));
  };

  const onColumnDragCancel = () => {
    setActiveColumn(null);
  };

  // ── Task drag helpers ────────────────────────────────────────────────────

  const getLatestTasks = useCallback(
    () => qc.getQueryData<Task[]>(qk.tasks(boardId)) ?? tasks,
    [qc, boardId, tasks]
  );

  const columnIds = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);
  const lastOverId = useRef<string | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      const pointerCollisions = pointerWithin(args);
      const intersections =
        pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);

      let overId = getFirstCollision(intersections, "id") as string | null;

      if (overId != null) {
        if (columnIds.has(overId)) {
          const latest = getLatestTasks();
          const inColumn = latest
            .filter((t) => t.column_id === overId)
            .map((t) => t.id);
          if (inColumn.length > 0) {
            const refinement = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (c) => c.id !== overId && inColumn.includes(String(c.id))
              ),
            });
            const refinedId = getFirstCollision(refinement, "id") as string | null;
            if (refinedId != null) overId = refinedId;
          }
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }

      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = String(args.active.id);
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [columnIds, getLatestTasks]
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  });

  const onTaskDragStart = (event: DragStartEvent) => {
    const t = getLatestTasks().find((x) => x.id === String(event.active.id));
    if (t) setActiveTask(t);
    lastOverId.current = null;
  };

  const onTaskDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const latest = getLatestTasks();
    const activeT = latest.find((t) => t.id === activeId);
    if (!activeT) return;

    const overTask = latest.find((t) => t.id === overId);
    const overColumn = columns.find((c) => c.id === overId);
    const targetColumnId = overTask?.column_id ?? overColumn?.id;
    if (!targetColumnId) return;

    if (activeT.column_id === targetColumnId) return;

    recentlyMovedToNewContainer.current = true;

    qc.setQueryData<Task[]>(qk.tasks(boardId), (old) => {
      if (!old) return old;
      const targetTasks = old
        .filter((t) => t.column_id === targetColumnId && t.id !== activeId)
        .sort((a, b) => a.position - b.position);

      let newPosition: number;
      if (overTask) {
        const overIdx = targetTasks.findIndex((t) => t.id === overId);
        const before = targetTasks[overIdx - 1];
        newPosition = positionBetween(before, overTask);
      } else {
        const last = targetTasks[targetTasks.length - 1];
        newPosition = positionBetween(last, undefined);
      }

      return old.map((t) =>
        t.id === activeId
          ? { ...t, column_id: targetColumnId, position: newPosition }
          : t
      );
    });
  };

  const onTaskDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) {
      qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const latest = getLatestTasks();
    const activeT = latest.find((t) => t.id === activeId);
    if (!activeT) return;

    // Capture original position before any cache update for undo.
    const originalColumnId = activeT.column_id;
    const originalPosition = activeT.position;

    const overTask = latest.find((t) => t.id === overId);
    const overColumn = columns.find((c) => c.id === overId);
    const targetColumnId = overTask?.column_id ?? overColumn?.id ?? activeT.column_id;

    const colTasks = latest
      .filter((t) => t.column_id === targetColumnId)
      .sort((a, b) => a.position - b.position);
    const activeIdx = colTasks.findIndex((t) => t.id === activeId);
    const overIdx = overTask
      ? colTasks.findIndex((t) => t.id === overId)
      : colTasks.length - 1;

    if (activeIdx === -1) return;

    let newPosition: number;
    if (overIdx === -1 || activeIdx === overIdx) {
      newPosition = activeT.position;
    } else {
      const newOrder = arrayMove(colTasks, activeIdx, overIdx);
      const newIdx = newOrder.findIndex((t) => t.id === activeId);
      const before = newOrder[newIdx - 1];
      const after = newOrder[newIdx + 1];
      newPosition = positionBetween(before, after);
    }

    qc.setQueryData<Task[]>(qk.tasks(boardId), (old) =>
      (old ?? []).map((t) =>
        t.id === activeId
          ? { ...t, column_id: targetColumnId, position: newPosition }
          : t
      )
    );

    // Only record an undo action when something actually changed.
    if (targetColumnId !== originalColumnId || newPosition !== originalPosition) {
      recordAction({
        label: `Move task "${activeT.title}"`,
        do: async () => {
          await api.tasks.move(activeId, targetColumnId, newPosition);
          await qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
        },
        undo: async () => {
          await api.tasks.move(activeId, originalColumnId, originalPosition);
          await qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
        },
      });
    }

    moveTask.mutate({ id: activeId, columnId: targetColumnId, position: newPosition });
  };

  const onTaskDragCancel = () => {
    setActiveTask(null);
    qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
  };

  // Use the freshest column order (optimistic updates may have changed it).
  const displayColumns = latestColumns();

  return (
    /*
      Outer DndContext handles COLUMN reordering via the drag handle in each
      column header. It wraps the whole board so the DragOverlay can render
      a copy of the dragged column at the portal root.
    */
    <DndContext
      sensors={columnSensors}
      collisionDetection={closestCenter}
      onDragStart={onColumnDragStart}
      onDragEnd={onColumnDragEnd}
      onDragCancel={onColumnDragCancel}
    >
      <SortableContext
        items={displayColumns.map((c) => c.id)}
        strategy={horizontalListSortingStrategy}
      >
        {/*
          Inner DndContext handles TASK drag-and-drop inside and between columns.
          Nesting is intentional: dnd-kit isolates events between contexts so
          a task drag never triggers the outer column handlers.
        */}
        <DndContext
          sensors={taskSensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={onTaskDragStart}
          onDragOver={onTaskDragOver}
          onDragEnd={onTaskDragEnd}
          onDragCancel={onTaskDragCancel}
        >
          {/*
            Horizontal flex so the board scrolls sideways once the user adds more
            columns than fit on screen. Each column has a fixed width so they
            don't collapse under many siblings.
          */}
          <ScrollArea
            data-testid="kanban-board"
            orientation="horizontal"
            className="h-full min-h-0"
          >
            <div className="flex h-full gap-4 items-stretch pb-1">
              {displayColumns.map((c) => (
                <SortableColumn
                  key={c.id}
                  boardId={boardId}
                  column={c}
                  tasks={grouped[c.id] ?? []}
                />
              ))}
              <div className="flex-none">
                <AddColumnButton boardId={boardId} />
              </div>
            </div>
          </ScrollArea>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} boardId={boardId} dragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </SortableContext>

      {/* Column drag overlay — faded copy of the dragged column card. */}
      <DragOverlay>
        {activeColumn ? (
          <div className="flex-none w-[280px] h-[120px] opacity-80 shadow-2xl">
            <SortableColumn
              boardId={boardId}
              column={activeColumn}
              tasks={grouped[activeColumn.id] ?? []}
              dragOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
