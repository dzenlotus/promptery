import { useEffect, useMemo, useRef, useState } from "react";
import { MilkdownEditor } from "../editor/MilkdownEditor.js";
import { Button } from "../ui/Button.js";
import { ScrollArea } from "../ui/ScrollArea.js";
import { HeaderColorPicker } from "../sidebar/HeaderColorPicker.js";
import { cn } from "../../lib/cn.js";
import { relativeTime } from "../../lib/time.js";
import { ApiError } from "../../lib/api.js";
import { validateEntityName } from "../../lib/validation.js";
import type { Prompt } from "../../lib/types.js";

interface Props {
  prompt: Prompt;
  onUpdate: (
    id: string,
    patch: Partial<Pick<Prompt, "name" | "content" | "color" | "short_description">>
  ) => Promise<Prompt>;
}

interface EditorValues {
  name: string;
  content: string;
  color: string;
  short_description: string;
}

function valuesFromPrompt(p: Prompt): EditorValues {
  return {
    name: p.name,
    content: p.content,
    color: p.color,
    short_description: p.short_description ?? "",
  };
}

function valuesEqual(a: EditorValues, b: EditorValues): boolean {
  return (
    a.name === b.name &&
    a.content === b.content &&
    a.color === b.color &&
    a.short_description === b.short_description
  );
}

/**
 * Editor for a saved prompt. Creation lives in `PromptCreateDialog`
 * (modal, consistent with Boards / Spaces / Tasks); this component only
 * edits existing rows. The editor key swaps with `prompt.id` so Milkdown's
 * uncontrolled state resets cleanly when the user navigates between prompts.
 */
export function PromptEditor({ prompt, onUpdate }: Props) {
  const editorKey = prompt.id;

  const initial = useMemo(() => valuesFromPrompt(prompt), [prompt]);
  const [values, setValues] = useState<EditorValues>(initial);
  const [saving, setSaving] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [serverNameError, setServerNameError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValues(initial);
    setHasTyped(false);
    setAttemptedSave(false);
    setServerNameError(null);
  }, [initial, editorKey]);

  const isDirty = !valuesEqual(values, initial);
  const localNameError = validateEntityName(values.name);
  const displayedNameError =
    serverNameError ??
    ((hasTyped || attemptedSave) && localNameError ? localNameError : null);
  const canSave = !saving && !localNameError && isDirty;

  const onSave = async () => {
    setAttemptedSave(true);
    if (!canSave) return;
    setSaving(true);
    setServerNameError(null);
    try {
      const trimmedName = values.name.trim();
      const trimmedDesc = values.short_description.trim() || null;
      const patch: Partial<Pick<Prompt, "name" | "content" | "color" | "short_description">> = {};
      if (trimmedName !== prompt.name) patch.name = trimmedName;
      if (values.content !== prompt.content) patch.content = values.content;
      if (values.color !== prompt.color) patch.color = values.color;
      const currentDesc = prompt.short_description ?? "";
      if ((values.short_description.trim() || null) !== (currentDesc.trim() || null))
        patch.short_description = trimmedDesc;
      if (Object.keys(patch).length > 0) {
        await onUpdate(prompt.id, patch);
      }
    } catch (err) {
      if (err instanceof ApiError && err.field === "name") {
        setServerNameError(err.message);
      }
      // Toast surfaces via mutation's onError — keep the form so the user can retry.
    } finally {
      setSaving(false);
    }
  };

  const metaText = `Updated ${relativeTime(prompt.updated_at)}`;

  return (
    <div
      data-testid="prompt-editor"
      className="grid grid-rows-[auto_1fr_auto] h-full min-h-0 min-w-0"
    >
      <div className="grid grid-cols-[auto_1fr] items-start gap-3 px-8 pt-6 pb-4 border-b border-[var(--color-border)]">
        <HeaderColorPicker
          value={values.color}
          onChange={(c) => setValues((v) => ({ ...v, color: c }))}
        />
        <div className="grid gap-1 min-w-0">
          <label
            htmlFor="prompt-editor-name"
            className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)]"
          >
            Name <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id="prompt-editor-name"
            ref={nameRef}
            data-testid="prompt-editor-name"
            aria-required="true"
            aria-invalid={displayedNameError ? true : undefined}
            aria-describedby={
              displayedNameError ? "prompt-editor-name-error" : undefined
            }
            value={values.name}
            onChange={(e) => {
              setValues((v) => ({ ...v, name: e.target.value }));
              setHasTyped(true);
              if (serverNameError) setServerNameError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onSave();
            }}
            placeholder="Untitled prompt"
            className={cn(
              "w-full bg-transparent outline-none border-0 border-b pb-0.5 transition-colors",
              displayedNameError
                ? "border-[var(--color-danger)]"
                : "border-transparent",
              "text-[22px] font-semibold tracking-tight text-[var(--color-text)]",
              "placeholder:text-[var(--color-text-subtle)]"
            )}
          />
          {displayedNameError ? (
            <div
              id="prompt-editor-name-error"
              data-testid="prompt-editor-name-error"
              className="text-[12px] text-[var(--color-danger)] leading-snug"
            >
              {displayedNameError}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--color-text-subtle)]">{metaText}</div>
          )}

          <div className="mt-2 grid gap-1">
            <label
              htmlFor="prompt-editor-short-desc"
              className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)]"
            >
              Short description (for tooltips)
            </label>
            <input
              id="prompt-editor-short-desc"
              data-testid="prompt-editor-short-desc"
              value={values.short_description}
              maxLength={200}
              onChange={(e) => setValues((v) => ({ ...v, short_description: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onSave();
              }}
              placeholder="One sentence explaining what this prompt does."
              className={cn(
                "w-full bg-transparent outline-none border-0 border-b pb-0.5 transition-colors",
                "border-transparent",
                "text-[13px] text-[var(--color-text)]",
                "placeholder:text-[var(--color-text-subtle)]"
              )}
            />
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0" viewportClassName="p-8">
        <MilkdownEditor
          key={editorKey}
          value={values.content}
          onChange={(content) => setValues((v) => ({ ...v, content }))}
        />
      </ScrollArea>

      <div className="px-6 pb-4 pt-2">
        <div className="flex items-center justify-between gap-3 pl-4 pr-1.5 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--hover-overlay)] backdrop-blur-sm">
          <span className="text-[11px] text-[var(--color-text-subtle)] tabular-nums">
            {values.content.length} character{values.content.length === 1 ? "" : "s"}
          </span>
          <Button
            variant="primary"
            size="sm"
            data-testid="prompt-editor-save"
            onClick={() => void onSave()}
            disabled={!canSave}
          >
            {saving ? "Saving…" : !isDirty ? "Saved ✓" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
