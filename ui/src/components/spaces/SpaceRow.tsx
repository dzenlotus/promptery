import { useState, type HTMLAttributes } from "react";
import { useLocation, useRoute } from "wouter";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, GripVertical, Plus } from "lucide-react";
import type { Board, Space } from "../../lib/types.js";
import { ROUTES } from "../../lib/routes.js";
import { cn } from "../../lib/cn.js";
import { IconButton } from "../ui/IconButton.js";
import { SortableBoardRow } from "./SortableBoardRow.js";
import { SpaceContextMenu } from "./SpaceContextMenu.js";
import { SpaceEditDialog } from "./SpaceEditDialog.js";
import { SpaceDeleteDialog } from "./SpaceDeleteDialog.js";

interface Props {
  space: Space;
  /** Boards belonging to this space, in display order. */
  boards: Board[];
  expanded: boolean;
  onToggle: () => void;
  onCreateBoard: () => void;
  onAfterDeleteBoard: (deletedId: string) => void;
  /**
   * dnd-kit listeners + attributes from the parent SortableSpaceRow. Wired
   * to a small grip handle on the left so dragging the rest of the row
   * (the name button, the toggle, the +) keeps its native click behaviour.
   */
  dragHandleProps?: HTMLAttributes<HTMLElement>;
}

/**
 * One row in the Spaces sidebar tree: a chevron toggle + the space name
 * (clickable, navigates to /s/:id) + a per-space [+] button to create a
 * board inside this space. When expanded, the contained boards render
 * indented below.
 *
 * Only the chevron toggles expand/collapse — clicking the space name
 * itself opens the settings page. This split keeps the two affordances
 * unambiguous, matching the spec (`Click on space name → opens space
 * settings page; click on space toggle ▶/▼ → expand/collapse`).
 */
export function SpaceRow({
  space,
  boards,
  expanded,
  onToggle,
  onCreateBoard,
  onAfterDeleteBoard,
  dragHandleProps,
}: Props) {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ id: string }>("/s/:id");
  const activeSettings = params?.id === space.id;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div data-testid={`space-row-${space.id}`} className="grid">
      <div
        className={cn(
          "group grid items-center gap-1 h-9 px-2 rounded-md",
          dragHandleProps
            ? "grid-cols-[14px_24px_1fr_24px_24px]"
            : "grid-cols-[24px_1fr_24px_24px]",
          activeSettings
            ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
            : "hover:bg-[var(--hover-overlay)] text-[var(--color-text)]"
        )}
      >
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            data-testid={`space-drag-handle-${space.id}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-[var(--color-text-subtle)] inline-flex items-center justify-center"
            aria-label={`Drag ${space.name}`}
          >
            <GripVertical size={12} />
          </span>
        )}
        <IconButton
          label={expanded ? `Collapse ${space.name}` : `Expand ${space.name}`}
          size="sm"
          onClick={onToggle}
          data-testid={`space-toggle-${space.id}`}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>

        <button
          type="button"
          className="text-left truncate text-[13px] tracking-tight cursor-pointer outline-none"
          onClick={() => setLocation(ROUTES.space(space.id))}
          data-testid={`space-name-${space.id}`}
          title={space.description ?? space.name}
        >
          <span className="truncate">{space.name}</span>
          <span className="ml-2 text-[10px] tabular-nums text-[var(--color-text-subtle)]">
            {space.prefix}
          </span>
        </button>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton
            label={`New board in ${space.name}`}
            size="sm"
            onClick={onCreateBoard}
            data-testid={`space-create-board-${space.id}`}
          >
            <Plus size={14} />
          </IconButton>
        </div>

        <div className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity">
          <SpaceContextMenu
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
            disableDelete={space.is_default || boards.length > 0}
          />
        </div>
      </div>

      {expanded && (
        <div className="pl-4 pr-1 grid">
          {boards.length === 0 ? (
            <div className="px-3 py-1.5 text-[11px] text-[var(--color-text-subtle)]">
              No boards in this space yet.
            </div>
          ) : (
            <SortableContext
              items={boards.map((b) => `b:${b.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {boards.map((b, i) => (
                <SortableBoardRow
                  key={b.id}
                  index={i + 1}
                  board={b}
                  spaceId={space.id}
                  onAfterDelete={onAfterDeleteBoard}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}

      <SpaceEditDialog
        space={space}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <SpaceDeleteDialog
        space={space}
        boardCount={boards.length}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
