import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Board } from "../../lib/types.js";
import { BoardRow } from "../boards/BoardRow.js";

interface Props {
  index: number;
  board: Board;
  /** The space the board currently lives in. Carried in the dnd `data`
   *  payload so the DnD handler in SpacesList can tell whether a drop is
   *  intra-container (reorder) or cross-container (move-to-space). */
  spaceId: string;
  onAfterDelete: (deletedId: string) => void;
}

export function SortableBoardRow({ index, board, spaceId, onAfterDelete }: Props) {
  const sortable = useSortable({
    id: `b:${board.id}`,
    data: { kind: "board", boardId: board.id, spaceId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <BoardRow index={index} board={board} onAfterDelete={onAfterDelete} />
    </div>
  );
}
