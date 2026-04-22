import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "../ui/Dialog.js";
import { Button } from "../ui/Button.js";
import { Input } from "../ui/Input.js";
import { MilkdownEditor } from "../editor/MilkdownEditor.js";
import { RoleSelector } from "../tags/RoleSelector.js";
import { TagSelector } from "../tags/TagSelector.js";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import type { Task, TaskFull } from "../../lib/types.js";

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

interface TagState {
  role: string | null;
  skills: string[];
  prompts: string[];
  mcp: string[];
}

const EMPTY_TAGS: TagState = { role: null, skills: [], prompts: [], mcp: [] };

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
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

export function TaskDialog(props: Props) {
  const { open, onClose, mode, boardId } = props;
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<TagState>(EMPTY_TAGS);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);

  // Seed form from task on open.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit") {
      setTitle(props.task.title);
      setDescription(props.task.description);
      const full = qc.getQueryData<TaskFull>(["task", props.task.id]);
      setTags(kindsFromTags(full?.tags ?? props.task.tags));
      // Fetch full task to get descriptions on tags too (fire & forget).
      api.tasks
        .get(props.task.id)
        .then((t) => {
          qc.setQueryData(["task", t.id], t);
          setTags(kindsFromTags(t.tags));
        })
        .catch(() => {
          /* no-op */
        });
    } else {
      setTitle("");
      setDescription("");
      setTags(EMPTY_TAGS);
    }
    setEditorKey((k) => k + 1);
    // Disable deps rule — we intentionally re-seed only on open transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, mode === "edit" ? props.task?.id : null]);

  const disabled = !title.trim() || saving;

  const selectedIds = useMemo<string[]>(() => {
    const ids = [...tags.skills, ...tags.prompts, ...tags.mcp];
    if (tags.role) ids.push(tags.role);
    return ids;
  }, [tags]);

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
        // Attach tags in parallel.
        await Promise.all(selectedIds.map((id) => api.tasks.addTag(created.id, id)));
        toast.success("Task created");
      } else {
        const original = props.task;
        const originalIds = new Set(original.tags.map((t) => t.id));
        const nextIds = new Set(selectedIds);

        const toAdd = selectedIds.filter((id) => !originalIds.has(id));
        const toRemove = [...originalIds].filter((id) => !nextIds.has(id));

        await Promise.all([
          api.tasks.update(original.id, { title: trimmed, description }),
          ...toAdd.map((id) => api.tasks.addTag(original.id, id)),
          ...toRemove.map((id) => api.tasks.removeTag(original.id, id)),
        ]);
        toast.success("Task updated");
      }

      qc.invalidateQueries({ queryKey: qk.tasks(boardId) });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle = mode === "create" ? "Create task" : `Edit task #${props.task?.number}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={dialogTitle}
      size="lg"
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
      <div className="grid gap-4 py-2">
        <Field label="Title">
          <Input
            autoFocus
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
            selectedTagId={tags.role}
            onChange={(id) => setTags((s) => ({ ...s, role: id }))}
            allowCreate
          />
        </Field>

        <Field label="Skills">
          <TagSelector
            kind="skill"
            selectedTagIds={tags.skills}
            onChange={(ids) => setTags((s) => ({ ...s, skills: ids }))}
            placeholder="Add skills…"
            allowCreate
          />
        </Field>

        <Field label="Prompts">
          <TagSelector
            kind="prompt"
            selectedTagIds={tags.prompts}
            onChange={(ids) => setTags((s) => ({ ...s, prompts: ids }))}
            placeholder="Add prompts…"
            allowCreate
          />
        </Field>

        <Field label="MCP tools">
          <TagSelector
            kind="mcp"
            selectedTagIds={tags.mcp}
            onChange={(ids) => setTags((s) => ({ ...s, mcp: ids }))}
            placeholder="Add MCP tools…"
            allowCreate
          />
        </Field>

        <Field label="Description">
          <MilkdownEditor key={editorKey} value={description} onChange={setDescription} />
        </Field>
      </div>
    </Dialog>
  );
}

function kindsFromTags(taskTags: Task["tags"] | TaskFull["tags"]): TagState {
  const out: TagState = { role: null, skills: [], prompts: [], mcp: [] };
  for (const t of taskTags) {
    // The lite tag shape doesn't carry kind; we rely on the full-task fetch
    // to populate the form. This branch handles whichever shape arrived.
    const kind = (t as { kind?: string }).kind;
    if (kind === "role") out.role = t.id;
    else if (kind === "skill") out.skills.push(t.id);
    else if (kind === "prompt") out.prompts.push(t.id);
    else if (kind === "mcp") out.mcp.push(t.id);
  }
  return out;
}
