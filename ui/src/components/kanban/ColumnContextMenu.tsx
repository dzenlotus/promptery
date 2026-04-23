import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from "../ui/DropdownMenu.js";
import { IconButton } from "../ui/IconButton.js";

interface Props {
  onRename: () => void;
  onDelete: () => void;
}

export function ColumnContextMenu({ onRename, onDelete }: Props) {
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <IconButton
          label="Column actions"
          size="sm"
          data-testid="column-context-menu-trigger"
        >
          <MoreHorizontal size={14} />
        </IconButton>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={onRename}>
          <Pencil size={14} />
          Rename
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem onSelect={onDelete} danger>
          <Trash2 size={14} />
          Delete
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
