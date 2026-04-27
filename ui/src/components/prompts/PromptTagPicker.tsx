import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { ColorSwatchGrid } from "../sidebar/ColorSwatchGrid.js";
import { ENTITY_COLORS } from "../sidebar/colors.js";
import { TagChip } from "./TagChip.js";
import { api, ApiError } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { useTags } from "../../hooks/useTags.js";
import type { Prompt, Tag } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

/**
 * Modal for editing a prompt's tags. Lists existing tags as toggleable
 * chips, lets the user create a new tag inline (name + colour) which is
 * auto-applied to the prompt on creation, and persists the chosen set in a
 * single PUT once the user clicks Save.
 *
 * Optimistic state lives in the dialog and is committed on Save — the user
 * can dismiss without changes and the prompt's tag set stays untouched.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: Pick<Prompt, "id" | "name">;
  /** Tags currently applied to this prompt — seeds initial selection. */
  currentTags: Tag[];
}

const DEFAULT_COLOR = ENTITY_COLORS[5] ?? "#8b5cf6";

export function PromptTagPicker({
  open,
  onOpenChange,
  prompt,
  currentTags,
}: Props) {
  const qc = useQueryClient();
  const { data: allTags = [] } = useTags();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  // Inline-create form state — flipped on by the "New tag" button at the
  // bottom of the picker so it stays out of the way until needed.
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(DEFAULT_COLOR);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset form whenever the dialog opens — we don't want draft state from a
  // previous prompt to leak across.
  useEffect(() => {
    if (!open) return;
    setSelectedIds(currentTags.map((t) => t.id));
    setFilter("");
    setCreatingNew(false);
    setNewName("");
    setNewColor(DEFAULT_COLOR);
    setCreateError(null);
    setSaveError(null);
  }, [open, currentTags]);

  const sortedTags = useMemo(
    () =>
      [...allTags].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [allTags]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sortedTags;
    return sortedTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [sortedTags, filter]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const createMutation = useMutation({
    mutationFn: () =>
      api.tags.create({ name: newName.trim(), color: newColor }),
    onSuccess: (created) => {
      // Auto-select the freshly-created tag so the user doesn't have to
      // hunt for it in the list.
      setSelectedIds((prev) =>
        prev.includes(created.id) ? prev : [...prev, created.id]
      );
      setCreatingNew(false);
      setNewName("");
      setNewColor(DEFAULT_COLOR);
      setCreateError(null);
      qc.invalidateQueries({ queryKey: qk.tags });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create tag";
      setCreateError(message);
    },
  });

  // The save mutation walks the diff between currentTags and selectedIds.
  // Single PUT-per-tag would be wasteful — the per-prompt diff means a
  // typical "tweak one tag" flow makes one request, not N. Sequential is
  // fine here: requests are tiny, the user clicks once, and any failure
  // should halt the rest of the batch.
  const saveMutation = useMutation({
    mutationFn: async () => {
      const before = new Set(currentTags.map((t) => t.id));
      const after = new Set(selectedIds);
      const toAdd = [...after].filter((id) => !before.has(id));
      const toRemove = [...before].filter((id) => !after.has(id));

      for (const tagId of toAdd) {
        await api.tags.addPrompt(tagId, prompt.id);
      }
      for (const tagId of toRemove) {
        await api.tags.removePrompt(tagId, prompt.id);
      }
      return { added: toAdd.length, removed: toRemove.length };
    },
    onSuccess: ({ added, removed }) => {
      qc.invalidateQueries({ queryKey: qk.tagsByPrompt });
      qc.invalidateQueries({ queryKey: qk.tags });
      if (added + removed > 0) toast.success("Tags updated");
      onOpenChange(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to update tags";
      setSaveError(message);
    },
  });

  const onSave = () => {
    setSaveError(null);
    saveMutation.mutate();
  };

  const isPending = createMutation.isPending || saveMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !isPending && onOpenChange(false)}
      title={`Tags for "${prompt.name}"`}
      size="md"
      data-testid="prompt-tag-picker"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={isPending}
            data-testid="prompt-tag-picker-save"
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Existing tags
            </label>
            <span className="text-[11px] text-[var(--color-text-subtle)]">
              {selectedIds.length} selected
            </span>
          </div>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tags…"
            data-testid="prompt-tag-picker-filter"
          />
          <div className="max-h-[220px] overflow-y-auto scroll-thin rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)] p-2">
            {filtered.length === 0 ? (
              <div className="px-1 py-2 text-[12px] text-[var(--color-text-subtle)]">
                {sortedTags.length === 0
                  ? "No tags yet — create one below."
                  : "No tags match your filter."}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filtered.map((t) => (
                  <TagChip
                    key={t.id}
                    tag={t}
                    selected={selectedIds.includes(t.id)}
                    onClick={() => toggle(t.id)}
                    data-testid={`prompt-tag-picker-tag-${t.id}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          {!creatingNew ? (
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              data-testid="prompt-tag-picker-new"
              className={cn(
                "inline-flex items-center gap-1 self-start px-2 py-1 rounded-md",
                "text-[12px] text-[var(--color-text-muted)]",
                "border border-dashed border-[var(--color-border)]",
                "hover:text-[var(--color-text)] hover:border-[var(--color-text-subtle)]"
              )}
            >
              <Plus size={12} />
              New tag
            </button>
          ) : (
            <div
              data-testid="prompt-tag-picker-new-form"
              className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--color-text-muted)]">
                  New tag
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingNew(false);
                    setCreateError(null);
                  }}
                  className="p-0.5 rounded hover:bg-[var(--active-overlay)]"
                  aria-label="Cancel new tag"
                >
                  <X size={12} />
                </button>
              </div>
              <Input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (createError) setCreateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim() && !isPending) {
                    createMutation.mutate();
                  }
                }}
                placeholder="Tag name"
                autoFocus
                data-testid="prompt-tag-picker-new-name"
              />
              <ColorSwatchGrid
                value={newColor ?? DEFAULT_COLOR}
                onPick={(c) => setNewColor(c)}
              />
              {createError && (
                <span className="text-[12px] text-[var(--color-danger)]">
                  {createError}
                </span>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => createMutation.mutate()}
                disabled={!newName.trim() || createMutation.isPending}
                data-testid="prompt-tag-picker-new-create"
              >
                {createMutation.isPending ? "Creating…" : "Create + apply"}
              </Button>
            </div>
          )}
        </div>

        {saveError && (
          <span className="text-[12px] text-[var(--color-danger)]">
            {saveError}
          </span>
        )}
      </div>
    </Dialog>
  );
}
