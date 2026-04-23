import { useEffect, useMemo, useRef, useState } from "react";
import { MilkdownEditor } from "../editor/MilkdownEditor.js";
import { Button } from "../ui/Button.js";
import { HeaderColorPicker } from "../sidebar/HeaderColorPicker.js";
import { PromptsMultiSelector } from "../common/PromptsMultiSelector.js";
import { usePromptGroups } from "../../hooks/usePromptGroups.js";
import { DRAFT_COLOR } from "../sidebar/colors.js";
import { cn } from "../../lib/cn.js";
import { relativeTime } from "../../lib/time.js";
import { ApiError } from "../../lib/api.js";
import { validateEntityName } from "../../lib/validation.js";
import type { Prompt, Role, RoleWithRelations } from "../../lib/types.js";

export interface RoleDraft {
  kind: "draft";
  name: string;
  content: string;
  color: string;
  promptIds: string[];
}

export interface RoleEditable {
  kind: "saved";
  role: RoleWithRelations;
}

type Target = RoleDraft | RoleEditable;

interface Props {
  target: Target;
  allPrompts: Prompt[];
  onCreate: (values: {
    name: string;
    content: string;
    color: string;
    promptIds: string[];
  }) => Promise<Role>;
  onUpdate: (
    id: string,
    patch: Partial<Pick<Role, "name" | "content" | "color">>
  ) => Promise<Role>;
  onSetPrompts: (id: string, promptIds: string[]) => Promise<void>;
  onCreatedDraft?: (role: Role) => void;
  /** Lets the parent persist in-progress draft prompt ids across re-renders. */
  onDraftPromptsChange?: (ids: string[]) => void;
}

interface EditorValues {
  name: string;
  content: string;
  color: string;
}

function valuesFromTarget(t: Target): EditorValues {
  if (t.kind === "draft") return { name: t.name, content: t.content, color: t.color };
  return { name: t.role.name, content: t.role.content, color: t.role.color };
}

function valuesEqual(a: EditorValues, b: EditorValues): boolean {
  return a.name === b.name && a.content === b.content && a.color === b.color;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function RoleEditor({
  target,
  allPrompts,
  onCreate,
  onUpdate,
  onSetPrompts,
  onCreatedDraft,
  onDraftPromptsChange,
}: Props) {
  const isDraft = target.kind === "draft";
  const editorKey = isDraft ? "__draft__" : target.role.id;

  const initial = useMemo(() => valuesFromTarget(target), [target]);
  const baselinePromptIds = useMemo(
    () =>
      target.kind === "draft"
        ? target.promptIds
        : target.role.prompts.map((p) => p.id),
    [target]
  );

  const [values, setValues] = useState<EditorValues>(initial);
  const [localPromptIds, setLocalPromptIds] = useState<string[]>(baselinePromptIds);
  // Groups surface in the prompt picker as fully-covered chips / popover
  // shortcuts — same semantics as the board/column selectors.
  const { data: groups = [] } = usePromptGroups();
  const [saving, setSaving] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [serverNameError, setServerNameError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset whenever the target changes (selection switches, or server state for
  // the same saved role refetches with newer data).
  useEffect(() => {
    setValues(initial);
    setLocalPromptIds(baselinePromptIds);
    setHasTyped(false);
    setAttemptedSave(false);
    setServerNameError(null);
  }, [editorKey, initial, baselinePromptIds]);

  useEffect(() => {
    if (isDraft) {
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [isDraft, editorKey]);

  const metadataChanged = !valuesEqual(values, initial);
  const promptsChanged = !arraysEqual(localPromptIds, baselinePromptIds);
  const isDirty = metadataChanged || promptsChanged;
  const localNameError = validateEntityName(values.name);

  // Show the client-side error as soon as the user has typed anything OR
  // pressed Save on an empty field. This way a fresh draft isn't yelling
  // "Name is required" before the user has touched anything.
  const displayedNameError =
    serverNameError ??
    ((hasTyped || attemptedSave) && localNameError ? localNameError : null);

  const canSave = !saving && !localNameError && (isDraft || isDirty);

  const handleReorderPrompts = (nextIds: string[]) => {
    setLocalPromptIds(nextIds);
    if (isDraft) onDraftPromptsChange?.(nextIds);
  };

  const onSave = async () => {
    setAttemptedSave(true);
    if (!canSave) return;
    setSaving(true);
    setServerNameError(null);
    try {
      const trimmedName = values.name.trim();
      if (isDraft) {
        const created = await onCreate({
          name: trimmedName,
          content: values.content,
          color: values.color || DRAFT_COLOR,
          promptIds: localPromptIds,
        });
        onCreatedDraft?.(created);
      } else {
        const patch: Partial<Pick<Role, "name" | "content" | "color">> = {};
        if (trimmedName !== target.role.name) patch.name = trimmedName;
        if (values.content !== target.role.content) patch.content = values.content;
        if (values.color !== target.role.color) patch.color = values.color;
        if (Object.keys(patch).length > 0) {
          await onUpdate(target.role.id, patch);
        }
        if (promptsChanged) {
          await onSetPrompts(target.role.id, localPromptIds);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.field === "name") {
        setServerNameError(err.message);
      }
      /* toast via mutation */
    } finally {
      setSaving(false);
    }
  };

  const metaText = isDraft
    ? "Unsaved draft"
    : `Updated ${relativeTime(target.role.updated_at)}`;

  return (
    <div
      data-testid="role-editor"
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
            htmlFor="role-editor-name"
            className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)]"
          >
            Name <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id="role-editor-name"
            ref={nameRef}
            data-testid="role-editor-name"
            aria-required="true"
            aria-invalid={displayedNameError ? true : undefined}
            aria-describedby={
              displayedNameError ? "role-editor-name-error" : undefined
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
            placeholder="Untitled role"
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
              id="role-editor-name-error"
              data-testid="role-editor-name-error"
              className="text-[12px] text-[var(--color-danger)] leading-snug"
            >
              {displayedNameError}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--color-text-subtle)]">{metaText}</div>
          )}
        </div>
      </div>

      <div className="min-h-0 min-w-0 overflow-y-auto scroll-thin px-8 py-6">
        <div className="grid gap-6">
          <div className="grid gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)]">
              Default prompts
            </span>
            <PromptsMultiSelector
              allPrompts={allPrompts}
              allGroups={groups}
              value={localPromptIds}
              onChange={handleReorderPrompts}
              testId="role-default-prompts"
            />
            <p className="text-[11px] text-[var(--color-text-subtle)]">
              These prompts will be attached to every task with this role.
            </p>
          </div>

          {/* TODO: Default Skills — add when skills feature ships */}
          {/* TODO: Default MCP tools — add when MCP tools feature ships */}

          <div className="grid gap-2">
            <div className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)]">
              Role prompt
            </div>
            <MilkdownEditor
              key={editorKey}
              value={values.content}
              onChange={(content) => setValues((v) => ({ ...v, content }))}
            />
          </div>
        </div>
      </div>

      <div className="px-6 pb-4 pt-2">
        <div className="flex items-center justify-between gap-3 pl-4 pr-1.5 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--hover-overlay)] backdrop-blur-sm">
          <span className="text-[11px] text-[var(--color-text-subtle)] tabular-nums">
            {values.content.length} character{values.content.length === 1 ? "" : "s"}
          </span>
          <Button
            variant="primary"
            size="sm"
            data-testid="role-editor-save"
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
