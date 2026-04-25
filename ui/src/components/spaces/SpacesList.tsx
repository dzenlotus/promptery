import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useBoards } from "../../hooks/useBoards.js";
import {
  useMoveBoardToSpace,
  useReorderBoards,
  useReorderSpaces,
  useSpaces,
} from "../../hooks/useSpaces.js";
import { useExpandedSpaces } from "../../hooks/useExpandedSpaces.js";
import { ROUTES } from "../../lib/routes.js";
import { qk } from "../../lib/query.js";
import { IconButton } from "../ui/IconButton.js";
import { SidebarSection } from "../../layout/SidebarSection.js";
import { BoardRow } from "../boards/BoardRow.js";
import { SortableSpaceRow } from "./SortableSpaceRow.js";
import { SortableBoardRow } from "./SortableBoardRow.js";
import { SpaceCreateDialog } from "./SpaceCreateDialog.js";
import { BoardCreateDialog } from "./BoardCreateDialog.js";
import type { Board, Space } from "../../lib/types.js";

/**
 * The kanban sidebar — Spaces section above an orphan-Boards section.
 *
 * Hosts a DndContext that supports three drags:
 *
 *  1. **Reorder a space** in the top-level Spaces list (drag handle on
 *     each custom space row).
 *  2. **Reorder a board** within its current space.
 *  3. **Move a board to a different space** by dragging it onto another
 *     space row (the row, the chevron, or any board in that space —
 *     dnd-kit's collision detection picks the right slot).
 *
 * The default-space "Boards" section is a drop target for boards but is
 * not itself reorderable in the spaces list — it stays pinned at the
 * bottom per the v0.3.0 spec.
 *
 * DnD ID prefixes guarantee a globally-unique sortable id per item even
 * when a space and a board happen to share an id:
 *   `s:<spaceId>` — sortable space row
 *   `b:<boardId>` — sortable board row
 *   `c:<spaceId>` — droppable container (handles drops onto an empty space)
 *
 * Position math is `(prev + next) / 2` for cross-space drops (a single
 * write keeps things cheap) and a full renumber 1..N for intra-space
 * reorders (matches the boards/reorder server endpoint, prevents
 * floating-point drift over many drags).
 */
export function SpacesList() {
  const { data: boards = [] } = useBoards();
  const { data: spaces = [] } = useSpaces();
  const { isExpanded, toggle, setExpanded } = useExpandedSpaces();
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ id: string }>("/board/:id");
  const activeBoardId = params?.id;
  const qc = useQueryClient();

  const reorderSpacesMutation = useReorderSpaces();
  const reorderBoardsMutation = useReorderBoards();
  const moveBoardMutation = useMoveBoardToSpace();

  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [boardCreateTarget, setBoardCreateTarget] = useState<{
    spaceId: string | null;
    spaceName?: string;
  } | null>(null);

  const defaultSpace = useMemo(
    () => spaces.find((s) => s.is_default) ?? null,
    [spaces]
  );
  const customSpaces = useMemo(
    () =>
      spaces
        .filter((s) => !s.is_default)
        .sort((a, b) => a.position - b.position || a.created_at - b.created_at),
    [spaces]
  );
  const customSpaceIds = useMemo(
    () => customSpaces.map((s) => `s:${s.id}`),
    [customSpaces]
  );
  const boardsBySpace = useMemo(() => {
    const map = new Map<string, Board[]>();
    for (const b of boards) {
      const arr = map.get(b.space_id) ?? [];
      arr.push(b);
      map.set(b.space_id, arr);
    }
    // Sort each space's boards by position (then created_at) so the UI
    // matches the server's listBoards order. The list endpoint already
    // sorts globally; this re-sort is defensive against optimistic-update
    // ordering quirks.
    for (const arr of map.values()) {
      arr.sort((a, b) => a.position - b.position || a.created_at - b.created_at);
    }
    return map;
  }, [boards]);
  const orphanBoards = defaultSpace
    ? boardsBySpace.get(defaultSpace.id) ?? []
    : boards;

  // ── DnD state ──────────────────────────────────────────────────────────
  const [activeSpace, setActiveSpace] = useState<Space | null>(null);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const lastOverId = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      // pointerWithin is precise for cross-container moves — it tells us
      // which container the cursor is over. closestCenter then picks the
      // exact insertion slot among that container's children.
      const pointerCollisions = pointerWithin(args);
      const intersections =
        pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
      const overId = getFirstCollision(intersections, "id") as string | null;
      if (overId != null) {
        lastOverId.current = String(overId);
        return [{ id: overId }];
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    []
  );

  // Resolve a dnd id back to the (spaceId, kind, payload). Returns null if
  // the id is not one of ours (defensive — the prefix scheme should make
  // this impossible).
  type Resolved =
    | { kind: "space"; spaceId: string }
    | { kind: "board"; boardId: string; spaceId: string }
    | { kind: "container"; spaceId: string }
    | null;
  const resolve = useCallback(
    (raw: string | number | undefined | null): Resolved => {
      if (typeof raw !== "string") return null;
      if (raw.startsWith("s:")) {
        return { kind: "space", spaceId: raw.slice(2) };
      }
      if (raw.startsWith("c:")) {
        return { kind: "container", spaceId: raw.slice(2) };
      }
      if (raw.startsWith("b:")) {
        const boardId = raw.slice(2);
        const board = boards.find((b) => b.id === boardId);
        if (!board) return null;
        return { kind: "board", boardId, spaceId: board.space_id };
      }
      return null;
    },
    [boards]
  );

  const onDragStart = (e: DragStartEvent) => {
    const r = resolve(e.active.id);
    if (!r) return;
    if (r.kind === "space") {
      setActiveSpace(spaces.find((s) => s.id === r.spaceId) ?? null);
    } else if (r.kind === "board") {
      setActiveBoard(boards.find((b) => b.id === r.boardId) ?? null);
    }
    lastOverId.current = null;
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;

    const a = resolve(active.id);
    const o = resolve(over.id);
    if (!a || !o) return;

    // Auto-expand a collapsed space when the user hovers a board over it
    // — otherwise dragging into a collapsed space is a dead end.
    if (a.kind === "board") {
      if (o.kind === "container" || o.kind === "space") {
        setExpanded(o.spaceId, true);
      }
    }

    // Cross-container board drag: optimistically reassign space_id in the
    // cache so the SortableContext sees the board in the new container
    // immediately; the actual position is finalised on dragEnd.
    if (a.kind === "board" && o.kind !== "space") {
      const targetSpaceId =
        o.kind === "container" ? o.spaceId : o.spaceId;
      if (a.spaceId !== targetSpaceId) {
        qc.setQueryData<Board[]>(qk.boards, (old) => {
          if (!old) return old;
          return old.map((b) =>
            b.id === a.boardId ? { ...b, space_id: targetSpaceId } : b
          );
        });
      }
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const wasActiveSpace = activeSpace;
    const wasActiveBoard = activeBoard;
    setActiveSpace(null);
    setActiveBoard(null);

    const { active, over } = e;
    if (!over) {
      // Cancelled — revert any optimistic cross-container update by
      // refetching the boards list.
      qc.invalidateQueries({ queryKey: qk.boards });
      return;
    }

    const a = resolve(active.id);
    const o = resolve(over.id);
    if (!a || !o) {
      qc.invalidateQueries({ queryKey: qk.boards });
      return;
    }

    if (a.kind === "space" && o.kind === "space" && wasActiveSpace) {
      // Reorder spaces in the top-level list.
      const oldIdx = customSpaces.findIndex((s) => s.id === a.spaceId);
      const newIdx = customSpaces.findIndex((s) => s.id === o.spaceId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

      const newOrder = arrayMove(customSpaces, oldIdx, newIdx);
      // Optimistic — write the new order into the cache so the row
      // settles in place before the server roundtrip.
      qc.setQueryData<Space[]>(qk.spaces, (old) => {
        if (!old) return old;
        const byId = new Map(newOrder.map((s, i) => [s.id, i]));
        return [...old].sort((x, y) => {
          // Default space stays where it was relative to its old position
          // — only the custom spaces are reordered.
          if (x.is_default && !y.is_default) return 1;
          if (!x.is_default && y.is_default) return -1;
          return (byId.get(x.id) ?? 0) - (byId.get(y.id) ?? 0);
        });
      });

      // Server side: send the full id list including the default space at
      // the end. The repo renumbers all positions; default-space gets the
      // last ordinal.
      const ids = [
        ...newOrder.map((s) => s.id),
        ...(defaultSpace ? [defaultSpace.id] : []),
      ];
      reorderSpacesMutation.mutate(ids);
      return;
    }

    if (a.kind === "board" && wasActiveBoard) {
      // Determine the target space and the target board (if dropped on
      // another board).
      let targetSpaceId: string;
      let targetBoardId: string | null = null;
      if (o.kind === "board") {
        targetSpaceId = o.spaceId;
        targetBoardId = o.boardId;
      } else if (o.kind === "container") {
        targetSpaceId = o.spaceId;
      } else {
        targetSpaceId = o.spaceId;
      }

      const sourceSpaceId = wasActiveBoard.space_id;
      const targetBoards = (boardsBySpace.get(targetSpaceId) ?? []).filter(
        (b) => b.id !== a.boardId
      );

      if (sourceSpaceId === targetSpaceId) {
        // Intra-space reorder: arrayMove + bulk reorder endpoint.
        const ordered = [
          ...(boardsBySpace.get(targetSpaceId) ?? []).map((b) => b.id),
        ];
        const fromIdx = ordered.indexOf(a.boardId);
        const toIdx =
          targetBoardId !== null
            ? ordered.indexOf(targetBoardId)
            : ordered.length - 1;
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
          qc.invalidateQueries({ queryKey: qk.boards });
          return;
        }
        const newOrder = arrayMove(ordered, fromIdx, toIdx);
        // Optimistic position rewrite locally so the row settles before
        // the server confirms.
        qc.setQueryData<Board[]>(qk.boards, (old) => {
          if (!old) return old;
          const posByid = new Map(newOrder.map((id, i) => [id, i + 1]));
          return old.map((b) =>
            posByid.has(b.id)
              ? { ...b, position: posByid.get(b.id) as number }
              : b
          );
        });
        reorderBoardsMutation.mutate({
          spaceId: targetSpaceId,
          ids: newOrder,
        });
      } else {
        // Cross-space move: place the board between the two boards
        // adjacent to the drop site (or append to end if the drop landed
        // on the container itself).
        let position: number | undefined;
        if (targetBoardId !== null) {
          const overIdx = targetBoards.findIndex((b) => b.id === targetBoardId);
          const before = targetBoards[overIdx - 1];
          const overBoard = targetBoards[overIdx];
          if (before && overBoard) {
            position = (before.position + overBoard.position) / 2;
          } else if (overBoard) {
            position = overBoard.position / 2;
          }
        }
        moveBoardMutation.mutate({
          boardId: a.boardId,
          spaceId: targetSpaceId,
          position,
        });
      }
      return;
    }
  };

  const onDragCancel = () => {
    setActiveSpace(null);
    setActiveBoard(null);
    qc.invalidateQueries({ queryKey: qk.boards });
  };

  const handleAfterDelete = (deletedId: string) => {
    if (deletedId !== activeBoardId) return;
    const next = boards.find((x) => x.id !== deletedId);
    setLocation(next ? ROUTES.board(next.id) : ROUTES.home, { replace: true });
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
      <div className="grid grid-rows-[auto_1fr] min-h-0 h-full">
        {/* Spaces section */}
        <SidebarSection
          label="Spaces"
          action={
            <IconButton
              label="New space"
              size="sm"
              onClick={() => setCreateSpaceOpen(true)}
              data-testid="sidebar-create-space"
            >
              <Plus size={14} />
            </IconButton>
          }
        >
          {customSpaces.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">
              No spaces yet. Create one to group related boards together.
            </div>
          ) : (
            <SortableContext
              items={customSpaceIds}
              strategy={verticalListSortingStrategy}
            >
              {customSpaces.map((space) => (
                <SortableSpaceRow
                  key={space.id}
                  space={space}
                  boards={boardsBySpace.get(space.id) ?? []}
                  expanded={isExpanded(space.id)}
                  onToggle={() => toggle(space.id)}
                  onCreateBoard={() =>
                    setBoardCreateTarget({
                      spaceId: space.id,
                      spaceName: space.name,
                    })
                  }
                  onAfterDeleteBoard={handleAfterDelete}
                />
              ))}
            </SortableContext>
          )}
        </SidebarSection>

        {/* Boards (default space) section */}
        <SidebarSection
          label="Boards"
          action={
            <IconButton
              label="New board"
              size="sm"
              onClick={() =>
                setBoardCreateTarget({
                  spaceId: defaultSpace?.id ?? null,
                })
              }
              data-testid="sidebar-create-board"
            >
              <Plus size={14} />
            </IconButton>
          }
        >
          {defaultSpace ? (
            <DefaultBoardsContainer
              spaceId={defaultSpace.id}
              boards={orphanBoards}
              onAfterDelete={handleAfterDelete}
            />
          ) : (
            // Pre-migration safety net: spaces should always be present, but
            // if they aren't yet, show plain board rows.
            orphanBoards.map((b, i) => (
              <BoardRow
                key={b.id}
                index={i + 1}
                board={b}
                onAfterDelete={handleAfterDelete}
              />
            ))
          )}
        </SidebarSection>

        <SpaceCreateDialog
          open={createSpaceOpen}
          onClose={() => setCreateSpaceOpen(false)}
        />
        <BoardCreateDialog
          open={boardCreateTarget !== null}
          onClose={() => setBoardCreateTarget(null)}
          spaceId={boardCreateTarget?.spaceId ?? null}
          spaceName={boardCreateTarget?.spaceName}
        />
      </div>

      <DragOverlay>
        {activeBoard ? (
          <div className="rounded-md bg-[var(--color-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.35)] px-2">
            <BoardRow
              index={0}
              board={activeBoard}
              onAfterDelete={() => {}}
            />
          </div>
        ) : activeSpace ? (
          <div className="rounded-md bg-[var(--color-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.35)] px-2 py-1.5">
            <span className="text-[13px] font-medium tracking-tight">
              {activeSpace.name}
            </span>
            <span className="ml-2 text-[10px] tabular-nums text-[var(--color-text-subtle)]">
              {activeSpace.prefix}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * The default space's boards rendered without a "Default" wrapper. It IS
 * a drop target for cross-space board drags (any space can receive
 * boards), but the section itself is not in the top-level spaces sortable
 * — it stays pinned at the bottom per the v0.3.0 spec.
 */
function DefaultBoardsContainer({
  spaceId,
  boards,
  onAfterDelete,
}: {
  spaceId: string;
  boards: Board[];
  onAfterDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `c:${spaceId}`,
    data: { kind: "container", spaceId },
  });

  if (boards.length === 0) {
    return (
      <div
        ref={setNodeRef}
        className={`px-3 py-3 text-[12px] text-[var(--color-text-subtle)] rounded-md transition-colors ${
          isOver ? "bg-[var(--hover-overlay)]" : ""
        }`}
      >
        No boards here yet. Create one or use a space above to organise.
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`grid rounded-md transition-colors ${
        isOver ? "bg-[var(--hover-overlay)]" : ""
      }`}
    >
      <SortableContext
        items={boards.map((b) => `b:${b.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {boards.map((b, i) => (
          <SortableBoardRow
            key={b.id}
            index={i + 1}
            board={b}
            spaceId={spaceId}
            onAfterDelete={onAfterDelete}
          />
        ))}
      </SortableContext>
    </div>
  );
}

// Re-export Space for callers that import only the list module.
export type { Space };
