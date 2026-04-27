import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { PalettePicker } from "../common/PalettePicker.js";
import { paletteColorForName } from "../../lib/palette.js";
import { api, ApiError } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { usePrompts } from "../../hooks/usePrompts.js";
import type {
  PromptGroup,
  PromptGroupWithPrompts,
} from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

/**
 * Create-or-edit dialog for a prompt group. Passing `group` flips the form
 * into edit mode: name + color default from the existing group and the
 * prompt picker preselects current members. The two flows share most of
 * the form because their footprint is nearly identical; only the submit
 * target changes.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: PromptGroup | PromptGroupWithPrompts | null;
}

/** Fallback used before the user has typed a name. */
const FALLBACK_COLOR = "#8b5cf6";

export function PromptGroupDialog({ open, onOpenChange, group }: Props) {
  const qc = useQueryClient();
  const isEdit = Boolean(group);

  const { data: allPrompts = [] } = usePrompts();
  const sortedPrompts = useMemo(
    () =>
      [...allPrompts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [allPrompts]
  );

  const [name, setName] = useState("");
  // null means "auto" — derive from name via palette. A non-null value means
  // the user has manually chosen a color (including in edit mode).
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Resolved color: use override when set, otherwise derive from name.
  const resolvedColor = colorOverride ?? (name.trim() ? paletteColorForName(name.trim()) : FALLBACK_COLOR);
  // The color we ultimately persist is always the resolved value.
  const color: string | null = resolvedColor;

  // Seed form state when the dialog opens so we don't leak draft state
  // between consecutive opens on different groups.
  useEffect(() => {
    if (!open) return;
    setFilter("");
    setFormError(null);
    if (group) {
      setName(group.name);
      // In edit mode the group already has a saved color; treat it as an override.
      setColorOverride(group.color ?? null);
      const hasPrompts = "prompts" in group && Array.isArray(group.prompts);
      setSelectedIds(hasPrompts ? group.prompts.map((p) => p.id) : []);
    } else {
      setName("");
      setColorOverride(null);
      setSelectedIds([]);
    }
  }, [open, group]);

  // In edit mode, fetch the full group (with prompts) if the prop is a
  // list-shape without prompts. The sidebar list doesn't carry members, so
  // we need this round trip once the user clicks Edit.
  useEffect(() => {
    if (!open || !group) return;
    if ("prompts" in group && Array.isArray(group.prompts)) return;
    let cancelled = false;
    api.promptGroups.get(group.id).then((full) => {
      if (cancelled) return;
      setSelectedIds(full.prompts.map((p) => p.id));
    });
    return () => {
      cancelled = true;
    };
  }, [open, group]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.promptGroups.create({
        name: name.trim(),
        color,
        prompt_ids: selectedIds,
      }),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: qk.promptGroups });
      toast.success(`Group "${g.name}" created`);
      onOpenChange(false);
    },
    onError: (err) => reportError(err, setFormError),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!group) return;
      await api.promptGroups.update(group.id, { name: name.trim(), color });
      return api.promptGroups.setPrompts(group.id, selectedIds);
    },
    onSuccess: () => {
      if (!group) return;
      qc.invalidateQueries({ queryKey: qk.promptGroups });
      qc.invalidateQueries({ queryKey: qk.promptGroup(group.id) });
      toast.success("Group updated");
      onOpenChange(false);
    },
    onError: (err) => reportError(err, setFormError),
  });

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required");
      return;
    }
    setFormError(null);
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sortedPrompts;
    return sortedPrompts.filter((p) => p.name.toLowerCase().includes(q));
  }, [sortedPrompts, filter]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !isPending && onOpenChange(false)}
      title={isEdit ? "Edit group" : "New prompt group"}
      size="md"
      data-testid="prompt-group-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={isPending || !name.trim()}>
            {isPending ? "Saving…" : isEdit ? "Save" : "Create group"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Code style, Testing, Performance…"
            autoFocus
            data-testid="prompt-group-name"
          />
          {formError && (
            <span className="text-[12px] text-[var(--color-danger)]">{formError}</span>
          )}
        </div>

        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">Color</label>
          <PalettePicker
            value={resolvedColor}
            onPick={(c) => setColorOverride(c)}
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Prompts in this group
            </label>
            <span className="text-[11px] text-[var(--color-text-subtle)]">
              {selectedIds.length} selected
            </span>
          </div>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter prompts…"
            data-testid="prompt-group-filter"
          />
          <div className="max-h-[240px] overflow-y-auto scroll-thin rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)] p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-[var(--color-text-subtle)]">
                {sortedPrompts.length === 0
                  ? "No prompts yet — create one from the Prompts page first."
                  : "No prompts match your filter."}
              </div>
            ) : (
              filtered.map((p) => {
                const checked = selectedIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer",
                      "hover:bg-[var(--active-overlay)]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.color || "#7a746a" }}
                    />
                    <span className="text-[13px] truncate">{p.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function reportError(err: unknown, setFormError: (msg: string) => void) {
  const message =
    err instanceof ApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : "Something went wrong";
  setFormError(message);
  toast.error(message);
}
