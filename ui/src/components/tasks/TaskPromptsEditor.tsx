import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Check, Folder, Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { Chip } from "../ui/Chip.js";
import { cn } from "../../lib/cn.js";
import type { Prompt, PromptGroup } from "../../lib/types.js";
import {
  isGroupFullyCovered,
  memberIds,
  toggleGroupSelection,
} from "../common/promptGroupToggle.js";

interface Props {
  allPrompts: Prompt[];
  /** Optional list of prompt groups. When provided, the picker renders a
   *  "Groups" section above the prompts list — clicking a group flattens
   *  its members into the direct list (group itself is never stored). */
  allGroups?: PromptGroup[];
  inheritedItems: Prompt[];
  directIds: string[];
  onDirectChange: (nextIds: string[]) => void;
  /**
   * Prompt ids the task explicitly disabled via per-task overrides. The
   * matching inherited chips are rendered with a strike-through / muted
   * style. Click an inherited chip to flip the override (the parent calls
   * back through `onToggleDisabled`).
   */
  disabledPromptIds?: string[];
  /**
   * Optional callback for the inherited-chip click. When omitted (e.g. in
   * create mode where the task doesn't exist yet) the chips render as
   * read-only and the click is a no-op. Receives the current "disabled"
   * state — true means "unset the override" (re-enable), false means
   * "create override with enabled=0" (disable).
   */
  onToggleDisabled?: (promptId: string, currentlyDisabled: boolean) => void;
  roleName?: string | null;
  /** Navigate to a prompt's edit page. */
  onOpenPrompt?: (id: string) => void;
  testId?: string;
}

/**
 * Task-scoped editor for the prompts list:
 *  - inherited chips are read-only (they come from the selected role),
 *  - direct chips are removable AND re-orderable via drag-and-drop,
 *  - a + button opens a popover to attach new prompts from the library, laid
 *    out as inline chips wrapping across rows.
 *
 * All changes stay in local state; the parent decides when (and whether) to
 * flush them to the server.
 */
export function TaskPromptsEditor({
  allPrompts,
  allGroups = [],
  inheritedItems,
  directIds,
  onDirectChange,
  disabledPromptIds,
  onToggleDisabled,
  roleName,
  onOpenPrompt,
  testId = "task-prompts-editor",
}: Props) {
  const disabledSet = useMemo(
    () => new Set(disabledPromptIds ?? []),
    [disabledPromptIds]
  );
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const directSet = useMemo(() => new Set(directIds), [directIds]);
  const inheritedSet = useMemo(
    () => new Set(inheritedItems.map((i) => i.id)),
    [inheritedItems]
  );

  const directItems = useMemo(
    () =>
      directIds
        .map((id) => allPrompts.find((p) => p.id === id))
        .filter((p): p is Prompt => Boolean(p)),
    [directIds, allPrompts]
  );

  const availableToAdd = useMemo(
    () =>
      allPrompts.filter(
        (p) => !directSet.has(p.id) && !inheritedSet.has(p.id)
      ),
    [allPrompts, directSet, inheritedSet]
  );

  // Only non-empty groups appear in the picker. Groups whose members are
  // entirely inherited from the role would be no-ops; we still surface them
  // so the user can see the option, but the toggle logic below will keep
  // the inherited ids out of `directIds` (they're already provided).
  const availableGroups = useMemo(
    () => allGroups.filter((g) => memberIds(g).length > 0),
    [allGroups]
  );

  const toggleGroup = (group: PromptGroup) => {
    // Filter members so we never push an inherited id into the direct list —
    // it would create a phantom duplicate when the resolver flattens.
    const filteredMembers = memberIds(group).filter(
      (id) => !inheritedSet.has(id)
    );
    if (filteredMembers.length === 0) return;
    const filteredGroup: PromptGroup = { ...group, member_ids: filteredMembers };
    onDirectChange(
      toggleGroupSelection(filteredGroup, directIds, [filteredGroup])
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = directIds.indexOf(active.id as string);
    const newIndex = directIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    onDirectChange(arrayMove(directIds, oldIndex, newIndex));
  };

  const baseInheritedTooltip = roleName
    ? `Inherited from role «${roleName}» — change via role selector`
    : "Inherited from role";

  const tooltipFor = (disabled: boolean): string =>
    onToggleDisabled === undefined
      ? baseInheritedTooltip
      : disabled
        ? `${baseInheritedTooltip}. Disabled for this task — click to re-enable.`
        : `${baseInheritedTooltip}. Click to disable for this task only.`;

  const handleInheritedClick = (promptId: string) => {
    if (!onToggleDisabled) return;
    onToggleDisabled(promptId, disabledSet.has(promptId));
  };

  return (
    <div data-testid={testId} className="flex flex-wrap items-center gap-1.5">
      {inheritedItems.map((it) => {
        const disabled = disabledSet.has(it.id);
        // Toggle-disable takes precedence over open-prompt; if neither is
        // wired the chip stays inert. The override toggle is the primary
        // interaction in the task dialog where this editor lives.
        const handleClick = onToggleDisabled
          ? (e: React.MouseEvent) => {
              e.stopPropagation();
              handleInheritedClick(it.id);
            }
          : onOpenPrompt
          ? () => onOpenPrompt(it.id)
          : undefined;
        const baseTooltip = onToggleDisabled
          ? tooltipFor(disabled)
          : inheritedTooltip;
        return (
          <Chip
            key={`inh-${it.id}`}
            name={it.name}
            color={it.color}
            size="sm"
            inherited
            disabled={disabled}
            tooltip={
              it.short_description
                ? `${it.short_description} (${baseTooltip})`
                : baseTooltip
            }
            onClick={handleClick}
            className={!onToggleDisabled && onOpenPrompt ? "cursor-pointer" : undefined}
            data-testid={`${testId}-inherited-${it.id}`}
            data-disabled={disabled ? "true" : "false"}
          />
        );
      })}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={directIds} strategy={rectSortingStrategy}>
          {directItems.map((it) => (
            <SortableDirectChip
              key={it.id}
              prompt={it}
              onRemove={() => onDirectChange(directIds.filter((x) => x !== it.id))}
              onOpen={onOpenPrompt ? () => onOpenPrompt(it.id) : undefined}
              testId={`${testId}-direct-${it.id}`}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={`${testId}-add`}
            className={cn(
              "inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] shrink-0",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              "border border-dashed border-[var(--color-border)] hover:bg-[var(--hover-overlay)]",
              "transition-colors"
            )}
          >
            <Plus size={11} />
            <span>Add prompt</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[320px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
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
            <Command.List className="max-h-[280px] overflow-y-auto scroll-thin">
              <Command.Empty className="w-full px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
                {allPrompts.length === 0
                  ? "No prompts yet. Create some in the Prompts view."
                  : availableToAdd.length === 0 && availableGroups.length === 0
                    ? "All available prompts already added"
                    : "No matches"}
              </Command.Empty>

              {availableGroups.length > 0 && (
                <div className="pt-1 pb-2">
                  <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                    Groups
                  </div>
                  {/* cmdk-group-items attr is load-bearing — see bug #27. */}
                  <div cmdk-group-items="" className="flex flex-wrap gap-1.5 px-2">
                    {availableGroups.map((g) => {
                      // Cover-state derived from `directIds` only (inherited
                      // ids never live in the direct list). A group whose
                      // members are entirely inherited reads as "uncovered"
                      // here — toggling it would still be a no-op via the
                      // filter inside `toggleGroup`.
                      const filteredMembers = memberIds(g).filter(
                        (id) => !inheritedSet.has(id)
                      );
                      const covered =
                        filteredMembers.length > 0 &&
                        filteredMembers.every((id) => directSet.has(id));
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

              {availableGroups.length > 0 && availableToAdd.length > 0 && (
                <div
                  aria-hidden
                  className="mx-2 my-1 h-px bg-[var(--color-border)]"
                />
              )}

              {availableToAdd.length > 0 && (
                <div className="pt-1 pb-2">
                  {availableGroups.length > 0 && (
                    <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                      Prompts
                    </div>
                  )}
                  <div cmdk-group-items="" className="flex flex-wrap items-start gap-1.5 p-2">
                    {availableToAdd.map((it) => (
                      <Command.Item
                        key={it.id}
                        value={it.id}
                        keywords={[it.name]}
                        onSelect={() => {
                          onDirectChange([...directIds, it.id]);
                          setAddOpen(false);
                          setSearch("");
                        }}
                        className={cn(
                          "inline-flex items-center rounded-full cursor-pointer outline-none p-[2px]",
                          "transition-colors",
                          "data-[selected=true]:bg-[var(--hover-overlay)]"
                        )}
                      >
                        <Chip name={it.name} color={it.color} size="sm" tooltip={it.short_description ?? undefined} />
                      </Command.Item>
                    ))}
                  </div>
                </div>
              )}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Non-interactive chip used inside the Groups section of the popover.
 *  Mirrors `PromptsMultiSelector`'s GroupPickChip so the visual contract is
 *  the same across every prompt picker — folder icon when uncovered, check
 *  mark when fully covered. */
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

function SortableDirectChip({
  prompt,
  onRemove,
  onOpen,
  testId,
}: {
  prompt: Prompt;
  onRemove: () => void;
  onOpen?: () => void;
  testId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: prompt.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab" as const,
    touchAction: "none" as const,
  };
  return (
    <Chip
      ref={setNodeRef}
      name={prompt.name}
      color={prompt.color}
      size="sm"
      onRemove={onRemove}
      tooltip={prompt.short_description ?? undefined}
      onClick={onOpen}
      style={style}
      data-testid={testId}
      {...attributes}
      {...listeners}
    />
  );
}
