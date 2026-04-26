import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Folder, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { Chip } from "../ui/Chip.js";
import type { Prompt, PromptGroup } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

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
 * - Groups appear as chips only when every one of their members is in
 *   `value`. Unchecking a group chip removes just the ids that belonged
 *   exclusively to that group (i.e. not also covered by another fully-
 *   selected group). Checking a group adds all members at once.
 * - Individual prompts that are part of a fully-selected group are hidden
 *   from both the selected row and the "Add" popover — the group chip
 *   represents them.
 *
 * Used by BoardEditDialog, ColumnEditDialog, and the board create form.
 */
/** Defensive accessor — older backend builds don't populate `member_ids`
 *  in list responses. Treating it as an empty array lets us render without
 *  a runtime crash while the hub catches up. */
function memberIds(g: PromptGroup): string[] {
  return g.member_ids ?? [];
}

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
    () =>
      allGroups.filter(
        (g) => memberIds(g).length > 0 && memberIds(g).every((id) => selectedSet.has(id))
      ),
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
    const memberSet = new Set(memberIds(group));
    const fullyCovered = memberIds(group).every((id) => selectedSet.has(id));

    if (fullyCovered) {
      // Remove only the ids that are NOT also covered by another fully-
      // selected group — otherwise we'd silently tear down another group's
      // coverage when the user only meant to unchecked this one.
      const stillCoveredByOthers = new Set<string>();
      for (const other of fullySelectedGroups) {
        if (other.id === group.id) continue;
        for (const id of memberIds(other)) stillCoveredByOthers.add(id);
      }
      onChange(
        value.filter((id) => !memberSet.has(id) || stillCoveredByOthers.has(id))
      );
    } else {
      // Add every missing member at the end, preserving existing order.
      const next = [...value];
      for (const id of memberIds(group)) {
        if (!selectedSet.has(id)) next.push(id);
      }
      onChange(next);
    }
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
                      {availableGroups.map((g) => (
                        <Command.Item
                          key={g.id}
                          value={g.id}
                          keywords={[g.name, "group"]}
                          onSelect={() => {
                            toggleGroup(g);
                            setSearch("");
                          }}
                          className="cursor-pointer rounded-full outline-none [&[data-selected=true]>span]:bg-[var(--active-overlay)]"
                        >
                          <GroupPickChip group={g} />
                        </Command.Item>
                      ))}
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

/** Non-interactive chip used inside the popover grid. */
function GroupPickChip({ group }: { group: PromptGroup }) {
  const tint = group.color || "#7a746a";
  return (
    <span
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
    </span>
  );
}
