import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { PromptsSidebarList } from "../components/prompts/PromptsSidebarList.js";
import {
  PromptEditor,
  type PromptDraft,
} from "../components/prompts/PromptEditor.js";
import { Dialog } from "../components/ui/Dialog.js";
import { Button } from "../components/ui/Button.js";
import { DRAFT_COLOR } from "../components/sidebar/colors.js";
import { api, ApiError } from "../lib/api.js";
import { qk } from "../lib/query.js";
import { usePrompts } from "../hooks/usePrompts.js";
import type { Prompt, UpdatePrimitiveInput } from "../lib/types.js";

const EMPTY_DRAFT: PromptDraft = {
  kind: "draft",
  name: "",
  content: "",
  color: DRAFT_COLOR,
};

type Selection = { kind: "none" } | { kind: "draft" } | { kind: "saved"; id: string };

export function PromptsView() {
  const qc = useQueryClient();
  const { data: allPrompts = [], isLoading } = usePrompts();

  const prompts = useMemo(
    () =>
      [...allPrompts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [allPrompts]
  );

  // Route-driven selection — /prompts/:id preselects that prompt, /prompts
  // clears. This gives us shareable URLs (the group-detail page navigates
  // here with /prompts/<id>) and survives refresh.
  // Single optional-param route (`/prompts/:id?`) so the component stays
  // mounted whether the user is on /prompts or /prompts/<id>. Without this
  // the plain /prompts route and the /prompts/:id route mounted separate
  // instances and selection flickered / local state was lost.
  const [, setLocation] = useLocation();
  const [matched, routeParams] = useRoute<{ id?: string }>("/prompts/:id?");
  const routeId = matched ? routeParams?.id ?? null : null;

  const [selection, setSelection] = useState<Selection>(
    routeId ? { kind: "saved", id: routeId } : { kind: "none" }
  );
  const [hasDraft, setHasDraft] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null);

  // URL is the source of truth: whenever the route id changes (direct
  // navigation, back/forward, deep link), reconcile local selection. We
  // don't clear selection when routeId becomes null because `/prompts`
  // (no id) is a legitimate "nothing selected" state.
  useEffect(() => {
    if (routeId) {
      setSelection({ kind: "saved", id: routeId });
    } else {
      setSelection((prev) => (prev.kind === "saved" ? { kind: "none" } : prev));
    }
  }, [routeId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.prompts });

  // Field-tagged API errors are rendered inline by the editor; only toast
  // everything else so the user isn't alerted twice for the same problem.
  const toastUnlessField = (err: Error, fallback: string) => {
    if (err instanceof ApiError && err.field) return;
    toast.error(err.message || fallback);
  };

  const createMutation = useMutation({
    mutationFn: (data: { name: string; content: string; color: string }) =>
      api.prompts.create(data),
    onSuccess: (created) => {
      // Seed the list so selecting the brand-new prompt doesn't flash the
      // empty state between create response and the subsequent refetch.
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

  // Navigating cleanly reflects the new selection in the URL so the
  // address bar doesn't lie about which prompt is open.
  const goToSelection = (next: Selection) => {
    setSelection(next);
    if (next.kind === "saved") {
      setLocation(`/prompts/${next.id}`);
    } else if (next.kind === "none") {
      setLocation("/prompts");
    }
    // kind === "draft" stays on /prompts (no saved id yet).
  };

  const handleCreateDraft = () => {
    setHasDraft(true);
    goToSelection({ kind: "draft" });
  };

  const handleSelect = (id: string) => goToSelection({ kind: "saved", id });

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
      });
      goToSelection({ kind: "saved", id: dup.id });
    } catch {
      /* toast */
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      if (selection.kind === "saved" && selection.id === deleteTarget.id) {
        goToSelection({ kind: "none" });
      }
      setDeleteTarget(null);
    } catch {
      /* toast */
    }
  };

  const selectedPrompt =
    selection.kind === "saved" ? prompts.find((p) => p.id === selection.id) ?? null : null;

  const editor = (() => {
    if (selection.kind === "draft" && hasDraft) {
      return (
        <PromptEditor
          target={EMPTY_DRAFT}
          onCreate={(v) => createMutation.mutateAsync(v)}
          onUpdate={(id, patch) => updateMutation.mutateAsync({ id, patch })}
          onCreatedDraft={(p) => {
            setHasDraft(false);
            goToSelection({ kind: "saved", id: p.id });
          }}
        />
      );
    }
    if (selectedPrompt) {
      return (
        <PromptEditor
          target={{ kind: "saved", prompt: selectedPrompt }}
          onCreate={(v) => createMutation.mutateAsync(v)}
          onUpdate={(id, patch) => updateMutation.mutateAsync({ id, patch })}
        />
      );
    }
    return (
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
  })();

  return (
    <>
      <PageLayout
        sidebarContent={
          <PromptsSidebarList
            prompts={prompts}
            isLoading={isLoading}
            selectedId={selection.kind === "saved" ? selection.id : null}
            showDraft={hasDraft}
            draftIsSelected={selection.kind === "draft"}
            renamingId={renamingId}
            onSelect={handleSelect}
            onSelectDraft={() => goToSelection({ kind: "draft" })}
            onCreateDraft={handleCreateDraft}
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
        mainContent={editor}
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
