import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Plus } from "lucide-react";
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
import type { Prompt } from "../../lib/types.js";

interface Props {
  allPrompts: Prompt[];
  inheritedItems: Prompt[];
  directIds: string[];
  onDirectChange: (nextIds: string[]) => void;
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
  inheritedItems,
  directIds,
  onDirectChange,
  roleName,
  onOpenPrompt,
  testId = "task-prompts-editor",
}: Props) {
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

  const inheritedTooltip = roleName
    ? `Inherited from role «${roleName}» — change via role selector`
    : "Inherited from role — change via role selector";

  return (
    <div data-testid={testId} className="flex flex-wrap items-center gap-1.5">
      {inheritedItems.map((it) => (
        <Chip
          key={`inh-${it.id}`}
          name={it.name}
          color={it.color}
          size="sm"
          inherited
          tooltip={it.short_description ? `${it.short_description} (${inheritedTooltip})` : inheritedTooltip}
          onClick={onOpenPrompt ? () => onOpenPrompt(it.id) : undefined}
          className={onOpenPrompt ? "cursor-pointer" : undefined}
          data-testid={`${testId}-inherited-${it.id}`}
        />
      ))}

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
                placeholder="Search prompts…"
                className="w-full h-9 bg-transparent outline-none text-[13px] placeholder:text-[var(--color-text-subtle)]"
              />
            </div>
            <Command.List className="max-h-[280px] overflow-y-auto scroll-thin">
              {/* cmdk-group-items attr is load-bearing — see bug #27.
                  Without it the search-reorder calls appendChild(null) on
                  first keystroke because cmdk can't find a group wrapper and
                  its fallback selector returns null on our custom wrapper. */}
              <div cmdk-group-items="" className="flex flex-wrap items-start gap-1.5 p-2">
                <Command.Empty className="w-full px-1 py-2 text-[12px] text-[var(--color-text-subtle)]">
                  {allPrompts.length === 0
                    ? "No prompts yet. Create some in the Prompts view."
                    : availableToAdd.length === 0
                      ? "All available prompts already added"
                      : "No matches"}
                </Command.Empty>
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
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
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
