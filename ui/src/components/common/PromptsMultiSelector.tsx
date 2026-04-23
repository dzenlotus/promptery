import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { Chip } from "../ui/Chip.js";
import type { Prompt } from "../../lib/types.js";

interface Props {
  /** All available prompts to pick from. */
  allPrompts: Prompt[];
  /** Ordered list of selected prompt ids. */
  value: string[];
  onChange: (nextIds: string[]) => void;
  label?: string;
  testId?: string;
}

/**
 * Multi-select picker for prompts with popover-driven add / click-to-remove.
 * Displays selection as inline chips wrapping across rows; order is the
 * click order (first picked → leftmost). Used by BoardEditDialog and
 * ColumnEditDialog; not quite the same shape as TaskPromptsEditor which
 * also distinguishes inherited-vs-direct chips and supports drag-reorder.
 */
export function PromptsMultiSelector({
  allPrompts,
  value,
  onChange,
  label,
  testId = "prompts-multi-selector",
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const byId = useMemo(() => new Map(allPrompts.map((p) => [p.id, p])), [allPrompts]);
  const selectedSet = useMemo(() => new Set(value), [value]);

  const selectedPrompts = useMemo(
    () => value.map((id) => byId.get(id)).filter((p): p is Prompt => !!p),
    [value, byId]
  );

  const available = useMemo(
    () =>
      [...allPrompts]
        .filter((p) => !selectedSet.has(p.id))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        ),
    [allPrompts, selectedSet]
  );

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div data-testid={testId} className="grid gap-1.5">
      {label && (
        <span className="text-[12px] text-[var(--color-text-muted)]">{label}</span>
      )}
      <div className="flex flex-wrap gap-1.5 items-center min-h-[32px] px-1 py-1 rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)]">
        {selectedPrompts.map((p) => (
          <Chip
            key={p.id}
            name={p.name}
            color={p.color}
            size="sm"
            onRemove={() => toggle(p.id)}
            data-testid={`${testId}-chip-${p.id}`}
          />
        ))}

        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid={`${testId}-add`}
              className="h-5 px-1.5 inline-flex items-center gap-1 rounded-full text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--active-overlay)] hover:text-[var(--color-text)]"
            >
              <Plus size={12} />
              {selectedPrompts.length === 0 ? "Add prompts" : "Add"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[280px] p-0">
            <Command shouldFilter loop>
              <div className="border-b border-[var(--color-border)] px-2">
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search prompts…"
                  className="w-full h-9 bg-transparent outline-none text-[13px] placeholder:text-[var(--color-text-subtle)]"
                />
              </div>
              <Command.List className="max-h-[260px] overflow-y-auto scroll-thin py-1">
                <Command.Empty className="px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
                  {allPrompts.length === 0
                    ? "No prompts yet. Create one first."
                    : available.length === 0
                      ? "All prompts are already selected"
                      : "No matches"}
                </Command.Empty>
                <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                  {available.map((p) => (
                    <Command.Item
                      key={p.id}
                      value={p.name}
                      onSelect={() => {
                        toggle(p.id);
                        setSearch("");
                      }}
                      className="cursor-pointer rounded-full outline-none [&[data-selected=true]>span]:bg-[var(--active-overlay)]"
                    >
                      <Chip name={p.name} color={p.color} size="sm" />
                    </Command.Item>
                  ))}
                </div>
              </Command.List>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
