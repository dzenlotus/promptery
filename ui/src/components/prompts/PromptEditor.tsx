import { useEffect, useMemo, useRef, useState } from "react";
import { MilkdownEditor } from "../editor/MilkdownEditor.js";
import { Button } from "../ui/Button.js";
import { ScrollArea } from "../ui/ScrollArea.js";
import { HeaderColorPicker } from "../sidebar/HeaderColorPicker.js";
import { DRAFT_COLOR } from "../sidebar/colors.js";
import { cn } from "../../lib/cn.js";
import { relativeTime } from "../../lib/time.js";
import { ApiError } from "../../lib/api.js";
import { validateEntityName } from "../../lib/validation.js";
import type { Prompt } from "../../lib/types.js";

export interface PromptDraft {
  kind: "draft";
  name: string;
  content: string;
  color: string;
  short_description?: string | null;
}

export interface PromptEditable {
  kind: "saved";
  prompt: Prompt;
}

type EditorTarget = PromptDraft | PromptEditable;

interface Props {
  target: EditorTarget;
  /** Saving a draft calls this; receives the form values. */
  onCreate: (values: { name: string; content: string; color: string; short_description: string | null }) => Promise<Prompt>;
  onUpdate: (
    id: string,
    patch: Partial<Pick<Prompt, "name" | "content" | "color" | "short_description">>
  ) => Promise<Prompt>;
  /** Called after a successful draft create so the view can switch selection. */
  onCreatedDraft?: (prompt: Prompt) => void;
  /**
   * Called whenever the editor's local form values change. Lets parent
   * components observe draft content without controlling the field — used for
   * the auto-save-on-navigate-away feature.
   */
  onValuesChange?: (values: EditorValues) => void;
}

interface EditorValues {
  name: string;
  content: string;
  color: string;
  short_description: string;
}

function valuesFromTarget(t: EditorTarget): EditorValues {
  if (t.kind === "draft")
    return { name: t.name, content: t.content, color: t.color, short_description: t.short_description ?? "" };
  return {
    name: t.prompt.name,
    content: t.prompt.content,
    color: t.prompt.color,
    short_description: t.prompt.short_description ?? "",
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

export function PromptEditor({ target, onCreate, onUpdate, onCreatedDraft, onValuesChange }: Props) {
  const isDraft = target.kind === "draft";
  // Editor key swaps whenever the underlying target does, which forces the
  // Milkdown textarea to reset its uncontrolled state so we never see the
  // previous prompt's text flash into the newly selected one.
  const editorKey = isDraft ? "__draft__" : target.prompt.id;

  const initial = useMemo(() => valuesFromTarget(target), [target]);
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

  useEffect(() => {
    if (isDraft) {
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [isDraft, editorKey]);

  // Notify parent of current values so it can auto-save on navigate-away.
  // Only relevant in draft mode; the callback is intentionally excluded from
  // deps so callers can pass an inline arrow without causing loops.
  useEffect(() => {
    if (isDraft && onValuesChange) {
      onValuesChange(values);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraft, values]);

  const isDirty = !valuesEqual(values, initial);
  const localNameError = validateEntityName(values.name);
  // Show client-side errors as soon as the user starts typing; also surface
  // them after a Save attempt so an empty form still yields "Name is required".
  const displayedNameError =
    serverNameError ??
    ((hasTyped || attemptedSave) && localNameError ? localNameError : null);
  const canSave = !saving && !localNameError && (isDraft || isDirty);

  const onSave = async () => {
    setAttemptedSave(true);
    if (!canSave) return;
    setSaving(true);
    setServerNameError(null);
    try {
      const trimmedName = values.name.trim();
      const trimmedDesc = values.short_description.trim() || null;
      if (isDraft) {
        const created = await onCreate({
          name: trimmedName,
          content: values.content,
          color: values.color || DRAFT_COLOR,
          short_description: trimmedDesc,
        });
        onCreatedDraft?.(created);
      } else {
        const patch: Partial<Pick<Prompt, "name" | "content" | "color" | "short_description">> = {};
        if (trimmedName !== target.prompt.name) patch.name = trimmedName;
        if (values.content !== target.prompt.content) patch.content = values.content;
        if (values.color !== target.prompt.color) patch.color = values.color;
        const currentDesc = target.prompt.short_description ?? "";
        if ((values.short_description.trim() || null) !== (currentDesc.trim() || null))
          patch.short_description = trimmedDesc;
        if (Object.keys(patch).length > 0) {
          await onUpdate(target.prompt.id, patch);
        }
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

  const metaText = isDraft
    ? "Unsaved draft"
    : `Updated ${relativeTime(target.prompt.updated_at)}`;

  return (
    <div
      data-testid="prompt-editor"
      data-draft={isDraft || undefined}
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
            {saving ? "Saving…" : !isDraft && !isDirty ? "Saved ✓" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
