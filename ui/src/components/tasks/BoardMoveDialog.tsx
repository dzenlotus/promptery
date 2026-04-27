import { useState, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { useBoards } from "../../hooks/useBoards.js";
import { useColumns } from "../../hooks/useColumns.js";
import type { Task } from "../../lib/types.js";
import type { ResolutionHandling } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

interface Props {
  task: Task;
  sourceBoardId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Three-step dialog for moving a task to another board:
 *  Step 1 — pick target board + column.
 *  Step 2 — resolve role/prompt conflicts (shown only when task has a role or
 *            direct prompts).
 *  Step 3 — confirm and execute the move.
 */
export function BoardMoveDialog({ task, sourceBoardId, open, onClose }: Props) {
  const qc = useQueryClient();

  const { data: allBoards = [] } = useBoards();
  // Exclude the task's current board from the target board list.
  const otherBoards = allBoards.filter((b) => b.id !== sourceBoardId);

  const [step, setStep] = useState<1 | 2>(1);
  const [targetBoardId, setTargetBoardId] = useState<string>("");
  const [targetColumnId, setTargetColumnId] = useState<string>("");
  const [roleHandling, setRoleHandling] = useState<ResolutionHandling>("keep");
  const [promptHandling, setPromptHandling] = useState<ResolutionHandling>("keep");
  const [saving, setSaving] = useState(false);

  const { data: targetColumns = [] } = useColumns(targetBoardId || null);

  // Reset state when dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setTargetBoardId(otherBoards[0]?.id ?? "");
    setTargetColumnId("");
    setRoleHandling("keep");
    setPromptHandling("keep");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-select first column when board changes.
  useEffect(() => {
    if (targetColumns.length > 0) {
      setTargetColumnId(targetColumns[0]!.id);
    } else {
      setTargetColumnId("");
    }
  }, [targetColumns, targetBoardId]);

  // Detect conflicts: task has role_id or direct-origin prompts.
  const hasRole = Boolean(task.role_id);
  const directPrompts = task.prompts.filter((p) => p.origin === "direct");
  const hasDirectPrompts = directPrompts.length > 0;
  const hasConflicts = hasRole || hasDirectPrompts;

  const canAdvance = Boolean(targetBoardId && targetColumnId);

  const handleNext = () => {
    if (!canAdvance) return;
    if (hasConflicts) {
      setStep(2);
    } else {
      void submit();
    }
  };

  const submit = async () => {
    if (!targetColumnId) return;
    setSaving(true);
    try {
      await api.tasks.moveWithResolution(task.id, {
        column_id: targetColumnId,
        role_handling: roleHandling,
        prompt_handling: promptHandling,
      });
      toast.success(`Task moved to ${allBoards.find((b) => b.id === targetBoardId)?.name ?? "target board"}`);
      // Invalidate both source and target board task lists.
      qc.invalidateQueries({ queryKey: qk.tasks(sourceBoardId) });
      qc.invalidateQueries({ queryKey: qk.tasks(targetBoardId) });
      qc.invalidateQueries({ queryKey: qk.task(task.id) });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move task");
    } finally {
      setSaving(false);
    }
  };

  const footerStep1 = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleNext}
        disabled={!canAdvance || saving}
      >
        {hasConflicts ? "Next" : "Move"}
        {!hasConflicts && <ArrowRight size={14} />}
      </Button>
    </>
  );

  const footerStep2 = (
    <>
      <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>
        Back
      </Button>
      <Button
        variant="primary"
        onClick={() => void submit()}
        disabled={saving}
      >
        {saving ? "Moving…" : "Confirm move"}
        {!saving && <ArrowRight size={14} />}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Move task #${task.number} to another board`}
      size="md"
      footer={step === 1 ? footerStep1 : footerStep2}
      data-testid="board-move-dialog"
    >
      {step === 1 ? (
        <div className="grid gap-4 py-2">
          <FieldGroup label="Target board">
            <select
              className={selectClass}
              value={targetBoardId}
              onChange={(e) => setTargetBoardId(e.target.value)}
            >
              {otherBoards.length === 0 ? (
                <option value="" disabled>
                  No other boards
                </option>
              ) : (
                otherBoards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))
              )}
            </select>
          </FieldGroup>

          <FieldGroup label="Target column">
            <select
              className={selectClass}
              value={targetColumnId}
              onChange={(e) => setTargetColumnId(e.target.value)}
              disabled={!targetBoardId || targetColumns.length === 0}
            >
              {targetColumns.length === 0 ? (
                <option value="" disabled>
                  {targetBoardId ? "Loading columns…" : "Select a board first"}
                </option>
              ) : (
                targetColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </FieldGroup>
        </div>
      ) : (
        <div className="grid gap-4 py-2">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--hover-overlay)] text-[var(--color-text-muted)] text-[13px]">
            <AlertTriangle
              size={15}
              className="mt-0.5 shrink-0 text-[var(--color-warning, #f59e0b)]"
            />
            <span>
              This task carries context that may not exist on the target board. Choose how to
              handle each:
            </span>
          </div>

          {hasRole && (
            <FieldGroup label={`Role: "${task.role?.name ?? task.role_id}"`}>
              <ResolutionPicker
                value={roleHandling}
                onChange={setRoleHandling}
                label="role"
              />
            </FieldGroup>
          )}

          {hasDirectPrompts && (
            <FieldGroup label={`Direct prompts (${directPrompts.length})`}>
              <ResolutionPicker
                value={promptHandling}
                onChange={setPromptHandling}
                label="prompts"
              />
            </FieldGroup>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ---- Helpers ---------------------------------------------------------------

const selectClass =
  "w-full h-8 px-2.5 rounded-md text-[13px] bg-[var(--hover-overlay)] " +
  "border border-[var(--color-border)] text-[var(--color-text)] " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-0 " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)]">
        {label}
      </label>
      {children}
    </div>
  );
}

interface ResolutionPickerProps {
  value: ResolutionHandling;
  onChange: (v: ResolutionHandling) => void;
  label: string;
}

const RESOLUTION_OPTIONS: { value: ResolutionHandling; label: string; description: string }[] = [
  {
    value: "keep",
    label: "Keep",
    description: "Leave the task's context as-is; the target board inherits nothing.",
  },
  {
    value: "detach",
    label: "Detach",
    description: "Remove from the task after the move.",
  },
  {
    value: "copy_to_target_board",
    label: "Copy to target board",
    description: "Attach to the target board so other tasks there can benefit.",
  },
];

function ResolutionPicker({ value, onChange, label }: ResolutionPickerProps) {
  return (
    <div className="grid gap-1">
      {RESOLUTION_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={cn(
            "flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors",
            value === opt.value
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--hover-overlay)] text-[var(--color-text)] hover:bg-[var(--active-overlay)]"
          )}
        >
          <input
            type="radio"
            name={`resolution-${label}`}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="mt-0.5 shrink-0 accent-white"
          />
          <div className="grid gap-0.5">
            <span className="text-[13px] font-medium">{opt.label}</span>
            <span
              className={cn(
                "text-[11px]",
                value === opt.value ? "text-white/80" : "text-[var(--color-text-muted)]"
              )}
            >
              {opt.description}
            </span>
          </div>
        </label>
      ))}
    </div>
  );
}
