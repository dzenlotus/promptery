import { useEffect, useState } from "react";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { useUpdateBoard } from "../../hooks/useBoards.js";

interface Props {
  boardId: string;
  currentName: string;
  open: boolean;
  onClose: () => void;
}

export function BoardRenameDialog({ boardId, currentName, open, onClose }: Props) {
  const [name, setName] = useState(currentName);
  const { mutate, isPending } = useUpdateBoard();

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      onClose();
      return;
    }
    mutate(
      { id: boardId, name: trimmed },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Rename board"
      size="sm"
      data-testid="board-rename-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={isPending}>
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
