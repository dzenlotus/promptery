import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRole } from "../../hooks/useRoles.js";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CheckSquare, Plus, Square } from "lucide-react";
import type { Column, Task } from "../../lib/types.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { IconButton } from "../ui/IconButton.js";
import { AttachmentChipRow } from "../common/AttachmentChipRow.js";
import { usePromptGroups } from "../../hooks/usePromptGroups.js";
import { TaskCard } from "./TaskCard.js";
import { TaskDialog } from "../tasks/TaskDialog.js";
import { ColumnContextMenu } from "./ColumnContextMenu.js";
import { ColumnRenameDialog } from "./ColumnRenameDialog.js";
import { ColumnEditDialog } from "./ColumnEditDialog.js";
import { ColumnDeleteDialog } from "./ColumnDeleteDialog.js";
import { ColumnBulkBar } from "./ColumnBulkBar.js";
import { BulkMoveDialog } from "./BulkMoveDialog.js";
import { BulkDeleteDialog } from "./BulkDeleteDialog.js";
import { ScrollArea } from "../ui/ScrollArea.js";

interface Props {
  boardId: string;
  column: Column;
  tasks: Task[];
  /** Optional drag handle rendered at the left of the column header row. */
  dragHandle?: ReactNode;
}

export function KanbanColumn({ boardId, column, tasks, dragHandle }: Props) {
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ── Bulk-select state ──────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
  };

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // ── Bulk delete with undo ──────────────────────────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // Snapshot tasks for undo before we delete them.
    const snapshots = tasks.filter((t) => ids.includes(t.id));

    setBulkDeletePending(true);
    try {
      await Promise.all(ids.map((id) => api.tasks.delete(id)));

      // Remove from react-query cache for this board.
      qc.setQueryData<Task[]>(qk.tasks(boardId), (old) =>
        old?.filter((t) => !ids.includes(t.id)) ?? []
      );

      const count = ids.length;
      exitSelectMode();
      setBulkDeleteOpen(false);

      toast.success(
        `${count} task${count === 1 ? "" : "s"} deleted`,
        {
          action: {
            label: "Undo",
            onClick: () => handleUndoBulkDelete(snapshots, boardId),
          },
        }
      );
    } catch {
      toast.error("Some tasks could not be deleted. Please retry.");
    } finally {
      setBulkDeletePending(false);
    }
  }, [selectedIds, tasks, boardId, qc, exitSelectMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndoBulkDelete = async (snapshots: Task[], targetBoardId: string) => {
    const restored: string[] = [];
    for (const t of snapshots) {
      try {
        await api.tasks.create(targetBoardId, {
          column_id: t.column_id,
          title: t.title,
          description: t.description,
        });
        restored.push(t.title);
      } catch {
        // best-effort — continue with remaining tasks
      }
    }
    // Refetch so the newly-created tasks appear.
    qc.invalidateQueries({ queryKey: qk.tasks(targetBoardId) });

    if (restored.length > 0) {
      toast.success(
        `${restored.length} task${restored.length === 1 ? "" : "s"} restored (new IDs assigned)`
      );
    }
  };

  // ── Bulk move ──────────────────────────────────────────────────────────────
  const handleBulkMove = useCallback(
    async (targetColumnId: string, targetBoardId: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;

      setBulkMoveOpen(false);

      const toastId = toast.loading(`Moving ${ids.length} task${ids.length === 1 ? "" : "s"}…`);
      let moved = 0;
      let failed = 0;

      for (const id of ids) {
        try {
          await api.tasks.move(id, targetColumnId, /* append to end */ 1e9 - moved);
          moved++;
        } catch {
          failed++;
        }
      }

      // Invalidate source board tasks (and target board if different).
      qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
      if (targetBoardId !== boardId) {
        qc.invalidateQueries({ queryKey: qk.tasks(targetBoardId) });
      }

      exitSelectMode();

      if (failed === 0) {
        toast.success(`${moved} task${moved === 1 ? "" : "s"} moved`, { id: toastId });
      } else {
        toast.warning(
          `${moved} moved, ${failed} failed`,
          { id: toastId }
        );
      }
    },
    [selectedIds, boardId, qc, exitSelectMode]
  );

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  // Column detail drives the role chip + prompt chips under the title. The
  // base Column row from the board listing carries only role_id, not the
  // joined role payload, so we fetch on demand.
  const { data: detail } = useQuery({
    queryKey: qk.column(column.id),
    queryFn: () => api.columns.get(column.id),
    // The column list endpoint doesn't include role+prompts, so the detail
    // fetch is the only way to show them. Keep it running; small payload.
    staleTime: 30_000,
  });

  const role = detail?.role ?? null;
  // Hide direct column prompts the column-role already provides (the role
  // chip above implies them) and collapse fully-covered groups into a
  // group chip via AttachmentChipRow below.
  const { data: roleDetail } = useRole(role?.id ?? null);
  const rolePromptIds = useMemo(
    () => new Set((roleDetail?.prompts ?? []).map((p) => p.id)),
    [roleDetail]
  );
  const directPrompts = detail?.prompts ?? [];
  const { data: allGroups = [] } = usePromptGroups();

  return (
    <div
      data-testid={`kanban-column-${column.id}`}
      data-column-name={column.name}
      className="group/col relative grid grid-rows-[auto_1fr] gap-3 h-full min-h-0 rounded-xl p-3 border border-[var(--color-border)] bg-transparent"
    >
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          {dragHandle ?? null}
          <div className="flex items-baseline gap-2 min-w-0 flex-1">
            <h3 className="text-[13px] font-medium tracking-tight truncate text-[var(--color-text-muted)]">
              {column.name}
            </h3>
            <span className="text-[11px] tabular-nums text-[var(--color-text-subtle)]">
              {tasks.length}
            </span>
          </div>

          {role ? (
            <span
              data-testid={`column-role-chip-${column.id}`}
              title={`Column role: ${role.name}`}
              className="min-w-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] bg-[var(--hover-overlay)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
            >
              <span
                aria-hidden
                className="h-1 w-1 rounded-full shrink-0"
                style={{ backgroundColor: role.color || "#7a746a" }}
              />
              <span className="truncate">{role.name}</span>
            </span>
          ) : null}

          <div className="flex items-center gap-0.5 shrink-0">
            <IconButton
              label={selectMode ? "Exit select mode" : "Select tasks"}
              size="sm"
              onClick={selectMode ? exitSelectMode : enterSelectMode}
              className={selectMode ? "text-[var(--color-accent)]" : ""}
            >
              {selectMode ? <CheckSquare size={14} /> : <Square size={14} />}
            </IconButton>
            <IconButton label="Add task" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
            </IconButton>
            <ColumnContextMenu
              onRename={() => setRenameOpen(true)}
              onEdit={() => setEditOpen(true)}
              onDelete={() => setDeleteOpen(true)}
            />
          </div>
        </div>

        <AttachmentChipRow
          prompts={directPrompts}
          allGroups={allGroups}
          hiddenPromptIds={rolePromptIds}
          testId={`column-prompt-chips-${column.id}`}
        />
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {/* Radix Viewport owns the native `overflow: auto`, so dnd-kit's
            droppable ref must live there — that's the element whose
            scroll-offset dnd-kit consults for auto-scroll while dragging. */}
        <ScrollArea
          viewportRef={setNodeRef}
          className={`min-h-[40px] rounded-md transition-colors pr-2 -mr-2 ${
            isOver ? "bg-[var(--hover-overlay)]" : ""
          } ${selectMode ? "pb-14" : ""}`}
        >
          <div className="grid auto-rows-max gap-2.5">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-[12px] text-[var(--color-text-subtle)]">
                Drop tasks here
              </div>
            ) : (
              tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  boardId={boardId}
                  selectMode={selectMode}
                  selected={selectedIds.has(t.id)}
                  onToggleSelected={() => toggleSelected(t.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </SortableContext>

      {selectMode && (
        <ColumnBulkBar
          selectedCount={selectedIds.size}
          onMoveClick={() => setBulkMoveOpen(true)}
          onDeleteClick={() => setBulkDeleteOpen(true)}
          onCancel={exitSelectMode}
        />
      )}

      <TaskDialog
        mode="create"
        boardId={boardId}
        columnId={column.id}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <ColumnRenameDialog
        boardId={boardId}
        column={column}
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
      />
      <ColumnEditDialog
        columnId={column.id}
        boardId={boardId}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ColumnDeleteDialog
        boardId={boardId}
        column={column}
        taskCount={tasks.length}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />

      <BulkMoveDialog
        open={bulkMoveOpen}
        selectedCount={selectedIds.size}
        sourceBoardId={boardId}
        sourceColumnId={column.id}
        onClose={() => setBulkMoveOpen(false)}
        onConfirm={handleBulkMove}
      />
      <BulkDeleteDialog
        open={bulkDeleteOpen}
        selectedCount={selectedIds.size}
        isPending={bulkDeletePending}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
