import { useState } from "react";
import { Plus } from "lucide-react";
import { EntityRow } from "../sidebar/EntityRow.js";
import { DraftRow } from "../sidebar/DraftRow.js";
import { IconButton } from "../ui/IconButton.js";
import { SidebarSection } from "../../layout/SidebarSection.js";
import { PromptGroupsList } from "./PromptGroupsList.js";
import { PromptGroupDialog } from "./PromptGroupDialog.js";
import { PromptGroupDeleteDialog } from "./PromptGroupDeleteDialog.js";
import type { Prompt, PromptGroup } from "../../lib/types.js";

interface Props {
  prompts: Prompt[];
  isLoading: boolean;
  selectedId: string | null;
  showDraft: boolean;
  draftIsSelected: boolean;
  renamingId: string | null;
  onSelect: (id: string) => void;
  onSelectDraft: () => void;
  onCreateDraft: () => void;
  onRequestRename: (id: string) => void;
  onCommitRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onColorPick: (id: string, color: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PromptsSidebarList({
  prompts,
  isLoading,
  selectedId,
  showDraft,
  draftIsSelected,
  renamingId,
  onSelect,
  onSelectDraft,
  onCreateDraft,
  onRequestRename,
  onCommitRename,
  onCancelRename,
  onColorPick,
  onDuplicate,
  onDelete,
}: Props) {
  // Dialog state is hoisted here so the sidebar owns the "groups" sub-section
  // end-to-end. Pushing it further up into PromptsView would force that view
  // to know about group-specific UI it doesn't otherwise care about.
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PromptGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<PromptGroup | null>(null);

  return (
    <SidebarSection
      label="Prompts"
      action={
        <IconButton
          label="New prompt"
          size="sm"
          data-testid="prompts-new-button"
          onClick={onCreateDraft}
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
        ) : prompts.length === 0 && !showDraft ? (
          <div
            data-testid="prompts-empty"
            className="px-3 py-6 text-center text-[12px] text-[var(--color-text-subtle)]"
          >
            No prompts yet
          </div>
        ) : (
          <>
            {showDraft && (
              <DraftRow
                placeholder="New prompt"
                selected={draftIsSelected}
                onSelect={onSelectDraft}
                testId="prompts-draft-row"
              />
            )}
            {prompts.map((p) => (
              <EntityRow
                key={p.id}
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
            ))}
          </>
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
    </SidebarSection>
  );
}
