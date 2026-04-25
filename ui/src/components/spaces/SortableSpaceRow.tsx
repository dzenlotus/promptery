import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Board, Space } from "../../lib/types.js";
import { SpaceRow } from "./SpaceRow.js";

interface Props {
  space: Space;
  boards: Board[];
  expanded: boolean;
  onToggle: () => void;
  onCreateBoard: () => void;
  onAfterDeleteBoard: (deletedId: string) => void;
}

/**
 * Wraps SpaceRow in two dnd-kit primitives at once:
 *
 *  - `useSortable` on the space's own id (prefixed `s:`) so the user can
 *    reorder spaces in the top-level Spaces section.
 *  - `useDroppable` on a separate container id (prefixed `c:`) so a board
 *    being dragged from another space can drop onto this row even when
 *    the space's own children list is empty. dnd-kit's collision
 *    detection in the parent DndContext picks the right target.
 *
 * The SpaceRow itself owns the children SortableContext for its boards
 * (in SortableSpaceChildren below) so cross-container board moves work
 * out of the box — it's the canonical MultipleContainers pattern from
 * the kanban board, applied vertically.
 */
export function SortableSpaceRow(props: Props) {
  const sortable = useSortable({
    id: `s:${props.space.id}`,
    data: { kind: "space", spaceId: props.space.id },
  });
  // Empty-space drop target: an empty space has no board sortables so a
  // dragged board has nowhere to land. The container droppable below is
  // what makes "drag onto an empty space" work.
  const { setNodeRef: setContainerRef, isOver: containerOver } = useDroppable({
    id: `c:${props.space.id}`,
    data: { kind: "container", spaceId: props.space.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={(node) => {
        sortable.setNodeRef(node);
        setContainerRef(node);
      }}
      style={style}
      data-container-over={containerOver ? "true" : undefined}
      className={containerOver ? "rounded-md bg-[var(--hover-overlay)]" : ""}
    >
      <SpaceRow
        space={props.space}
        boards={props.boards}
        expanded={props.expanded}
        onToggle={props.onToggle}
        onCreateBoard={props.onCreateBoard}
        onAfterDeleteBoard={props.onAfterDeleteBoard}
        dragHandleProps={{
          ...sortable.attributes,
          ...sortable.listeners,
        }}
      />
    </div>
  );
}
