import { Plus } from "lucide-react";
import { EntityRow } from "../sidebar/EntityRow.js";
import { DraftRow } from "../sidebar/DraftRow.js";
import { IconButton } from "../ui/IconButton.js";
import { SidebarSection } from "../../layout/SidebarSection.js";
import type { Prompt } from "../../lib/types.js";

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
      {isLoading && prompts.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">Loading…</div>
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
    </SidebarSection>
  );
}
