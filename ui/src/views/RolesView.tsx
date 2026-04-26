import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserRound } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { RolesSidebarList } from "../components/roles/RolesSidebarList.js";
import { RoleEditor, type RoleDraft } from "../components/roles/RoleEditor.js";
import { RoleDeleteDialog } from "../components/roles/RoleDeleteDialog.js";
import { DRAFT_COLOR } from "../components/sidebar/colors.js";
import { api, ApiError } from "../lib/api.js";
import { qk } from "../lib/query.js";
import { useRoles } from "../hooks/useRoles.js";
import { usePrompts } from "../hooks/usePrompts.js";
import type {
  Role,
  RoleWithRelations,
  UpdatePrimitiveInput,
} from "../lib/types.js";

type Selection = { kind: "none" } | { kind: "draft" } | { kind: "saved"; id: string };

const makeEmptyDraft = (): RoleDraft => ({
  kind: "draft",
  name: "",
  content: "",
  color: DRAFT_COLOR,
  promptIds: [],
});

export function RolesView() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: allRoles = [], isLoading } = useRoles();
  const { data: allPrompts = [] } = usePrompts();

  const roles = useMemo(
    () =>
      [...allRoles].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [allRoles]
  );

  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [hasDraft, setHasDraft] = useState(false);
  const [draft, setDraft] = useState<RoleDraft>(makeEmptyDraft);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const selectedId = selection.kind === "saved" ? selection.id : null;
  const { data: selectedRole } = useQuery({
    queryKey: qk.role(selectedId ?? ""),
    queryFn: () => api.roles.get(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const invalidateList = () => qc.invalidateQueries({ queryKey: qk.roles });
  const invalidateOne = (id: string) =>
    qc.invalidateQueries({ queryKey: qk.role(id) });

  const toastUnlessField = (err: Error, fallback: string) => {
    if (err instanceof ApiError && err.field) return;
    toast.error(err.message || fallback);
  };

  const createMutation = useMutation({
    mutationFn: (data: { name: string; content: string; color: string }) =>
      api.roles.create(data),
    onSuccess: (created) => {
      // Seed both the list and the detail cache so selecting the new role
      // renders immediately (instead of flashing the empty state while the
      // detail query is in flight).
      qc.setQueryData<Role[]>(qk.roles, (old) =>
        old ? [...old, created] : [created]
      );
      qc.setQueryData<RoleWithRelations>(qk.role(created.id), {
        ...created,
        prompts: [],
        skills: [],
        mcp_tools: [],
      });
      invalidateList();
    },
    onError: (err: Error) => toastUnlessField(err, "Failed to create role"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePrimitiveInput }) =>
      api.roles.update(id, patch),
    onSuccess: (_res, { id }) => {
      invalidateList();
      invalidateOne(id);
    },
    onError: (err: Error) => toastUnlessField(err, "Failed to update role"),
  });

  const setPromptsMutation = useMutation({
    mutationFn: ({ id, promptIds }: { id: string; promptIds: string[] }) =>
      api.roles.setPrompts(id, promptIds),
    onSuccess: (data: RoleWithRelations) => {
      qc.setQueryData(qk.role(data.id), data);
      invalidateList();
    },
    onError: (err: Error) => toastUnlessField(err, "Failed to update role prompts"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.roles.delete(id),
    onSuccess: invalidateList,
    onError: (err: Error) => toastUnlessField(err, "Failed to delete role"),
  });

  const handleCreateDraft = () => {
    if (!hasDraft) setDraft(makeEmptyDraft());
    setHasDraft(true);
    setSelection({ kind: "draft" });
  };

  const handleSelect = (id: string) => setSelection({ kind: "saved", id });

  const handleRename = async (id: string, nextName: string) => {
    const trimmed = nextName.trim();
    const current = roles.find((r) => r.id === id);
    setRenamingId(null);
    if (!current || !trimmed || trimmed === current.name) return;
    try {
      await updateMutation.mutateAsync({ id, patch: { name: trimmed } });
    } catch {
      /* toast */
    }
  };

  const handleColorPick = async (id: string, color: string) => {
    const current = roles.find((r) => r.id === id);
    if (!current || current.color === color) return;
    try {
      await updateMutation.mutateAsync({ id, patch: { color } });
    } catch {
      /* toast */
    }
  };

  const handleDuplicate = async (id: string) => {
    const current = roles.find((r) => r.id === id);
    if (!current) return;
    try {
      const fullSource = await api.roles.get(id);
      const dup = await createMutation.mutateAsync({
        name: `${current.name} copy`,
        content: current.content,
        color: current.color,
      });
      if (fullSource.prompts.length > 0) {
        await setPromptsMutation.mutateAsync({
          id: dup.id,
          promptIds: fullSource.prompts.map((p) => p.id),
        });
      }
      setSelection({ kind: "saved", id: dup.id });
    } catch {
      /* toast */
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      if (selection.kind === "saved" && selection.id === deleteTarget.id) {
        setSelection({ kind: "none" });
      }
      setDeleteTarget(null);
    } catch {
      /* toast */
    }
  };

  const editor = (() => {
    if (selection.kind === "draft" && hasDraft) {
      return (
        <RoleEditor
          target={draft}
          allPrompts={allPrompts}
          onDraftPromptsChange={(ids) => setDraft((d) => ({ ...d, promptIds: ids }))}
          onCreate={async ({ name, content, color, promptIds }) => {
            const created = await createMutation.mutateAsync({ name, content, color });
            if (promptIds.length > 0) {
              await setPromptsMutation.mutateAsync({ id: created.id, promptIds });
            }
            return created;
          }}
          onUpdate={(id, patch) => updateMutation.mutateAsync({ id, patch })}
          onSetPrompts={async (id, ids) => {
            await setPromptsMutation.mutateAsync({ id, promptIds: ids });
          }}
          onCreatedDraft={(role) => {
            setHasDraft(false);
            setDraft(makeEmptyDraft());
            setSelection({ kind: "saved", id: role.id });
          }}
        />
      );
    }
    if (selectedRole) {
      return (
        <RoleEditor
          key={selectedRole.id}
          target={{ kind: "saved", role: selectedRole }}
          allPrompts={allPrompts}
          onCreate={async (v) => createMutation.mutateAsync(v)}
          onUpdate={(id, patch) => updateMutation.mutateAsync({ id, patch })}
          onSetPrompts={async (id, ids) => {
            await setPromptsMutation.mutateAsync({ id, promptIds: ids });
          }}
          onOpenPrompt={(pid) =>
            setLocation(`/prompts/${pid}?from=role:${selectedRole.id}`)
          }
        />
      );
    }
    return (
      <div
        data-testid="roles-empty-editor"
        className="h-full grid place-items-center px-8"
      >
        <div className="text-center max-w-[320px]">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
            <UserRound size={20} className="text-[var(--color-text-muted)]" />
          </div>
          <p className="text-[13px] text-[var(--color-text-muted)]">
            Select a role or create a new one
          </p>
        </div>
      </div>
    );
  })();

  return (
    <>
      <PageLayout
        sidebarContent={
          <RolesSidebarList
            roles={roles}
            isLoading={isLoading}
            selectedId={selection.kind === "saved" ? selection.id : null}
            showDraft={hasDraft}
            draftIsSelected={selection.kind === "draft"}
            renamingId={renamingId}
            onSelect={handleSelect}
            onSelectDraft={() => setSelection({ kind: "draft" })}
            onCreateDraft={handleCreateDraft}
            onRequestRename={setRenamingId}
            onCommitRename={handleRename}
            onCancelRename={() => setRenamingId(null)}
            onColorPick={handleColorPick}
            onDuplicate={handleDuplicate}
            onDelete={(id) => {
              const r = roles.find((x) => x.id === id);
              if (r) setDeleteTarget(r);
            }}
          />
        }
        mainContent={editor}
      />

      {deleteTarget ? (
        <RoleDeleteDialog
          roleId={deleteTarget.id}
          roleName={deleteTarget.name}
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
          isDeleting={deleteMutation.isPending}
        />
      ) : null}
    </>
  );
}
