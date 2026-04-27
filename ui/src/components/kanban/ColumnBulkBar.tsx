import { Move, Trash2, X } from "lucide-react";
import { Button } from "../ui/Button.js";

interface Props {
  selectedCount: number;
  onMoveClick: () => void;
  onDeleteClick: () => void;
  onCancel: () => void;
}

/**
 * Floating action bar that appears at the bottom of a column when select mode
 * is active. Anchored inside the column container (position: absolute) so it
 * doesn't escape the column boundary.
 */
export function ColumnBulkBar({ selectedCount, onMoveClick, onDeleteClick, onCancel }: Props) {
  return (
    <div
      data-testid="column-bulk-bar"
      className="absolute bottom-3 inset-x-3 z-10 flex items-center gap-2 px-3 py-2 rounded-xl liquid-glass-strong gradient-border shadow-[var(--shadow-lg)]"
    >
      <span className="text-[12px] font-medium text-[var(--color-text-muted)] shrink-0">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-1.5 ml-auto">
        <Button
          size="sm"
          variant="secondary"
          disabled={selectedCount === 0}
          onClick={onMoveClick}
          aria-label="Move selected tasks"
        >
          <Move size={12} />
          Move to…
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={selectedCount === 0}
          onClick={onDeleteClick}
          aria-label="Delete selected tasks"
        >
          <Trash2 size={12} />
          Delete
        </Button>
        <button
          onClick={onCancel}
          aria-label="Cancel selection"
          title="Cancel"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-text)] transition-colors duration-150"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
