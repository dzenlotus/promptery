import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { TagChip } from "./TagChip.js";
import { useCreateTag, useTags } from "../../hooks/useTags.js";
import { cn } from "../../lib/cn.js";

interface Props {
  selectedTagId: string | null;
  onChange: (tagId: string | null) => void;
  allowCreate?: boolean;
}

/**
 * Single-select cousin of TagSelector — same Popover/Command shape but the
 * value is a single id (or null). Replacing rather than toggling, and clearing
 * the selection happens via the chip's X.
 */
export function RoleSelector({ selectedTagId, onChange, allowCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: tags = [] } = useTags("role");
  const createTag = useCreateTag();

  const selected = useMemo(
    () => tags.find((t) => t.id === selectedTagId) ?? null,
    [tags, selectedTagId]
  );

  const searchNormalised = search.trim().toLowerCase();
  const exactMatch = tags.find((t) => t.name.toLowerCase() === searchNormalised);
  const showCreate =
    Boolean(allowCreate) &&
    searchNormalised.length > 0 &&
    /^[a-z0-9_-]+$/.test(searchNormalised) &&
    !exactMatch;

  const onSelect = (tagId: string) => {
    onChange(tagId);
    setOpen(false);
    setSearch("");
  };

  const onCreate = async () => {
    try {
      const tag = await createTag.mutateAsync({ name: searchNormalised, kind: "role" });
      onChange(tag.id);
      setOpen(false);
      setSearch("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full min-h-9 rounded-md bg-[var(--color-surface-raised)]",
            "border border-[var(--color-border)] px-2 py-1.5 text-left",
            "flex items-center gap-1",
            "transition-[border-color,box-shadow] duration-150",
            "hover:border-[var(--color-border-strong)]",
            "focus-visible:outline-none focus-visible:border-[var(--color-accent)]",
            "focus-visible:shadow-[0_0_0_3px_var(--color-accent-ring)]"
          )}
        >
          {selected ? (
            <TagChip
              tag={selected}
              size="sm"
              onRemove={() => onChange(null)}
            />
          ) : (
            <span className="text-[13px] text-[var(--color-text-subtle)]">Select role…</span>
          )}
          <ChevronDown
            size={14}
            className="ml-auto text-[var(--color-text-subtle)] shrink-0"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={true} loop>
          <div className="border-b border-[var(--color-border)] px-2">
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search roles…"
              className="w-full h-9 bg-transparent outline-none text-[13px] placeholder:text-[var(--color-text-subtle)]"
            />
          </div>
          <Command.List className="max-h-[280px] overflow-y-auto scroll-thin py-1">
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
              Groups
            </div>
            <div className="px-3 pb-2 text-[12px] text-[var(--color-text-subtle)]">
              No groups yet
            </div>
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
              Roles
            </div>
            <Command.Empty className="px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
              {showCreate ? null : "No matches"}
            </Command.Empty>
            {tags.map((t) => (
              <Command.Item
                key={t.id}
                value={t.name}
                onSelect={() => onSelect(t.id)}
                className={cn(
                  "mx-1 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer",
                  "data-[selected=true]:bg-[var(--hover-overlay)]"
                )}
              >
                <TagChip tag={t} size="sm" />
                {selectedTagId === t.id ? (
                  <Check size={14} className="text-[var(--color-accent)] shrink-0" />
                ) : null}
              </Command.Item>
            ))}
            {selectedTagId ? (
              <Command.Item
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "mx-1 mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer",
                  "border-t border-[var(--color-border)]",
                  "text-[13px] text-[var(--color-text-muted)]",
                  "data-[selected=true]:bg-[var(--hover-overlay)]"
                )}
              >
                <X size={14} />
                Clear selection
              </Command.Item>
            ) : null}
            {showCreate ? (
              <Command.Item
                value={`__create__ ${searchNormalised}`}
                onSelect={onCreate}
                className={cn(
                  "mx-1 mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer",
                  "border-t border-[var(--color-border)]",
                  "text-[13px] text-[var(--color-text)]",
                  "data-[selected=true]:bg-[var(--hover-overlay)]"
                )}
              >
                <Plus size={14} className="text-[var(--color-accent)]" />
                <span>
                  Create <span className="text-[var(--color-text)]">«{searchNormalised}»</span>
                </span>
              </Command.Item>
            ) : null}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
