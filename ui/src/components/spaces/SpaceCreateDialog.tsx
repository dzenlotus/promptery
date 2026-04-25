import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "../../lib/api.js";
import { useCreateSpace } from "../../hooks/useSpaces.js";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PREFIX_PATTERN = /^[a-z0-9-]{1,10}$/;

/**
 * Create a space — name + slug prefix + optional description. Prefix is
 * validated client-side against the same regex the API enforces so the
 * user sees the rule immediately rather than via a 400 round-trip.
 *
 * Server-side errors (PrefixCollision 409, etc.) still bubble through and
 * land as a toast.
 */
export function SpaceCreateDialog({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const create = useCreateSpace();

  const reset = () => {
    setName("");
    setPrefix("");
    setDescription("");
    setTouched(false);
  };

  const trimmedName = name.trim();
  const trimmedPrefix = prefix.trim();
  const prefixValid = PREFIX_PATTERN.test(trimmedPrefix);
  const canSubmit = trimmedName.length > 0 && prefixValid && !create.isPending;

  const onSubmit = () => {
    setTouched(true);
    if (!canSubmit) return;
    create.mutate(
      {
        name: trimmedName,
        prefix: trimmedPrefix,
        ...(description.trim().length > 0
          ? { description: description.trim() }
          : {}),
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            toast.error(`Prefix "${trimmedPrefix}" is already in use`);
          } else {
            toast.error(
              err instanceof Error ? err.message : "Failed to create space"
            );
          }
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !create.isPending) {
          reset();
          onClose();
        }
      }}
      title="New space"
      size="md"
      data-testid="space-create-dialog"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={!canSubmit}>
            {create.isPending ? "Creating…" : "Create"}
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
            placeholder="My project"
            data-testid="space-create-name"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Prefix
            </label>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              becomes the slug prefix for tasks (e.g. <code>pmt-46</code>)
            </span>
          </div>
          <Input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toLowerCase())}
            placeholder="pmt"
            data-testid="space-create-prefix"
            aria-invalid={touched && !prefixValid ? true : undefined}
          />
          {touched && !prefixValid && (
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
            placeholder="What lives in this space?"
            data-testid="space-create-description"
          />
        </div>
      </div>
    </Dialog>
  );
}
