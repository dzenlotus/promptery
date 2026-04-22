import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { TagChip } from "./TagChip.js";
import { useCreateTag, useTags } from "../../hooks/useTags.js";
import type { Tag, TagKind } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

interface Props {
  kind: TagKind;
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  placeholder?: string;
  allowCreate?: boolean;
}

/**
 * Multi-select of tags filtered by `kind`. The Popover Command has two sections
 * — GROUPS (placeholder for a future feature) and TAGS — so when groups land
 * the layout is already in place. Tags filter via cmdk's built-in matcher; when
 * no match is found and `allowCreate` is true the user can create a tag inline.
 */
export function TagSelector({
  kind,
  selectedTagIds,
  onChange,
  placeholder,
  allowCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: tags = [] } = useTags(kind);
  const createTag = useCreateTag();

  const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const selectedTags = useMemo(
    () => tags.filter((t) => selectedSet.has(t.id)),
    [tags, selectedSet]
  );

  const searchNormalised = search.trim().toLowerCase();
  const exactMatch = tags.find((t) => t.name.toLowerCase() === searchNormalised);
  const showCreate =
    Boolean(allowCreate) &&
    searchNormalised.length > 0 &&
    /^[a-z0-9_-]+$/.test(searchNormalised) &&
    !exactMatch;

  const toggleTag = (tagId: string) => {
    if (selectedSet.has(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  const onCreate = async () => {
    try {
      const tag = await createTag.mutateAsync({ name: searchNormalised, kind });
      onChange([...selectedTagIds, tag.id]);
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
            "flex flex-wrap items-center gap-1",
            "transition-[border-color,box-shadow] duration-150",
            "hover:border-[var(--color-border-strong)]",
            "focus-visible:outline-none focus-visible:border-[var(--color-accent)]",
            "focus-visible:shadow-[0_0_0_3px_var(--color-accent-ring)]"
          )}
        >
          {selectedTags.length > 0 ? (
            selectedTags.map((t) => (
              <TagChip
                key={t.id}
                tag={t}
                size="sm"
                onRemove={() => toggleTag(t.id)}
              />
            ))
          ) : (
            <span className="text-[13px] text-[var(--color-text-subtle)]">
              {placeholder ?? `Add ${kind}…`}
            </span>
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
              placeholder="Search…"
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
              Tags
            </div>
            <Command.Empty className="px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
              {showCreate ? null : "No matches"}
            </Command.Empty>
            {tags.map((t: Tag) => (
              <Command.Item
                key={t.id}
                value={t.name}
                onSelect={() => toggleTag(t.id)}
                className={cn(
                  "mx-1 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer",
                  "data-[selected=true]:bg-[var(--hover-overlay)]"
                )}
              >
                <TagChip tag={t} size="sm" />
                {selectedSet.has(t.id) ? (
                  <Check size={14} className="text-[var(--color-accent)] shrink-0" />
                ) : null}
              </Command.Item>
            ))}
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
