import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { Input } from "../ui/Input.js";
import { MilkdownEditor } from "../editor/MilkdownEditor.js";
import { RoleSelector } from "./RoleSelector.js";
import { TaskPromptsEditor } from "./TaskPromptsEditor.js";
import { TaskEffectiveContext } from "./TaskEffectiveContext.js";
import { TaskActivityLog } from "./TaskActivityLog.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { usePrompts } from "../../hooks/usePrompts.js";
import { usePromptGroups } from "../../hooks/usePromptGroups.js";
import { useRoles, useRole } from "../../hooks/useRoles.js";
import { useTask } from "../../hooks/useTasks.js";
import type { Task } from "../../lib/types.js";

type Props =
  | {
      mode: "create";
      boardId: string;
      columnId: string;
      task?: undefined;
      open: boolean;
      onClose: () => void;
    }
  | {
      mode: "edit";
      boardId: string;
      columnId?: undefined;
      task: Task;
      open: boolean;
      onClose: () => void;
    };

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)]">
        {label}
        {required ? (
          <span className="ml-0.5 text-[var(--color-danger)]">*</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function TaskDialog(props: Props) {
  const { open, onClose, mode, boardId } = props;
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: allPrompts = [] } = usePrompts();
  const { data: allRoles = [] } = useRoles();
  const { data: allGroups = [] } = usePromptGroups();

  const editingId = mode === "edit" ? props.task.id : undefined;
  const { data: loadedTask } = useTask(editingId);
  const editTask = mode === "edit" ? (loadedTask ?? props.task) : null;

  // --- Local staged state ---------------------------------------------------
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [localRoleId, setLocalRoleId] = useState<string | null>(null);
  const [localDirectIds, setLocalDirectIds] = useState<string[]>([]);
  const [localDisabledIds, setLocalDisabledIds] = useState<string[]>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);

  // Reset local state whenever the dialog opens or switches to a different
  // task. We intentionally depend on loadedTask.updated_at as well so that a
  // refetch after open picks up the server-side baseline — otherwise a stale
  // snapshot passed in props.task would leave the dirty check comparing
  // against outdated values.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && editTask) {
      setTitle(editTask.title);
      setDescription(editTask.description);
      setLocalRoleId(editTask.role_id ?? null);
      setLocalDirectIds(
        editTask.prompts.filter((p) => p.origin === "direct").map((p) => p.id)
      );
      setLocalDisabledIds(editTask.disabled_prompts ?? []);
    } else if (mode === "create") {
      setTitle("");
      setDescription("");
      setLocalRoleId(null);
      setLocalDirectIds([]);
      setLocalDisabledIds([]);
    }
    setEditorKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, editingId, editTask?.updated_at]);

  // --- Derived baselines for dirty check ------------------------------------
  const baseline = useMemo(() => {
    if (mode === "edit" && editTask) {
      return {
        title: editTask.title,
        description: editTask.description,
        roleId: editTask.role_id ?? null,
        directIds: editTask.prompts
          .filter((p) => p.origin === "direct")
          .map((p) => p.id),
        disabledIds: editTask.disabled_prompts ?? [],
      };
    }
    return {
      title: "",
      description: "",
      roleId: null,
      directIds: [] as string[],
      disabledIds: [] as string[],
    };
  }, [mode, editTask]);

  // --- Inherited prompts preview --------------------------------------------
  // Fetch the selected role's relations so switching the role (in either
  // create or edit mode) surfaces its default prompts as inherited chips
  // immediately — without having to close and reopen the dialog.
  const { data: selectedRoleFull } = useRole(localRoleId);
  const selectedRoleName =
    allRoles.find((r) => r.id === localRoleId)?.name ?? null;
  const inheritedPrompts = selectedRoleFull?.prompts ?? [];

  // --- Dirty + save guards --------------------------------------------------
  const isDirty = useMemo(() => {
    if (mode === "create") {
      // Save button is really a "Create" button here — always enabled (pending
      // title validation) since nothing has been persisted yet.
      return title.trim().length > 0;
    }
    return (
      title !== baseline.title ||
      description !== baseline.description ||
      localRoleId !== baseline.roleId ||
      !arraysEqual(localDirectIds, baseline.directIds) ||
      !arraysEqual(localDisabledIds, baseline.disabledIds)
    );
  }, [
    mode,
    title,
    description,
    localRoleId,
    localDirectIds,
    localDisabledIds,
    baseline,
  ]);

  const disabled = !title.trim() || saving || (mode === "edit" && !isDirty);

  // --- Submit ---------------------------------------------------------------
  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (mode === "create") {
        const created = await api.tasks.create(boardId, {
          column_id: props.columnId,
          title: trimmed,
          description,
        });
        if (localRoleId) {
          await api.tasks.setRole(created.id, localRoleId);
        }
        // Attachments run sequentially to preserve insertion order.
        for (const pid of localDirectIds) {
          await api.tasks.addPrompt(created.id, pid);
        }
        // Per-task disable overrides — only the inherited prompts the user
        // toggled off via the inherited-chip click. In create mode these can
        // exist if the user picked a role with prompts and then disabled
        // some of them before saving.
        for (const pid of localDisabledIds) {
          await api.tasks.setPromptOverride(created.id, pid, 0);
        }
        toast.success("Task created");
      } else {
        const id = props.task.id;
        const patch: { title?: string; description?: string } = {};
        if (trimmed !== baseline.title) patch.title = trimmed;
        if (description !== baseline.description) patch.description = description;
        if (Object.keys(patch).length > 0) {
          await api.tasks.update(id, patch);
        }
        if (localRoleId !== baseline.roleId) {
          await api.tasks.setRole(id, localRoleId);
        }
        const origSet = new Set(baseline.directIds);
        const localSet = new Set(localDirectIds);
        for (const removed of baseline.directIds) {
          if (!localSet.has(removed)) {
            await api.tasks.removePrompt(id, removed);
          }
        }
        for (const added of localDirectIds) {
          if (!origSet.has(added)) {
            await api.tasks.addPrompt(id, added);
          }
        }
        // Diff per-task prompt overrides — additions become PUT enabled=0,
        // removals become DELETE. Skipped when nothing changed in this set.
        const origDisabled = new Set(baseline.disabledIds);
        const localDisabled = new Set(localDisabledIds);
        for (const removed of baseline.disabledIds) {
          if (!localDisabled.has(removed)) {
            await api.tasks.deletePromptOverride(id, removed);
          }
        }
        for (const added of localDisabledIds) {
          if (!origDisabled.has(added)) {
            await api.tasks.setPromptOverride(id, added, 0);
          }
        }
        // TODO: persist ordering when the backend exposes a reorder endpoint.
        // Today we accept visual ordering within the session; server-side
        // position is driven by insertion order of addPrompt calls.
        toast.success("Task saved");
      }
      qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
      if (editingId) qc.invalidateQueries({ queryKey: qk.task(editingId) });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle = mode === "create" ? "Create task" : `Edit task ${props.task.slug}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={dialogTitle}
      size="lg"
      data-testid={`task-dialog-${mode}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={disabled}>
            {saving ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 py-2">
        <Field label="Title" required>
          <Input
            autoFocus
            required
            aria-required="true"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            placeholder="What needs to be done?"
          />
        </Field>

        <Field label="Role">
          <RoleSelector
            selectedRoleId={localRoleId}
            onChange={setLocalRoleId}
            roles={allRoles}
          />
        </Field>

        <Field label="Prompts">
          <TaskPromptsEditor
            allPrompts={allPrompts}
            allGroups={allGroups}
            inheritedItems={inheritedPrompts}
            directIds={localDirectIds}
            onDirectChange={setLocalDirectIds}
            disabledPromptIds={localDisabledIds}
            onToggleDisabled={(promptId, currentlyDisabled) => {
              setLocalDisabledIds((prev) =>
                currentlyDisabled
                  ? prev.filter((id) => id !== promptId)
                  : [...prev, promptId]
              );
            }}
            roleName={selectedRoleName}
            onOpenPrompt={
              mode === "edit"
                ? (pid) => {
                    onClose();
                    setLocation(
                      `/prompts/${pid}?from=task:${props.task.id}`
                    );
                  }
                : undefined
            }
          />
        </Field>

        {/* TODO: Skills field — add when skills feature ships */}
        {/* TODO: MCP tools field — add when MCP tools feature ships */}

        <Field label="Description">
          <MilkdownEditor
            key={editorKey}
            value={description}
            onChange={setDescription}
            initialMode="view"
            onSave={() => void submit()}
          />
        </Field>

        {/* Live preview of the inheritance stack. Visible in both modes —
            in create mode it shows what the task would pick up if saved in
            the current column. Wired to the staged local state so adding or
            removing a direct prompt (or switching role) updates the view
            without a save round trip. */}
        <Field label="Effective context">
          <TaskEffectiveContext
            boardId={boardId}
            columnId={
              mode === "create" ? props.columnId : editTask?.column_id ?? ""
            }
            localRoleId={localRoleId}
            localDirectIds={localDirectIds}
            localDisabledIds={localDisabledIds}
            allPrompts={allPrompts}
          />
        </Field>

        {/* Activity timeline — only meaningful for an existing task; in
            create mode there's nothing to log yet. Default-collapsed so
            it doesn't shift the dialog every time a user opens an edit. */}
        {mode === "edit" && editingId ? <TaskActivityLog taskId={editingId} /> : null}
      </div>
    </Dialog>
  );
}
