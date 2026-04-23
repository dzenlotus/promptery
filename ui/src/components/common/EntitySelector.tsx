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

export interface EntityOption {
  id: string;
  name: string;
  color: string;
}

interface Props<T extends EntityOption> {
  label: string;
  entities: T[];
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  /** When supplied, chips become drag-reorderable. */
  onReorder?: (nextIds: string[]) => void;
  addButtonLabel?: string;
  emptyHint?: string;
  disabled?: boolean;
  disabledHint?: string;
  testId?: string;
}

/**
 * Generic multi-select: label, row of chips for the current selection, and a
 * "+ Add" popover laying out remaining options as inline chips (wraps like a
 * tag cloud, not a vertical list). Reordering is enabled by passing
 * `onReorder`.
 */
export function EntitySelector<T extends EntityOption>({
  label,
  entities,
  selectedIds,
  onAdd,
  onRemove,
  onReorder,
  addButtonLabel = "Add",
  emptyHint,
  disabled,
  disabledHint,
  testId,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => selectedIds.map((id) => entities.find((e) => e.id === id)).filter(Boolean) as T[],
    [selectedIds, entities]
  );
  const availableToAdd = useMemo(
    () => entities.filter((e) => !selectedSet.has(e.id)),
    [entities, selectedSet]
  );

  const handleSelect = (id: string) => {
    onAdd(id);
    setOpen(false);
    setSearch("");
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = selectedIds.indexOf(active.id as string);
    const newIndex = selectedIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(selectedIds, oldIndex, newIndex));
  };

  const dndEnabled = Boolean(onReorder) && !disabled;

  const chipsContent = selectedItems.map((it) =>
    dndEnabled ? (
      <SortableChip
        key={it.id}
        item={it}
        onRemove={() => onRemove(it.id)}
        testId={testId ? `${testId}-chip-${it.id}` : undefined}
      />
    ) : (
      <Chip
        key={it.id}
        name={it.name}
        color={it.color}
        size="sm"
        onRemove={disabled ? undefined : () => onRemove(it.id)}
        data-testid={testId ? `${testId}-chip-${it.id}` : undefined}
      />
    )
  );

  return (
    <div data-testid={testId} className="grid gap-2">
      <div className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {dndEnabled ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={selectedIds} strategy={rectSortingStrategy}>
              {chipsContent}
            </SortableContext>
          </DndContext>
        ) : (
          chipsContent
        )}

        {disabled ? (
          <span className="text-[12px] text-[var(--color-text-subtle)] italic">
            {disabledHint ?? "Save first to manage this list."}
          </span>
        ) : entities.length === 0 ? (
          <span className="text-[12px] text-[var(--color-text-subtle)]">
            {emptyHint ?? "Nothing to add yet."}
          </span>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid={testId ? `${testId}-add` : undefined}
                className={cn(
                  "inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] shrink-0",
                  "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                  "border border-dashed border-[var(--color-border)] hover:bg-[var(--hover-overlay)]",
                  "transition-colors"
                )}
              >
                <Plus size={11} />
                <span>{addButtonLabel}</span>
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
                    placeholder={`Search ${label.toLowerCase()}…`}
                    className="w-full h-9 bg-transparent outline-none text-[13px] placeholder:text-[var(--color-text-subtle)]"
                  />
                </div>
                {/* Wrap items inside Command.List so they sit in a real flex-wrap
                    container — otherwise cmdk's internal sizer div forces them
                    into a vertical block stack.

                    The `cmdk-group-items=""` attribute is LOAD-BEARING. cmdk's
                    search-reorder walks every CommandItem and calls
                    `item.closest('[cmdk-group-items=""]').appendChild(...)`.
                    Without this attribute the selector falls through to
                    `item.closest('[cmdk-group-items=""] > *')` which returns
                    null whenever items sit inside any non-cmdk wrapper — and
                    `appendChild(null)` crashes the whole tree on first
                    keystroke. See bug #27. */}
                <Command.List className="max-h-[280px] overflow-y-auto scroll-thin">
                  <div
                    cmdk-group-items=""
                    className="flex flex-wrap items-start gap-1.5 p-2"
                  >
                    <Command.Empty className="w-full px-1 py-2 text-[12px] text-[var(--color-text-subtle)]">
                      {availableToAdd.length === 0
                        ? "All available items already added"
                        : "No matches"}
                    </Command.Empty>
                    {availableToAdd.map((it) => (
                      // value must be unique across items — name collisions
                      // corrupt cmdk's internal value->element map and crash
                      // `appendChild` on the next keystroke. Keep id as value
                      // and route search through `keywords`.
                      <Command.Item
                        key={it.id}
                        value={it.id}
                        keywords={[it.name]}
                        onSelect={() => handleSelect(it.id)}
                        className={cn(
                          "inline-flex items-center rounded-full cursor-pointer outline-none p-[2px]",
                          "transition-colors",
                          "data-[selected=true]:bg-[var(--hover-overlay)]"
                        )}
                      >
                        <Chip name={it.name} color={it.color} size="sm" />
                      </Command.Item>
                    ))}
                  </div>
                </Command.List>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

function SortableChip<T extends EntityOption>({
  item,
  onRemove,
  testId,
}: {
  item: T;
  onRemove: () => void;
  testId?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
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
      name={item.name}
      color={item.color}
      size="sm"
      onRemove={onRemove}
      style={style}
      data-testid={testId}
      {...attributes}
      {...listeners}
    />
  );
}
