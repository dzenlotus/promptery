import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Check, Folder, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { Chip } from "../ui/Chip.js";
import type { Prompt, PromptGroup } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";
import {
  isGroupFullyCovered,
  memberIds,
  toggleGroupSelection,
} from "./promptGroupToggle.js";

interface Props {
  /** All available prompts to pick from. */
  allPrompts: Prompt[];
  /** All available groups (with member ids). Toggling a group is syntactic
   *  sugar for toggling every member in one go. */
  allGroups?: PromptGroup[];
  /** Ordered list of selected prompt ids — the only state the backend cares
   *  about. Groups are derived as "fully covered by this list". */
  value: string[];
  onChange: (nextIds: string[]) => void;
  /** Optional: called when the user clicks a selected prompt chip to open it. */
  onOpenPrompt?: (id: string) => void;
  label?: string;
  testId?: string;
}

/**
 * Multi-select picker for prompts with optional group shortcuts.
 *
 * - `value` stays as a flat list of prompt ids — backend schema unchanged.
 *   Picking a group flattens its members into the list immediately, so
 *   later changes to group membership do NOT propagate to existing role/
 *   board/column attachments.
 * - Groups appear in the "Groups" popover section above individual prompts.
 *   Clicking an unselected group adds every member at once; clicking a
 *   fully-selected group (highlighted with a check mark) deselects every
 *   member, except those still covered by another fully-selected group.
 * - Fully-selected groups also surface as a single chip in the selected
 *   row so users can see at a glance which collections are attached.
 * - Individual prompts that are part of a fully-selected group are hidden
 *   from both the selected row and the "Add" popover — the group chip
 *   represents them.
 *
 * Used by BoardEditDialog, ColumnEditDialog, BoardsList (create form),
 * and RoleEditor.
 */
export function PromptsMultiSelector({
  allPrompts,
  allGroups = [],
  value,
  onChange,
  onOpenPrompt,
  label,
  testId = "prompts-multi-selector",
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const promptById = useMemo(
    () => new Map(allPrompts.map((p) => [p.id, p])),
    [allPrompts]
  );
  const selectedSet = useMemo(() => new Set(value), [value]);

  // A group is "fully covered" when every one of its members is in `value`
  // AND the group has at least one member. Partially-covered groups stay as
  // individual prompt chips in the selected row.
  const fullySelectedGroups = useMemo(
    () => allGroups.filter((g) => isGroupFullyCovered(g, selectedSet)),
    [allGroups, selectedSet]
  );

  // Ids covered by at least one fully-selected group — hidden from the
  // individual-prompt list because the group chip stands in for them.
  const coveredIds = useMemo(() => {
    const covered = new Set<string>();
    for (const g of fullySelectedGroups) {
      for (const id of memberIds(g)) covered.add(id);
    }
    return covered;
  }, [fullySelectedGroups]);

  // Prompts rendered as individual chips in the selected row.
  const visibleSelectedPrompts = useMemo(
    () =>
      value
        .filter((id) => !coveredIds.has(id))
        .map((id) => promptById.get(id))
        .filter((p): p is Prompt => !!p),
    [value, coveredIds, promptById]
  );

  // Groups available in the popover — only those with members.
  const availableGroups = useMemo(
    () => allGroups.filter((g) => memberIds(g).length > 0),
    [allGroups]
  );

  // Prompts offered in the popover — not already selected and not implicitly
  // covered by a fully-selected group.
  const availablePrompts = useMemo(
    () =>
      [...allPrompts]
        .filter((p) => !selectedSet.has(p.id) && !coveredIds.has(p.id))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        ),
    [allPrompts, selectedSet, coveredIds]
  );

  const toggleGroup = (group: PromptGroup) => {
    onChange(toggleGroupSelection(group, value, allGroups));
  };

  const togglePrompt = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div data-testid={testId} className="grid gap-1.5">
      {label && (
        <span className="text-[12px] text-[var(--color-text-muted)]">{label}</span>
      )}
      <div className="flex flex-wrap gap-1.5 items-center min-h-[32px] px-1 py-1 rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)]">
        {fullySelectedGroups.map((g) => (
          <GroupChip
            key={g.id}
            group={g}
            onRemove={() => toggleGroup(g)}
            testId={`${testId}-group-chip-${g.id}`}
          />
        ))}

        {visibleSelectedPrompts.map((p) => (
          <Chip
            key={p.id}
            name={p.name}
            color={p.color}
            size="sm"
            onRemove={() => togglePrompt(p.id)}
            onClick={onOpenPrompt ? () => onOpenPrompt(p.id) : undefined}
            className={onOpenPrompt ? "cursor-pointer" : undefined}
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
              {fullySelectedGroups.length === 0 && visibleSelectedPrompts.length === 0
                ? availableGroups.length > 0
                  ? "Add groups or prompts"
                  : "Add prompts"
                : "Add"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[320px] p-0">
            <Command shouldFilter loop>
              <div className="border-b border-[var(--color-border)] px-2">
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder={
                    availableGroups.length > 0
                      ? "Search groups or prompts…"
                      : "Search prompts…"
                  }
                  className="w-full h-9 bg-transparent outline-none text-[13px] placeholder:text-[var(--color-text-subtle)]"
                />
              </div>
              <Command.List className="max-h-[320px] overflow-y-auto scroll-thin py-1">
                <Command.Empty className="px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
                  No matches
                </Command.Empty>

                {availableGroups.length > 0 && (
                  <div className="pt-1 pb-2">
                    <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                      Groups
                    </div>
                    {/* cmdk-group-items attr is load-bearing — without it the
                        search-reorder calls appendChild(null) and crashes the
                        whole tree on first keystroke. See bug #27. */}
                    <div cmdk-group-items="" className="flex flex-wrap gap-1.5 px-2">
                      {availableGroups.map((g) => {
                        const covered = isGroupFullyCovered(g, selectedSet);
                        return (
                          <Command.Item
                            key={g.id}
                            value={g.id}
                            keywords={[g.name, "group"]}
                            onSelect={() => {
                              toggleGroup(g);
                              setSearch("");
                            }}
                            data-fully-selected={covered || undefined}
                            data-testid={`${testId}-group-pick-${g.id}`}
                            className="cursor-pointer rounded-full outline-none [&[data-selected=true]>span]:bg-[var(--active-overlay)]"
                          >
                            <GroupPickChip group={g} selected={covered} />
                          </Command.Item>
                        );
                      })}
                    </div>
                  </div>
                )}

                {availableGroups.length > 0 && availablePrompts.length > 0 && (
                  <div
                    aria-hidden
                    className="mx-2 my-1 h-px bg-[var(--color-border)]"
                  />
                )}

                {availablePrompts.length > 0 && (
                  <div className="pt-1 pb-2">
                    <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                      Prompts
                    </div>
                    <div cmdk-group-items="" className="flex flex-wrap gap-1.5 px-2">
                      {availablePrompts.map((p) => (
                        // Value is the id (ids and names can collide across
                        // the Groups/Prompts sections — and two prompts can
                        // share a name outright). `keywords` is what users
                        // actually type against.
                        <Command.Item
                          key={p.id}
                          value={p.id}
                          keywords={[p.name]}
                          onSelect={() => {
                            togglePrompt(p.id);
                            setSearch("");
                          }}
                          className="cursor-pointer rounded-full outline-none [&[data-selected=true]>span]:bg-[var(--active-overlay)]"
                        >
                          <Chip name={p.name} color={p.color} size="sm" />
                        </Command.Item>
                      ))}
                    </div>
                  </div>
                )}

                {availableGroups.length === 0 && availablePrompts.length === 0 && (
                  <div className="px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
                    Everything is already selected
                  </div>
                )}
              </Command.List>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/** Chip rendered in the selected row for a fully-covered group. Distinct
 *  from regular prompt chips (folder icon, group's tint) so it's obvious
 *  the chip stands for a collection. */
function GroupChip({
  group,
  onRemove,
  testId,
}: {
  group: PromptGroup;
  onRemove: () => void;
  testId: string;
}) {
  const tint = group.color || "#7a746a";
  return (
    <span
      data-testid={testId}
      title={`Group: ${group.name}`}
      className={cn(
        "inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[11px]",
        "bg-[var(--hover-overlay)] text-[var(--color-text)]",
        "border tracking-tight whitespace-nowrap shrink-0"
      )}
      style={{ borderColor: `${tint}55` }}
    >
      <Folder size={11} style={{ color: tint }} />
      <span className="truncate">{group.name}</span>
      <span className="text-[var(--color-text-subtle)] tabular-nums">
        ·{memberIds(group).length}
      </span>
      <button
        type="button"
        aria-label={`Remove ${group.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="ml-0.5 inline-flex items-center justify-center h-4 rounded-full text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
      >
        <X size={10} />
      </button>
    </span>
  );
}

/** Non-interactive chip used inside the popover grid. The `selected` flag
 *  highlights groups whose members are already fully selected — clicking
 *  them again deselects every member at once. */
function GroupPickChip({
  group,
  selected,
}: {
  group: PromptGroup;
  selected?: boolean;
}) {
  const tint = group.color || "#7a746a";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[11px]",
        "border tracking-tight whitespace-nowrap shrink-0",
        selected
          ? "bg-[var(--active-overlay)] text-[var(--color-text)]"
          : "bg-[var(--hover-overlay)] text-[var(--color-text)]"
      )}
      style={{
        borderColor: selected ? tint : `${tint}55`,
      }}
    >
      {selected ? (
        <Check size={11} style={{ color: tint }} />
      ) : (
        <Folder size={11} style={{ color: tint }} />
      )}
      <span className="truncate">{group.name}</span>
      <span className="text-[var(--color-text-subtle)] tabular-nums">
        ·{memberIds(group).length}
      </span>
    </span>
  );
}
