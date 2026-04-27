import { useState } from "react";
import { Plus } from "lucide-react";
import { EntityRow } from "../sidebar/EntityRow.js";
import { IconButton } from "../ui/IconButton.js";
import { SidebarSection } from "../../layout/SidebarSection.js";
import { PromptGroupsList } from "./PromptGroupsList.js";
import { PromptGroupDialog } from "./PromptGroupDialog.js";
import { PromptGroupDeleteDialog } from "./PromptGroupDeleteDialog.js";
import { PromptCreateDialog } from "./PromptCreateDialog.js";
import { DraggablePromptRow } from "./DraggablePromptRow.js";
import { Tooltip } from "../ui/Tooltip.js";
import { TagChip } from "./TagChip.js";
import { PromptsTagFilter } from "./PromptsTagFilter.js";
import { usePromptTagsMap } from "../../hooks/useTags.js";
import { TokenBadge } from "../common/TokenBadge.js";
import { useTokenBadgeConfig } from "../../hooks/useTokenBadge.js";
import type { Prompt, PromptGroup } from "../../lib/types.js";

interface Props {
  prompts: Prompt[];
  isLoading: boolean;
  selectedId: string | null;
  renamingId: string | null;
  onSelect: (id: string) => void;
  onRequestRename: (id: string) => void;
  onCommitRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onColorPick: (id: string, color: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** When true, each prompt row is wrapped with @dnd-kit's useDraggable.
   *  Must be rendered inside a DndContext — caller is responsible. */
  draggable?: boolean;
  /** Single-tag filter state lifted into PromptsView so URL/query handling
   *  has a chance to flow through. `null` means "no filter applied" — the
   *  full prompts list shows. */
  activeTagId?: string | null;
  onActiveTagChange?: (tagId: string | null) => void;
}

export function PromptsSidebarList({
  prompts,
  isLoading,
  selectedId,
  renamingId,
  onSelect,
  onRequestRename,
  onCommitRename,
  onCancelRename,
  onColorPick,
  onDuplicate,
  onDelete,
  draggable = false,
  activeTagId = null,
  onActiveTagChange,
}: Props) {
  // Dialog state is hoisted here so the sidebar owns its sub-affordances
  // (groups + new-prompt) end-to-end. PromptsView doesn't need to know.
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PromptGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<PromptGroup | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { tagsByPrompt } = usePromptTagsMap();
  const tokenCfg = useTokenBadgeConfig();

  // Apply the single-tag filter — when active, only prompts whose tag set
  // contains `activeTagId` survive. The filter is intentionally cheap so
  // the user can toggle tags freely without a server round trip.
  const visiblePrompts = activeTagId
    ? prompts.filter((p) => (tagsByPrompt.get(p.id) ?? []).some((t) => t.id === activeTagId))
    : prompts;

  return (
    <SidebarSection
      label="Prompts"
      action={
        <div className="flex items-center gap-0.5">
          {onActiveTagChange ? (
            <PromptsTagFilter
              activeTagId={activeTagId}
              onChange={onActiveTagChange}
            />
          ) : null}
          <IconButton
            label="New prompt"
            size="sm"
            data-testid="prompts-new-button"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} />
          </IconButton>
        </div>
      }
    >
      <div className="grid gap-1">
        <PromptGroupsList
          onCreate={() => {
            setEditingGroup(null);
            setGroupDialogOpen(true);
          }}
          onEdit={(g) => {
            setEditingGroup(g);
            setGroupDialogOpen(true);
          }}
          onDelete={(g) => setDeletingGroup(g)}
        />

        <div
          aria-hidden
          className="mx-3 my-1 h-px bg-[var(--color-border)]"
        />

        {isLoading && prompts.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">
            Loading…
          </div>
        ) : visiblePrompts.length === 0 ? (
          <div
            data-testid={activeTagId ? "prompts-empty-filtered" : "prompts-empty"}
            className="px-3 py-6 text-center text-[12px] text-[var(--color-text-subtle)]"
          >
            {activeTagId
              ? "No prompts match this tag."
              : "No prompts yet"}
          </div>
        ) : (
          visiblePrompts.map((p) => {
            const tags = tagsByPrompt.get(p.id) ?? [];
            const row = (
              <Tooltip key={p.id} content={p.short_description ?? ""} side="right">
                <div className="grid gap-0.5">
                  <EntityRow
                    item={p}
                    selected={selectedId === p.id}
                    isRenaming={renamingId === p.id}
                    onSelect={() => onSelect(p.id)}
                    onRequestRename={() => onRequestRename(p.id)}
                    commitRename={(n) => onCommitRename(p.id, n)}
                    cancelRename={onCancelRename}
                    onColorPick={(c) => onColorPick(p.id, c)}
                    onDuplicate={() => onDuplicate(p.id)}
                    onDelete={() => onDelete(p.id)}
                    testIdPrefix="prompt-row"
                    trailing={
                      tokenCfg.enabled ? (
                        <TokenBadge
                          count={p.token_count ?? 0}
                          thresholds={tokenCfg.thresholds}
                          size="xs"
                          testId={`prompt-token-badge-${p.id}`}
                        />
                      ) : undefined
                    }
                  />
                  {tags.length > 0 && (
                    <div
                      data-testid={`prompt-row-tags-${p.id}`}
                      className="flex flex-wrap gap-1 pl-7 pr-2 pb-1"
                    >
                      {tags.map((t) => (
                        <TagChip
                          key={t.id}
                          tag={t}
                          // Clicking a chip on a row drives the active filter
                          // — same mental model as the filter popover.
                          onClick={
                            onActiveTagChange
                              ? (e) => {
                                  e.stopPropagation();
                                  onActiveTagChange(
                                    activeTagId === t.id ? null : t.id
                                  );
                                }
                              : undefined
                          }
                          selected={activeTagId === t.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Tooltip>
            );
            return draggable ? (
              <DraggablePromptRow key={p.id} promptId={p.id}>
                {row}
              </DraggablePromptRow>
            ) : (
              row
            );
          })
        )}
      </div>

      <PromptGroupDialog
        open={groupDialogOpen}
        onOpenChange={(o) => {
          setGroupDialogOpen(o);
          if (!o) setEditingGroup(null);
        }}
        group={editingGroup}
      />
      <PromptGroupDeleteDialog
        group={deletingGroup}
        open={deletingGroup !== null}
        onOpenChange={(o) => !o && setDeletingGroup(null)}
      />
      <PromptCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </SidebarSection>
  );
}
