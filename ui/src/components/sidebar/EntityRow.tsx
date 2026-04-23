import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Copy, MoreHorizontal, Palette, Pencil, Trash2 } from "lucide-react";
import {
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from "../ui/DropdownMenu.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { IconButton } from "../ui/IconButton.js";
import { ColorDot } from "./ColorDot.js";
import { ColorSwatchGrid } from "./ColorSwatchGrid.js";
import { cn } from "../../lib/cn.js";

export interface EntityRowItem {
  id: string;
  name: string;
  color: string;
}

interface Props {
  item: EntityRowItem;
  selected: boolean;
  isRenaming: boolean;
  onSelect: () => void;
  onRequestRename: () => void;
  commitRename: (nextName: string) => void;
  cancelRename: () => void;
  onColorPick: (color: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  testIdPrefix: string;
}

/**
 * Shared sidebar row for prompts/roles: color dot on the left, name, kebab
 * menu on the right that surfaces Rename / Change color / Duplicate / Delete.
 */
export function EntityRow({
  item,
  selected,
  isRenaming,
  onSelect,
  onRequestRename,
  commitRename,
  cancelRename,
  onColorPick,
  onDuplicate,
  onDelete,
  testIdPrefix,
}: Props) {
  const [renameValue, setRenameValue] = useState(item.name);
  const renameRef = useRef<HTMLInputElement>(null);
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(item.name);
      requestAnimationFrame(() => {
        renameRef.current?.focus();
        renameRef.current?.select();
      });
    }
  }, [isRenaming, item.name]);

  const handleRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename(renameValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`${testIdPrefix}-${item.id}`}
      data-selected={selected || undefined}
      onClick={() => {
        if (!isRenaming) onSelect();
      }}
      onKeyDown={(e) => {
        if (isRenaming) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative grid grid-cols-[auto_1fr_auto] items-center gap-2 h-9 pr-2 pl-3 rounded-md cursor-pointer",
        "transition-colors duration-150 select-none",
        selected
          ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
          : "hover:bg-[var(--hover-overlay)] text-[var(--color-text)]"
      )}
    >
      <ColorDot color={item.color || "#a1a1a1"} size={8} />
      {isRenaming ? (
        <input
          ref={renameRef}
          data-testid={`${testIdPrefix}-${item.id}-rename-input`}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => commitRename(renameValue)}
          onKeyDown={handleRenameKey}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "min-w-0 bg-transparent outline-none border-0",
            "text-[13px] tracking-tight text-[var(--color-text)]"
          )}
        />
      ) : (
        <span className="truncate text-[13px] tracking-tight">{item.name}</span>
      )}

      <div
        className={cn(
          "opacity-0 group-hover:opacity-100 transition-opacity",
          (selected || colorOpen) && "opacity-100"
        )}
      >
        <DropdownMenu>
          <DropdownTrigger asChild>
            <IconButton
              label={`${item.name} actions`}
              size="sm"
              data-testid={`${testIdPrefix}-${item.id}-menu`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={14} />
            </IconButton>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={onRequestRename}>
              <Pencil size={14} />
              Rename
            </DropdownItem>

            <RowColorMenuItem
              value={item.color || "#a1a1a1"}
              onPick={onColorPick}
              onOpenChange={setColorOpen}
            />

            <DropdownItem onSelect={onDuplicate}>
              <Copy size={14} />
              Duplicate
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={onDelete} danger>
              <Trash2 size={14} />
              Delete
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * Popover nested inside the row's dropdown menu. Popover instead of a sub-menu
 * so one click on a swatch commits the choice and closes both layers.
 */
function RowColorMenuItem({
  value,
  onPick,
  onOpenChange,
}: {
  value: string;
  onPick: (color: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        onOpenChange(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
            onOpenChange(!open);
          }}
          className={cn(
            "w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px]",
            "cursor-pointer select-none outline-none transition-colors",
            "text-[var(--color-text)] hover:bg-[var(--hover-overlay)]"
          )}
        >
          <Palette size={14} />
          <span>Change color</span>
          <ColorDot color={value} size={10} className="ml-auto" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="p-1 min-w-0 w-auto">
        <ColorSwatchGrid
          value={value}
          onPick={(c) => {
            onPick(c);
            setOpen(false);
            onOpenChange(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
