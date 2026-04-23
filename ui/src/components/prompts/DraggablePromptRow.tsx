import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";

/** Drag id prefix used for prompt rows in the sidebar. The consumer
 *  (PromptGroupView's DndContext) matches on this prefix to distinguish
 *  cross-container drops from in-place sort events. */
export const SIDEBAR_PROMPT_DRAG_PREFIX = "sidebar-prompt:";

/**
 * Thin drag wrapper for a sidebar prompt row. The visual during the drag
 * is rendered by a `DragOverlay` at the context level (a portal to body)
 * — this wrapper only marks the element as draggable and fades the
 * original in place, so the sidebar's overflow clipping doesn't crop the
 * moving chip.
 *
 * Only meaningful inside a DndContext — when rendered outside one the
 * hook no-ops and the wrapper is transparent.
 */
export function DraggablePromptRow({
  promptId,
  children,
}: {
  promptId: string;
  children: ReactNode;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `${SIDEBAR_PROMPT_DRAG_PREFIX}${promptId}`,
    data: { type: "sidebar-prompt", promptId },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // No transform on the original — DragOverlay renders the travelling
      // visual. We just dim the source so the user sees which row they
      // picked up and the placeholder doesn't crop at the sidebar edge.
      style={{ opacity: isDragging ? 0.35 : undefined }}
    >
      {children}
    </div>
  );
}
