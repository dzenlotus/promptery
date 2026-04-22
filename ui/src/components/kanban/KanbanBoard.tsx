import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
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
import { arrayMove } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import type { Column, Task } from "../../lib/types.js";
import { qk } from "../../lib/query.js";
import { useMoveTask } from "../../hooks/useTasks.js";
import { KanbanColumn } from "./KanbanColumn.js";
import { TaskCard } from "./TaskCard.js";

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
 * Based on dnd-kit's canonical MultipleContainers example.
 *
 * - Custom collision detection: `pointerWithin` first (accurate for the
 *   cross-column case — tells us which container the cursor is currently over),
 *   then `closestCenter` restricted to that container's tasks (so we pick the
 *   right insertion slot). Falls back to `rectIntersection` + a cached last-over
 *   id so the card doesn't "lose" the target while crossing an empty gap.
 * - `onDragOver` is what actually moves the task between columns during the
 *   drag — we write the new column_id + position into the react-query cache
 *   so that dnd-kit's sortable immediately reflects the new layout.
 * - `onDragEnd` finalises the slot with `arrayMove` + `positionBetween` and
 *   fires the server mutation.
 * - DragOverlay keeps its default drop animation to avoid the "snap-back then
 *   jump to new slot" flicker we had without it.
 */
export function KanbanBoard({ boardId, columns, tasks }: Props) {
  const qc = useQueryClient();
  const moveTask = useMoveTask(boardId);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const grouped = useMemo(() => tasksByColumn(tasks, columns), [tasks, columns]);

  const getLatest = useCallback(
    () => qc.getQueryData<Task[]>(qk.tasks(boardId)) ?? tasks,
    [qc, boardId, tasks]
  );

  const columnIds = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);
  const lastOverId = useRef<string | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      // If the pointer is over a column directly, prefer closestCenter among
      // that column's tasks — this is what makes cross-column drops land in
      // the right slot instead of always at the bottom.
      const pointerCollisions = pointerWithin(args);
      const intersections =
        pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);

      let overId = getFirstCollision(intersections, "id") as string | null;

      if (overId != null) {
        if (columnIds.has(overId)) {
          const latest = getLatest();
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

      // No intersection — keep the last target so the UI doesn't drop the card
      // through a gap between columns.
      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = String(args.active.id);
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [columnIds, getLatest]
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  });

  const onDragStart = (event: DragStartEvent) => {
    const t = getLatest().find((x) => x.id === String(event.active.id));
    if (t) setActiveTask(t);
    lastOverId.current = null;
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const latest = getLatest();
    const activeT = latest.find((t) => t.id === activeId);
    if (!activeT) return;

    const overTask = latest.find((t) => t.id === overId);
    const overColumn = columns.find((c) => c.id === overId);
    const targetColumnId = overTask?.column_id ?? overColumn?.id;
    if (!targetColumnId) return;

    // Same-column: let dnd-kit's sortable handle the visual reorder.
    if (activeT.column_id === targetColumnId) return;

    // Cross-column: migrate the task in the cache.
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

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) {
      qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const latest = getLatest();
    const activeT = latest.find((t) => t.id === activeId);
    if (!activeT) return;

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

    moveTask.mutate({ id: activeId, columnId: targetColumnId, position: newPosition });
  };

  const onDragCancel = () => {
    setActiveTask(null);
    qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="grid grid-cols-4 gap-4 h-full min-h-0">
        {columns.map((c) => (
          <KanbanColumn key={c.id} boardId={boardId} column={c} tasks={grouped[c.id] ?? []} />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} boardId={boardId} dragOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
