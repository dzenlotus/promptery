import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Folder, GripVertical } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageLayout } from "../layout/PageLayout.js";
import { ScrollArea } from "../components/ui/ScrollArea.js";
import { PromptsSidebarList } from "../components/prompts/PromptsSidebarList.js";
import { SIDEBAR_PROMPT_DRAG_PREFIX } from "../components/prompts/DraggablePromptRow.js";
import {
  GroupMemberDragPreview,
  SidebarPromptDragPreview,
} from "../components/prompts/PromptDragPreviews.js";
import { usePromptGroup } from "../hooks/usePromptGroups.js";
import { usePrompts } from "../hooks/usePrompts.js";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";
import type { Prompt, PromptInGroup } from "../lib/types.js";
import { cn } from "../lib/cn.js";

const MEMBER_DRAG_PREFIX = "member:";
const DROP_ZONE_ID = "group-drop-zone";

/**
 * Group detail page with drag-and-drop support:
 *
 * - Prompts in the sidebar are draggable (see DraggablePromptRow). Dropping
 *   one on the main area adds it to the group.
 * - Group members in the main area are themselves sortable; dragging one
 *   onto another reorders the list and flushes via setGroupPrompts.
 *
 * Both source kinds share the same DndContext at the top of this view so
 * a cross-container drop (sidebar → main) and an in-list sort use the
 * same pointer sensors.
 */
export function PromptGroupView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: group, isLoading, isError } = usePromptGroup(id ?? null);
  const { data: allPrompts = [] } = usePrompts();

  const prompts = useMemo(
    () =>
      [...allPrompts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [allPrompts]
  );

  // 5px activation distance so a plain click on a prompt still navigates
  // instead of being misread as the start of a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const addMutation = useMutation({
    mutationFn: (promptId: string) => api.promptGroups.addPrompt(id!, promptId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.promptGroup(id!) });
      qc.invalidateQueries({ queryKey: qk.promptGroups });
    },
    onError: (err: Error) =>
      toast.error(err.message || "Failed to add prompt to group"),
  });

  const reorderMutation = useMutation({
    mutationFn: (nextIds: string[]) => api.promptGroups.setPrompts(id!, nextIds),
    // Optimistic update: write the new order into the detail cache so the
    // list doesn't briefly snap back to the old order before the network
    // response lands.
    onMutate: async (nextIds) => {
      if (!group) return;
      const key = qk.promptGroup(id!);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      qc.setQueryData(key, {
        ...group,
        prompts: nextIds
          .map((pid) => group.prompts.find((p) => p.id === pid))
          .filter((p): p is PromptInGroup => !!p),
        member_ids: nextIds,
      });
      return { previous };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.promptGroup(id!), ctx.previous);
      toast.error(err.message || "Failed to reorder prompts");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.promptGroup(id!) }),
  });

  // Active drag descriptor — seeds DragOverlay content while a drag is in
  // flight. Cleared on end / cancel.
  type ActiveDrag =
    | { kind: "sidebar-prompt"; prompt: Prompt }
    | { kind: "member"; member: PromptInGroup };
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith(SIDEBAR_PROMPT_DRAG_PREFIX)) {
      const pid = id.slice(SIDEBAR_PROMPT_DRAG_PREFIX.length);
      const p = allPrompts.find((x) => x.id === pid);
      if (p) setActiveDrag({ kind: "sidebar-prompt", prompt: p });
      return;
    }
    if (id.startsWith(MEMBER_DRAG_PREFIX) && group) {
      const pid = id.slice(MEMBER_DRAG_PREFIX.length);
      const m = group.prompts.find((x) => x.id === pid);
      if (m) setActiveDrag({ kind: "member", member: m });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || !group) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Case 1: sidebar prompt → main area (add to group).
    if (activeId.startsWith(SIDEBAR_PROMPT_DRAG_PREFIX)) {
      const promptId = activeId.slice(SIDEBAR_PROMPT_DRAG_PREFIX.length);
      const alreadyIn = group.prompts.some((p) => p.id === promptId);
      if (alreadyIn) return;
      // Accept any drop whose target is part of the group's main area —
      // the outer drop zone or any existing member row inside it.
      const landedOnGroup =
        overId === DROP_ZONE_ID || overId.startsWith(MEMBER_DRAG_PREFIX);
      if (!landedOnGroup) return;
      addMutation.mutate(promptId);
      return;
    }

    // Case 2: reorder within the group's member list.
    if (activeId.startsWith(MEMBER_DRAG_PREFIX) && overId.startsWith(MEMBER_DRAG_PREFIX)) {
      if (activeId === overId) return;
      const fromId = activeId.slice(MEMBER_DRAG_PREFIX.length);
      const toId = overId.slice(MEMBER_DRAG_PREFIX.length);
      const ids = group.prompts.map((p) => p.id);
      const from = ids.indexOf(fromId);
      const to = ids.indexOf(toId);
      if (from < 0 || to < 0 || from === to) return;
      reorderMutation.mutate(arrayMove(ids, from, to));
    }
  };

  const sidebar = (
    <PromptsSidebarList
      prompts={prompts}
      isLoading={false}
      selectedId={null}
      showDraft={false}
      draftIsSelected={false}
      renamingId={null}
      onSelect={(pid) => setLocation(`/prompts/${pid}`)}
      onSelectDraft={() => setLocation("/prompts")}
      onCreateDraft={() => setLocation("/prompts")}
      onRequestRename={() => setLocation("/prompts")}
      onCommitRename={() => {}}
      onCancelRename={() => {}}
      onColorPick={() => {}}
      onDuplicate={() => setLocation("/prompts")}
      onDelete={() => setLocation("/prompts")}
      draggable
    />
  );

  const main = (() => {
    if (isLoading) {
      return (
        <div
          data-testid="prompt-group-view"
          data-state="loading"
          className="h-full grid place-items-center text-[var(--color-text-subtle)] text-[13px]"
        >
          Loading…
        </div>
      );
    }
    if (isError || !group) {
      return (
        <div
          data-testid="prompt-group-view"
          data-state="not-found"
          className="h-full grid place-items-center text-[var(--color-text-subtle)] text-[13px]"
        >
          Group not found
        </div>
      );
    }

    return (
      <GroupMainArea
        group={group}
        onOpenPrompt={(pid) => setLocation(`/prompts/${pid}`)}
      />
    );
  })();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <PageLayout sidebarContent={sidebar} mainContent={main} />
      {/* Portal-rendered floating visual — lives above every overflow-clip
          container (sidebar, main area), so the travelling chip never
          gets cropped and never inherits layout transforms. The source
          row stays dimmed in place (see DraggablePromptRow /
          SortableMemberRow) as a placeholder. */}
      <DragOverlay dropAnimation={null}>
        {activeDrag?.kind === "sidebar-prompt" ? (
          <SidebarPromptDragPreview prompt={activeDrag.prompt} />
        ) : activeDrag?.kind === "member" ? (
          <GroupMemberDragPreview member={activeDrag.member} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface GroupMainAreaProps {
  group: NonNullable<ReturnType<typeof usePromptGroup>["data"]>;
  onOpenPrompt: (id: string) => void;
}

function GroupMainArea({ group, onOpenPrompt }: GroupMainAreaProps) {
  const color = group.color || "#7a746a";
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: DROP_ZONE_ID,
    data: { type: "group-drop", groupId: group.id },
  });

  const sortableItems = useMemo(
    () => group.prompts.map((p) => `${MEMBER_DRAG_PREFIX}${p.id}`),
    [group.prompts]
  );

  return (
    <ScrollArea data-testid="prompt-group-view" className="h-full">
      <div data-group-id={group.id} className="p-8 max-w-[960px] mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <div
          className="h-9 w-9 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]"
          style={{ color }}
        >
          <Folder size={16} />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{group.name}</h1>
          <p className="text-[12px] text-[var(--color-text-muted)]">
            {group.prompts.length} prompt{group.prompts.length === 1 ? "" : "s"}
            <span className="mx-1.5">·</span>
            drag from sidebar to add, drag to reorder
          </p>
        </div>
      </header>

      <div
        ref={setDropRef}
        data-testid="group-drop-zone"
        className={cn(
          "rounded-lg transition-colors",
          isOver
            ? "outline outline-2 outline-offset-2 outline-[var(--color-accent)]"
            : undefined
        )}
      >
        {group.prompts.length === 0 ? (
          <div
            className={cn(
              "text-[13px] px-4 py-8 rounded-lg border border-dashed text-center transition-colors",
              isOver
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)]"
            )}
          >
            Drag a prompt here to add it to the group.
          </div>
        ) : (
          <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
            <ul className="grid gap-2">
              {group.prompts.map((p) => (
                <SortableMemberRow
                  key={p.id}
                  prompt={p}
                  onOpen={() => onOpenPrompt(p.id)}
                />
              ))}
            </ul>
          </SortableContext>
        )}
      </div>
      </div>
    </ScrollArea>
  );
}

function SortableMemberRow({
  prompt,
  onOpen,
}: {
  prompt: PromptInGroup;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${MEMBER_DRAG_PREFIX}${prompt.id}` });

  return (
    <li
      ref={setNodeRef}
      data-testid={`prompt-group-entry-${prompt.id}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // While this row is the active drag target the DragOverlay paints
        // the travelling visual for us — hide the source row almost fully
        // (keep a hairline so neighbours know the slot still exists).
        opacity: isDragging ? 0.08 : undefined,
      }}
      className={cn(
        "group rounded-lg border bg-[var(--hover-overlay)] px-3 py-3",
        "grid grid-cols-[auto_1fr] items-start gap-3",
        "transition-colors",
        isDragging
          ? "border-[var(--color-accent)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
      )}
    >
      {/* Drag handle — the grip icon. Keeps the rest of the card clickable
          so single click opens the prompt editor. */}
      <button
        type="button"
        aria-label={`Drag ${prompt.name}`}
        data-testid={`prompt-group-drag-${prompt.id}`}
        {...attributes}
        {...listeners}
        className={cn(
          "mt-0.5 h-6 w-6 inline-flex items-center justify-center rounded",
          "text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]",
          "cursor-grab active:cursor-grabbing",
          "opacity-0 group-hover:opacity-100 transition-opacity"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </button>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="min-w-0 cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: prompt.color || "#7a746a" }}
          />
          <h3 className="text-[14px] font-medium truncate">{prompt.name}</h3>
        </div>
        {prompt.content.trim().length > 0 && (
          <p className="text-[12px] text-[var(--color-text-muted)] line-clamp-2 whitespace-pre-wrap">
            {prompt.content}
          </p>
        )}
      </div>
    </li>
  );
}
