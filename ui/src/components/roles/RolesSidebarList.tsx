import { Plus } from "lucide-react";
import { EntityRow } from "../sidebar/EntityRow.js";
import { DraftRow } from "../sidebar/DraftRow.js";
import { IconButton } from "../ui/IconButton.js";
import { SidebarSection } from "../../layout/SidebarSection.js";
import type { Role } from "../../lib/types.js";

interface Props {
  roles: Role[];
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

export function RolesSidebarList({
  roles,
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
      label="Roles"
      action={
        <IconButton
          label="New role"
          size="sm"
          data-testid="roles-new-button"
          onClick={onCreateDraft}
        >
          <Plus size={14} />
        </IconButton>
      }
    >
      {isLoading && roles.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">Loading…</div>
      ) : roles.length === 0 && !showDraft ? (
        <div
          data-testid="roles-empty"
          className="px-3 py-6 text-center text-[12px] text-[var(--color-text-subtle)]"
        >
          No roles yet
        </div>
      ) : (
        <>
          {showDraft && (
            <DraftRow
              placeholder="New role"
              selected={draftIsSelected}
              onSelect={onSelectDraft}
              testId="roles-draft-row"
            />
          )}
          {roles.map((r) => (
            <EntityRow
              key={r.id}
              item={r}
              selected={selectedId === r.id}
              isRenaming={renamingId === r.id}
              onSelect={() => onSelect(r.id)}
              onRequestRename={() => onRequestRename(r.id)}
              commitRename={(n) => onCommitRename(r.id, n)}
              cancelRename={onCancelRename}
              onColorPick={(c) => onColorPick(r.id, c)}
              onDuplicate={() => onDuplicate(r.id)}
              onDelete={() => onDelete(r.id)}
              testIdPrefix="role-row"
            />
          ))}
        </>
      )}
    </SidebarSection>
  );
}
