import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "../../lib/api.js";
import { useUpdateSpace } from "../../hooks/useSpaces.js";
import type { Space } from "../../lib/types.js";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";

interface Props {
  space: Space;
  open: boolean;
  onClose: () => void;
}

const PREFIX_PATTERN = /^[a-z0-9-]{1,10}$/;

/**
 * Edit a space — name + prefix + description. Prefix changes do NOT
 * re-slug existing tasks (slugs are minted at creation and only change
 * on board moves between spaces). The dialog states this inline so the
 * user understands the consequence before saving.
 *
 * Default-space prefix field is disabled — renaming the system default
 * prefix would break the agreed convention that the default space ships
 * with `prefix='task'`.
 */
export function SpaceEditDialog({ space, open, onClose }: Props) {
  const [name, setName] = useState(space.name);
  const [prefix, setPrefix] = useState(space.prefix);
  const [description, setDescription] = useState(space.description ?? "");
  const update = useUpdateSpace();

  // Re-sync local state when the dialog reopens against a different (or
  // freshly-edited) space row. Without this, opening Edit on Space A then
  // closing and opening Edit on Space B would show A's values.
  useEffect(() => {
    if (open) {
      setName(space.name);
      setPrefix(space.prefix);
      setDescription(space.description ?? "");
    }
  }, [open, space.id, space.name, space.prefix, space.description]);

  const trimmedName = name.trim();
  const trimmedPrefix = prefix.trim();
  const prefixValid = PREFIX_PATTERN.test(trimmedPrefix);
  const dirty =
    trimmedName !== space.name ||
    trimmedPrefix !== space.prefix ||
    description.trim() !== (space.description ?? "");
  const canSubmit = trimmedName.length > 0 && prefixValid && dirty && !update.isPending;

  const onSubmit = () => {
    if (!canSubmit) return;
    const patch: Parameters<typeof update.mutate>[0]["patch"] = {};
    if (trimmedName !== space.name) patch.name = trimmedName;
    if (trimmedPrefix !== space.prefix) patch.prefix = trimmedPrefix;
    const newDesc = description.trim();
    if (newDesc !== (space.description ?? "")) {
      patch.description = newDesc.length > 0 ? newDesc : null;
    }
    update.mutate(
      { id: space.id, patch },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            toast.error(`Prefix "${trimmedPrefix}" is already in use`);
          } else {
            toast.error(
              err instanceof Error ? err.message : "Failed to update space"
            );
          }
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Edit space — ${space.name}`}
      size="md"
      data-testid="space-edit-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={!canSubmit}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">Name</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="space-edit-name"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Prefix
            </label>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              renaming does not re-slug existing tasks
            </span>
          </div>
          <Input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toLowerCase())}
            disabled={space.is_default}
            data-testid="space-edit-prefix"
            aria-invalid={!prefixValid ? true : undefined}
          />
          {space.is_default && (
            <span className="text-[11px] text-[var(--color-text-subtle)]">
              The default space's prefix is fixed at <code>task</code>.
            </span>
          )}
          {!space.is_default && !prefixValid && (
            <span className="text-[11px] text-[var(--color-danger)]">
              1–10 chars, lowercase letters, digits, or hyphens.
            </span>
          )}
        </div>

        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">
            Description (optional)
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="space-edit-description"
          />
        </div>
      </div>
    </Dialog>
  );
}
