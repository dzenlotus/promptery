import { useState } from "react";
import { Tag as TagIcon, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { IconButton } from "../ui/IconButton.js";
import { TagChip } from "./TagChip.js";
import { useTags } from "../../hooks/useTags.js";
import type { Tag } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

interface Props {
  /** Currently active filter tag — `null` means "no filter applied". */
  activeTagId: string | null;
  onChange: (tagId: string | null) => void;
}

/**
 * Sidebar header affordance: tap the tag glyph, see all tags as chips, tap
 * a chip to filter the prompt list to that tag. Tapping the active chip
 * clears the filter (single-tag filter only — multi-tag AND/OR is out of
 * scope).
 *
 * The glyph turns into the active tag's chip when a filter is on so the
 * filter status is visible at a glance without opening the popover. An X
 * IconButton next to the chip clears the filter without re-opening the
 * picker.
 */
export function PromptsTagFilter({ activeTagId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useTags();
  const activeTag = activeTagId ? tags.find((t) => t.id === activeTagId) ?? null : null;

  return (
    <div className="flex items-center gap-1">
      {activeTag ? (
        <>
          <TagChip
            tag={activeTag}
            selected
            onClick={() => setOpen((v) => !v)}
            data-testid="prompts-tag-filter-active"
          />
          <IconButton
            label="Clear tag filter"
            size="sm"
            data-testid="prompts-tag-filter-clear"
            onClick={() => onChange(null)}
          >
            <X size={12} />
          </IconButton>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <IconButton
              label="Filter by tag"
              size="sm"
              data-testid="prompts-tag-filter-trigger"
              className={cn(activeTag && "text-[var(--color-text)]")}
            >
              <TagIcon size={13} />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent
            data-testid="prompts-tag-filter-popover"
            className="w-[240px]"
            align="end"
          >
            {tags.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-[var(--color-text-subtle)]">
                No tags yet — add one from a prompt's tag editor.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-1">
                {tags.map((t: Tag) => (
                  <TagChip
                    key={t.id}
                    tag={t}
                    selected={t.id === activeTagId}
                    onClick={() => {
                      onChange(t.id === activeTagId ? null : t.id);
                      setOpen(false);
                    }}
                    data-testid={`prompts-tag-filter-${t.id}`}
                  />
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
