import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBoards } from "../../hooks/useBoards.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import type { Board, Column } from "../../lib/types.js";

interface Props {
  open: boolean;
  selectedCount: number;
  /** The board the source column belongs to — used to pre-select a board. */
  sourceBoardId: string;
  /** The source column id — excluded from target options on same board. */
  sourceColumnId: string;
  onClose: () => void;
  onConfirm: (targetColumnId: string, targetBoardId: string) => void;
}

/**
 * Two-step picker: choose a target board, then a target column within that
 * board.  All boards across the workspace are shown, grouped alphabetically.
 * The source column is excluded from the column list.
 */
export function BulkMoveDialog({
  open,
  selectedCount,
  sourceBoardId,
  sourceColumnId,
  onClose,
  onConfirm,
}: Props) {
  const { data: boards = [] } = useBoards();
  const [selectedBoardId, setSelectedBoardId] = useState<string>(sourceBoardId);
  const [selectedColumnId, setSelectedColumnId] = useState<string>("");

  // Fetch columns for the currently-selected board.
  const { data: targetColumns = [] } = useQuery({
    queryKey: qk.columns(selectedBoardId),
    queryFn: () => api.columns.list(selectedBoardId),
    enabled: Boolean(selectedBoardId),
  });

  const availableColumns = targetColumns.filter((c) => c.id !== sourceColumnId);

  const handleBoardChange = (boardId: string) => {
    setSelectedBoardId(boardId);
    setSelectedColumnId(""); // reset column whenever board changes
  };

  const handleConfirm = () => {
    if (selectedColumnId) {
      onConfirm(selectedColumnId, selectedBoardId);
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) onClose();
  };

  // Reset state when dialog opens.
  const handleOpen = () => {
    setSelectedBoardId(sourceBoardId);
    setSelectedColumnId("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) handleOpen();
        else handleOpenChange(o);
      }}
      title={`Move ${selectedCount} task${selectedCount === 1 ? "" : "s"} to…`}
      size="sm"
      data-testid="bulk-move-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!selectedColumnId}
            onClick={handleConfirm}
          >
            Move
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="text-[12px] font-medium text-[var(--color-text-muted)]">
            Board
          </label>
          <select
            data-testid="bulk-move-board-select"
            value={selectedBoardId}
            onChange={(e) => handleBoardChange(e.target.value)}
            className="w-full h-9 px-3 rounded-md bg-[var(--color-surface-raised)] text-[var(--color-text)] border border-[var(--color-border)] text-[13px] outline-none"
          >
            {[...boards]
              .sort((a: Board, b: Board) => a.name.localeCompare(b.name))
              .map((b: Board) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <label className="text-[12px] font-medium text-[var(--color-text-muted)]">
            Column
          </label>
          {availableColumns.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-subtle)] py-1">
              No available columns on this board.
            </p>
          ) : (
            <select
              data-testid="bulk-move-column-select"
              value={selectedColumnId}
              onChange={(e) => setSelectedColumnId(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-[var(--color-surface-raised)] text-[var(--color-text)] border border-[var(--color-border)] text-[13px] outline-none"
            >
              <option value="">Choose a column…</option>
              {[...availableColumns]
                .sort((a: Column, b: Column) => a.position - b.position)
                .map((c: Column) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>
    </Dialog>
  );
}
