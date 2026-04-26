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
}: Props) {
  // Dialog state is hoisted here so the sidebar owns its sub-affordances
  // (groups + new-prompt) end-to-end. PromptsView doesn't need to know.
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PromptGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<PromptGroup | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <SidebarSection
      label="Prompts"
      action={
        <IconButton
          label="New prompt"
          size="sm"
          data-testid="prompts-new-button"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} />
        </IconButton>
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
        ) : prompts.length === 0 ? (
          <div
            data-testid="prompts-empty"
            className="px-3 py-6 text-center text-[12px] text-[var(--color-text-subtle)]"
          >
            No prompts yet
          </div>
        ) : (
          prompts.map((p) => {
            const row = (
              <Tooltip key={p.id} content={p.short_description ?? ""} side="right">
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
                />
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
