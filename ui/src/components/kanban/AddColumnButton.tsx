import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { useCreateColumn } from "../../hooks/useColumns.js";

interface Props {
  boardId: string;
}

/**
 * Trailing affordance at the right end of the kanban board. The button is
 * sized/proportioned like a column placeholder so it feels like "the slot where
 * the next column will live" rather than a generic toolbar action.
 */
export function AddColumnButton({ boardId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { mutate, isPending, reset } = useCreateColumn(boardId);

  const close = () => {
    setOpen(false);
    setName("");
    reset();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    mutate(trimmed, {
      onSuccess: () => {
        toast.success(`Column "${trimmed}" created`);
        close();
      },
      onError: (err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to create column");
      },
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add column"
        title="Add column"
        data-testid="kanban-add-column"
        className={
          "h-full w-[48px] rounded-xl border border-dashed border-[var(--color-border)] " +
          "text-[var(--color-text-subtle)] hover:text-[var(--color-text)] " +
          "hover:border-[var(--color-border-strong,var(--color-border))] " +
          "hover:bg-[var(--hover-overlay)] " +
          "transition-colors duration-150 grid place-items-center"
        }
      >
        <Plus size={18} />
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => !o && close()}
        title="New column"
        size="sm"
        data-testid="column-create-dialog"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={isPending || !name.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="grid gap-2 py-2">
          <label className="text-[12px] text-[var(--color-text-muted)]">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="e.g. Backlog, In Review"
            autoFocus
          />
        </div>
      </Dialog>
    </>
  );
}
