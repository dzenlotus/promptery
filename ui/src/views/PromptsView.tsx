import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileText } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { PromptsSidebarList } from "../components/prompts/PromptsSidebarList.js";
import { PromptEditor } from "../components/prompts/PromptEditor.js";
import { Dialog } from "../components/ui/Dialog.js";
import { Button } from "../components/ui/Button.js";
import { api, ApiError } from "../lib/api.js";
import { qk } from "../lib/query.js";
import { usePrompts } from "../hooks/usePrompts.js";
import { usePromptGroups } from "../hooks/usePromptGroups.js";
import { useRoles } from "../hooks/useRoles.js";
import { useTask } from "../hooks/useTasks.js";
import { useUndoRedoStore } from "../store/undoRedo.js";
import type { Prompt, UpdatePrimitiveInput } from "../lib/types.js";

/** Parses the `?from=<kind>:<id>` breadcrumb param. */
function parseFromParam(
  search: string
): { kind: "group" | "role" | "task"; id: string } | null {
  const raw = new URLSearchParams(search).get("from");
  if (!raw) return null;
  const colon = raw.indexOf(":");
  if (colon < 1) return null;
  const kind = raw.slice(0, colon);
  const id = raw.slice(colon + 1);
  if (!id) return null;
  if (kind === "group" || kind === "role" || kind === "task") {
    return { kind, id };
  }
  return null;
}

/** Resolves display label + target URL for the `?from=` breadcrumb. */
function useFromContext(
  from: { kind: "group" | "role" | "task"; id: string } | null
): { label: string; href: string } | null {
  const { data: groups = [] } = usePromptGroups();
  const { data: roles = [] } = useRoles();
  const { data: task } = useTask(from?.kind === "task" ? from.id : null);

  if (!from) return null;

  if (from.kind === "group") {
    const group = groups.find((g) => g.id === from.id);
    if (!group) return null;
    return { label: group.name, href: `/prompts/groups/${from.id}` };
  }

  if (from.kind === "role") {
    const role = roles.find((r) => r.id === from.id);
    if (!role) return null;
    return { label: role.name, href: `/roles` };
  }

  if (from.kind === "task") {
    if (!task) return null;
    return {
      label: `task ${task.slug}`,
      href: `/board/${task.board_id}?openTask=${from.id}`,
    };
  }

  return null;
}


export function PromptsView() {
  const qc = useQueryClient();
  const { data: allPrompts = [], isLoading } = usePrompts();
  const { recordAction } = useUndoRedoStore();

  const prompts = useMemo(
    () =>
      [...allPrompts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [allPrompts]
  );

  // Route-driven selection — /prompts/:id preselects that prompt, /prompts
  // clears. Single optional-param route (`/prompts/:id?`) so the component
  // stays mounted whether the user is on /prompts or /prompts/<id>.
  const [, setLocation] = useLocation();
  const search = useSearch();
  const fromParam = parseFromParam(search);
  const fromCtx = useFromContext(fromParam);
  const [matched, routeParams] = useRoute<{ id?: string }>("/prompts/:id?");
  const routeId = matched ? routeParams?.id ?? null : null;

  const [selectedId, setSelectedId] = useState<string | null>(routeId);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null);

  // URL is the source of truth: whenever the route id changes (direct
  // navigation, back/forward, deep link, modal-driven create), reconcile.
  useEffect(() => {
    setSelectedId(routeId);
  }, [routeId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.prompts });

  // Field-tagged API errors are rendered inline by the editor; only toast
  // everything else so the user isn't alerted twice for the same problem.
  const toastUnlessField = (err: Error, fallback: string) => {
    if (err instanceof ApiError && err.field) return;
    toast.error(err.message || fallback);
  };

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      content: string;
      color: string;
      short_description: string | null;
    }) => api.prompts.create(data),
    onSuccess: (created) => {
      qc.setQueryData<Prompt[]>(qk.prompts, (old) =>
        old ? [...old, created] : [created]
      );
      invalidate();
    },
    onError: (err: Error) => toastUnlessField(err, "Failed to create prompt"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePrimitiveInput }) =>
      api.prompts.update(id, patch),
    onSuccess: invalidate,
    onError: (err: Error) => toastUnlessField(err, "Failed to update prompt"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.prompts.delete(id),
    onSuccess: invalidate,
    onError: (err: Error) => toastUnlessField(err, "Failed to delete prompt"),
  });

  const goToPrompt = (id: string) => setLocation(`/prompts/${id}`);
  const clearSelection = () => setLocation("/prompts");

  const handleRename = async (id: string, nextName: string) => {
    const trimmed = nextName.trim();
    const current = prompts.find((p) => p.id === id);
    setRenamingId(null);
    if (!current || !trimmed || trimmed === current.name) return;
    try {
      await updateMutation.mutateAsync({ id, patch: { name: trimmed } });
    } catch {
      /* toast raised by mutation onError */
    }
  };

  const handleColorPick = async (id: string, color: string) => {
    const current = prompts.find((p) => p.id === id);
    if (!current || current.color === color) return;
    try {
      await updateMutation.mutateAsync({ id, patch: { color } });
    } catch {
      /* toast */
    }
  };

  const handleDuplicate = async (id: string) => {
    const current = prompts.find((p) => p.id === id);
    if (!current) return;
    try {
      const dup = await createMutation.mutateAsync({
        name: `${current.name} copy`,
        content: current.content,
        color: current.color,
        short_description: current.short_description ?? null,
      });
      goToPrompt(dup.id);
    } catch {
      /* toast */
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const snapshot = deleteTarget;
    try {
      await deleteMutation.mutateAsync(snapshot.id);
      if (selectedId === snapshot.id) clearSelection();
      setDeleteTarget(null);

      recordAction({
        label: `Delete prompt "${snapshot.name}"`,
        do: async () => {
          await api.prompts.delete(snapshot.id);
          await qc.invalidateQueries({ queryKey: qk.prompts });
        },
        undo: async () => {
          const restored = await api.prompts.create({
            name: snapshot.name,
            content: snapshot.content,
            color: snapshot.color,
          });
          qc.setQueryData<Prompt[]>(qk.prompts, (old) =>
            old ? [...old, restored] : [restored]
          );
          await qc.invalidateQueries({ queryKey: qk.prompts });
          toast.success(`Prompt "${restored.name}" restored`);
        },
      });
    } catch {
      /* toast raised by mutation onError */
    }
  };

  const selectedPrompt = selectedId
    ? prompts.find((p) => p.id === selectedId) ?? null
    : null;

  const editor = selectedPrompt ? (
    <PromptEditor
      prompt={selectedPrompt}
      onUpdate={(id, patch) => updateMutation.mutateAsync({ id, patch })}
    />
  ) : (
    <div
      data-testid="prompts-empty-editor"
      className="h-full grid place-items-center px-8"
    >
      <div className="text-center max-w-[320px]">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
          <FileText size={20} className="text-[var(--color-text-muted)]" />
        </div>
        <p className="text-[13px] text-[var(--color-text-muted)]">
          Select a prompt or create a new one
        </p>
      </div>
    </div>
  );

  return (
    <>
      <PageLayout
        sidebarContent={
          <PromptsSidebarList
            prompts={prompts}
            isLoading={isLoading}
            selectedId={selectedId}
            renamingId={renamingId}
            onSelect={goToPrompt}
            onRequestRename={setRenamingId}
            onCommitRename={handleRename}
            onCancelRename={() => setRenamingId(null)}
            onColorPick={handleColorPick}
            onDuplicate={handleDuplicate}
            onDelete={(id) => {
              const p = prompts.find((x) => x.id === id);
              if (p) setDeleteTarget(p);
            }}
          />
        }
        mainContent={
          fromCtx ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="px-8 pt-4 shrink-0">
                <button
                  type="button"
                  data-testid="prompt-back-button"
                  onClick={() => setLocation(fromCtx.href)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  <ArrowLeft size={13} />
                  <span>Back to {fromCtx.label}</span>
                </button>
              </div>
              <div className="flex-1 min-h-0">{editor}</div>
            </div>
          ) : (
            editor
          )
        }
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !deleteMutation.isPending && setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete?"}
        size="sm"
        data-testid="prompt-delete-dialog"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              disabled={deleteMutation.isPending}
              data-testid="prompt-delete-confirm"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <div className="py-2 text-[13px] text-[var(--color-text-muted)]">
          This cannot be undone. The prompt will be removed from any roles and tasks
          that use it.
        </div>
      </Dialog>
    </>
  );
}
