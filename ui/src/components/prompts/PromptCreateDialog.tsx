import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { validateEntityName } from "../../lib/validation.js";
import { Dialog } from "../ui/Dialog.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { HeaderColorPicker } from "../sidebar/HeaderColorPicker.js";
import type { Prompt } from "../../lib/types.js";

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_COLOR = "#888";

/**
 * Modal for creating a new prompt — name + short_description + content + color.
 *
 * Replaces the previous "draft row in the sidebar + edit on the right" flow
 * so prompt creation is consistent with Boards / Spaces / Tasks (modal,
 * Cancel discards). Rich-markdown editing happens in the saved-prompt
 * editor on the right pane after the prompt exists; the modal stays
 * intentionally simple — a textarea is enough for the initial draft.
 */
export function PromptCreateDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const [name, setName] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [touched, setTouched] = useState(false);
  const [serverNameError, setServerNameError] = useState<string | null>(null);

  // Re-sync local state when the dialog reopens — without this a previous
  // session's typed values bleed into a fresh open.
  useEffect(() => {
    if (open) {
      setName("");
      setShortDesc("");
      setContent("");
      setColor(DEFAULT_COLOR);
      setTouched(false);
      setServerNameError(null);
    }
  }, [open]);

  const localNameError = validateEntityName(name);
  const displayedNameError =
    serverNameError ?? (touched && localNameError ? localNameError : null);

  const create = useMutation({
    mutationFn: (data: {
      name: string;
      content: string;
      color: string;
      short_description: string | null;
    }) => api.prompts.create(data),
    onSuccess: (created: Prompt) => {
      // Seed the cache so the brand-new prompt is visible immediately,
      // then invalidate to reconcile with the server.
      qc.setQueryData<Prompt[]>(qk.prompts, (old) =>
        old ? [...old, created] : [created]
      );
      qc.invalidateQueries({ queryKey: qk.prompts });
      // Navigate to the new prompt — the sidebar selection follows the URL.
      setLocation(`/prompts/${created.id}`);
      onClose();
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.field === "name") {
        setServerNameError(err.message);
        return;
      }
      toast.error(err.message || "Failed to create prompt");
    },
  });

  const canSubmit = !localNameError && !create.isPending;

  const onSubmit = () => {
    setTouched(true);
    if (!canSubmit) return;
    setServerNameError(null);
    const trimmedDesc = shortDesc.trim();
    create.mutate({
      name: name.trim(),
      content,
      color,
      short_description: trimmedDesc.length > 0 ? trimmedDesc : null,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !create.isPending) onClose();
      }}
      title="New prompt"
      size="md"
      data-testid="prompt-create-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="prompt-create-submit"
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-[auto_1fr] items-start gap-3">
          <HeaderColorPicker value={color} onChange={setColor} />
          <div className="grid gap-1.5">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Name <span className="text-[var(--color-danger)]">*</span>
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (serverNameError) setServerNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
              }}
              placeholder="my-helpful-prompt"
              aria-invalid={displayedNameError ? true : undefined}
              data-testid="prompt-create-name"
            />
            {displayedNameError && (
              <span
                className="text-[11px] text-[var(--color-danger)]"
                data-testid="prompt-create-name-error"
              >
                {displayedNameError}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Short description
            </label>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              shown as tooltip on hover
            </span>
          </div>
          <Input
            value={shortDesc}
            maxLength={200}
            onChange={(e) => setShortDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
            }}
            placeholder="One sentence explaining what this prompt does."
            data-testid="prompt-create-short-desc"
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="The actual prompt text. You can edit this with rich formatting after the prompt is created."
            rows={8}
            data-testid="prompt-create-content"
            className="w-full bg-transparent border border-[var(--color-border)] rounded-md px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-subtle)] resize-y min-h-[120px] font-mono"
          />
          <span className="text-[10px] text-[var(--color-text-subtle)]">
            Plain text here; rich markdown editing opens after the prompt is saved.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
