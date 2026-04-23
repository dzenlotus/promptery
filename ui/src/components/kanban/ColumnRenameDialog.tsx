import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { useUpdateColumn } from "../../hooks/useColumns.js";
import type { Column } from "../../lib/types.js";

interface Props {
  boardId: string;
  column: Column;
  open: boolean;
  onClose: () => void;
}

export function ColumnRenameDialog({ boardId, column, open, onClose }: Props) {
  const [name, setName] = useState(column.name);
  const { mutate, isPending } = useUpdateColumn(boardId);

  useEffect(() => {
    if (open) setName(column.name);
  }, [open, column.name]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === column.name) {
      onClose();
      return;
    }
    mutate(
      { id: column.id, name: trimmed },
      {
        onSuccess: () => {
          toast.success("Column renamed");
          onClose();
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Failed to rename column");
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Rename column"
      size="sm"
      data-testid="column-rename-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={isPending || !name.trim()}>
            Save
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
          autoFocus
        />
      </div>
    </Dialog>
  );
}
