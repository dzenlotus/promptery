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
  onEdit: () => void;
  onDelete: () => void;
  /** When true, the Delete item is disabled (default space). */
  disableDelete?: boolean;
}

export function SpaceContextMenu({ onEdit, onDelete, disableDelete }: Props) {
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <IconButton
          label="Space actions"
          size="sm"
          data-testid="space-context-menu-trigger"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={14} />
        </IconButton>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={onEdit}>
          <Pencil size={14} />
          Edit
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem onSelect={onDelete} danger disabled={disableDelete}>
          <Trash2 size={14} />
          Delete
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
