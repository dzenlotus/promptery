import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/atom-one-dark.css";
import {
  Bold,
  Code,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pencil,
  Quote,
  SquareCode,
} from "lucide-react";
import { IconButton } from "../ui/IconButton.js";
import { cn } from "../../lib/cn.js";

type Mode = "edit" | "view";

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  /** Starting mode. Defaults to "edit" (preserves existing behaviour for
   *  PromptEditor / RoleEditor). Pass "view" for the task description so the
   *  dialog opens with rendered markdown and click-to-edit interaction. */
  initialMode?: Mode;
  /** Called when the user triggers an explicit save gesture (Cmd/Ctrl+Enter).
   *  Only relevant when `initialMode="view"`. */
  onSave?: () => void;
}

/*
 * Raw-markdown editor.
 *
 *  - Edit mode:  <textarea> with the literal markdown. Toolbar buttons
 *                mutate the textarea selection: Bold wraps in **, Italic in *,
 *                H1 prepends '# ', etc. What you type (and what the buttons
 *                insert) is exactly what gets stored.
 *  - View mode:  `marked` renders the markdown to HTML; the same `.milkdown`
 *                class that used to style Milkdown now styles this plain DOM,
 *                so headings / code / blockquotes look the same. `highlight.js`
 *                is applied to fenced code blocks after render.
 *
 * No WYSIWYG layer. We dropped Milkdown here because the toolbar commands
 * going through Milkdown's command system weren't taking effect from the user's
 * selection — direct textarea manipulation is deterministic.
 *
 * When `initialMode="view"` the editor uses a click-to-edit interaction model:
 *  - Rendered markdown is shown by default; no editor chrome visible.
 *  - Clicking the rendered area (or the "Edit" button) switches to edit mode.
 *  - Blurring the textarea, pressing Esc, or pressing Cmd/Ctrl+Enter returns to
 *    view mode. Changes are preserved in all three cases (blur = implicit save,
 *    Esc = keep but exit, CmdEnter = explicit save + exit).
 */

type Action =
  | { type: "wrap"; before: string; after?: string }
  | { type: "prepend"; prefix: string }
  | { type: "block"; before: string; after: string };

/**
 * Pure helper: given the current mode, a keyboard event descriptor, and
 * whether the editor is in click-to-edit (task description) mode, returns
 * the next mode. Returns null when the event does not trigger a transition.
 * Exported for unit-testing purposes.
 */
export function resolveKeyboardModeTransition(
  currentMode: Mode,
  event: { key: string; metaKey: boolean; ctrlKey: boolean },
  isClickToEdit: boolean
): Mode | null {
  if (!isClickToEdit || currentMode !== "edit") return null;
  if (event.key === "Escape") return "view";
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) return "view";
  return null;
}

export function applyAction(
  ta: HTMLTextAreaElement,
  action: Action
): { value: string; selStart: number; selEnd: number } {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const v = ta.value;

  if (action.type === "wrap") {
    const after = action.after ?? action.before;
    const selected = v.slice(start, end);
    const next = v.slice(0, start) + action.before + selected + after + v.slice(end);
    return {
      value: next,
      selStart: start + action.before.length,
      selEnd: end + action.before.length,
    };
  }
  if (action.type === "block") {
    const selected = v.slice(start, end);
    const next = v.slice(0, start) + action.before + selected + action.after + v.slice(end);
    return {
      value: next,
      selStart: start + action.before.length,
      selEnd: end + action.before.length,
    };
  }
  // prepend — insert prefix at the start of the current line.
  const lineStart = v.lastIndexOf("\n", start - 1) + 1;
  const next = v.slice(0, lineStart) + action.prefix + v.slice(lineStart);
  return {
    value: next,
    selStart: start + action.prefix.length,
    selEnd: end + action.prefix.length,
  };
}

function Divider() {
  return <div className="milkdown-toolbar-divider" aria-hidden="true" />;
}

function Toolbar({ onAction }: { onAction: (a: Action) => void }) {
  return (
    <div data-testid="editor-toolbar" className="milkdown-toolbar">
      <IconButton
        label="Bold (⌘B)"
        size="sm"
        data-testid="editor-toolbar-bold"
        onClick={() => onAction({ type: "wrap", before: "**" })}
      >
        <Bold size={14} />
      </IconButton>
      <IconButton
        label="Italic (⌘I)"
        size="sm"
        data-testid="editor-toolbar-italic"
        onClick={() => onAction({ type: "wrap", before: "*" })}
      >
        <Italic size={14} />
      </IconButton>
      <IconButton
        label="Inline code"
        size="sm"
        data-testid="editor-toolbar-inline-code"
        onClick={() => onAction({ type: "wrap", before: "`" })}
      >
        <Code size={14} />
      </IconButton>
      <Divider />
      <IconButton
        label="Heading 1"
        size="sm"
        data-testid="editor-toolbar-h1"
        onClick={() => onAction({ type: "prepend", prefix: "# " })}
      >
        <Heading1 size={14} />
      </IconButton>
      <IconButton
        label="Heading 2"
        size="sm"
        data-testid="editor-toolbar-h2"
        onClick={() => onAction({ type: "prepend", prefix: "## " })}
      >
        <Heading2 size={14} />
      </IconButton>
      <IconButton
        label="Heading 3"
        size="sm"
        data-testid="editor-toolbar-h3"
        onClick={() => onAction({ type: "prepend", prefix: "### " })}
      >
        <Heading3 size={14} />
      </IconButton>
      <Divider />
      <IconButton
        label="Bullet list"
        size="sm"
        data-testid="editor-toolbar-bullet-list"
        onClick={() => onAction({ type: "prepend", prefix: "- " })}
      >
        <List size={14} />
      </IconButton>
      <IconButton
        label="Numbered list"
        size="sm"
        data-testid="editor-toolbar-ordered-list"
        onClick={() => onAction({ type: "prepend", prefix: "1. " })}
      >
        <ListOrdered size={14} />
      </IconButton>
      <IconButton
        label="Blockquote"
        size="sm"
        data-testid="editor-toolbar-quote"
        onClick={() => onAction({ type: "prepend", prefix: "> " })}
      >
        <Quote size={14} />
      </IconButton>
      <IconButton
        label="Code block"
        size="sm"
        data-testid="editor-toolbar-code-block"
        onClick={() => onAction({ type: "block", before: "```\n", after: "\n```" })}
      >
        <SquareCode size={14} />
      </IconButton>
    </div>
  );
}

interface EditModeProps extends Props {
  /** When true, blurring the textarea switches back to view mode. */
  exitOnBlur?: boolean;
  onExitEdit?: () => void;
}

function EditMode({ value, onChange, exitOnBlur, onExitEdit, onSave }: EditModeProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus when entering edit mode (only relevant in click-to-edit flow).
  useEffect(() => {
    if (exitOnBlur) {
      taRef.current?.focus();
    }
  }, [exitOnBlur]);

  // Auto-grow: the textarea's rendered height always tracks its content, so
  // scrolling happens in the surrounding pane (which is `overflow-y-auto`)
  // rather than inside the textarea itself. useLayoutEffect prevents a
  // visible flash between "collapsed to min-height" and "grown to fit".
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value]);

  const handle = (action: Action) => {
    const ta = taRef.current;
    if (!ta) return;
    const { value: next, selStart, selEnd } = applyAction(ta, action);
    onChange(next);
    // Restore selection after React re-renders the textarea with the new value.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!exitOnBlur) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onExitEdit?.();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave?.();
      onExitEdit?.();
    }
  };

  // When blur comes from a toolbar button click, we don't want to exit edit
  // mode. We only exit if focus leaves the entire editor wrapper.
  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!exitOnBlur) return;
    // relatedTarget is the element receiving focus. If it's inside the toolbar
    // (a button), stay in edit mode so the toolbar action can fire.
    const wrapper = e.currentTarget.closest("[data-milkdown-wrapper]");
    if (wrapper && e.relatedTarget instanceof Node && wrapper.contains(e.relatedTarget)) {
      return;
    }
    onExitEdit?.();
  };

  return (
    <>
      <Toolbar onAction={handle} />
      <textarea
        ref={taRef}
        data-testid="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Write markdown here…"
        spellCheck={false}
        rows={12}
        className={cn(
          "w-full resize-none bg-transparent outline-none block overflow-hidden",
          "p-4 font-mono text-[13px] leading-[1.55] text-[var(--color-text)]",
          "placeholder:text-[var(--color-text-subtle)]"
        )}
      />
    </>
  );
}

interface ViewModeProps {
  value: string;
  /** When true, the rendered area is interactive: clicking it enters edit mode. */
  clickToEdit?: boolean;
  onEnterEdit?: () => void;
}

function ViewMode({ value, clickToEdit, onEnterEdit }: ViewModeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const html = value.trim() ? (marked.parse(value, { gfm: true, breaks: true }) as string) : "";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>("pre code").forEach((block) => {
      block.removeAttribute("data-highlighted");
      try {
        hljs.highlightElement(block);
      } catch {
        /* unknown language */
      }
    });
  }, [html]);

  if (!html) {
    return (
      <div
        data-testid="editor-view"
        data-empty="true"
        role={clickToEdit ? "button" : undefined}
        tabIndex={clickToEdit ? 0 : undefined}
        aria-label={clickToEdit ? "Add description" : undefined}
        onClick={clickToEdit ? onEnterEdit : undefined}
        onKeyDown={
          clickToEdit
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEnterEdit?.();
                }
              }
            : undefined
        }
        className={cn(
          "milkdown text-[13px] text-[var(--color-text-subtle)]",
          clickToEdit &&
            "cursor-pointer rounded-md px-3 py-2 hover:bg-[var(--hover-overlay)] transition-colors duration-150 select-none"
        )}
      >
        {clickToEdit ? "No description. Click to add." : "Nothing to preview yet. Switch to Edit to write some markdown."}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-testid="editor-view"
      role={clickToEdit ? "button" : undefined}
      tabIndex={clickToEdit ? 0 : undefined}
      aria-label={clickToEdit ? "Edit description" : undefined}
      onClick={clickToEdit ? onEnterEdit : undefined}
      onKeyDown={
        clickToEdit
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEnterEdit?.();
              }
            }
          : undefined
      }
      className={cn(
        "milkdown",
        clickToEdit &&
          "cursor-pointer rounded-md hover:ring-1 hover:ring-[var(--color-border-strong)] transition-all duration-150"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ModeSwitcher({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const items: { id: Mode; label: string; icon: typeof Pencil }[] = [
    { id: "edit", label: "Edit", icon: Pencil },
    { id: "view", label: "View", icon: Eye },
  ];
  return (
    <div
      data-testid="editor-mode-switcher"
      className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[var(--color-border)]"
    >
      {items.map((it) => {
        const active = mode === it.id;
        const Icon = it.icon;
        return (
          <button
            type="button"
            key={it.id}
            data-testid={`editor-mode-${it.id}`}
            aria-pressed={active}
            onClick={() => onChange(it.id)}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] outline-none",
              "transition-colors duration-150",
              active
                ? "bg-[var(--hover-overlay)] text-[var(--color-text)]"
                : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
            )}
          >
            <Icon size={13} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export function MilkdownEditor({ value, onChange, initialMode = "edit", onSave }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);

  // When the editor is used in click-to-edit mode (task description), we use
  // a different interaction model: no ModeSwitcher tab strip, just a small
  // "Edit" affordance and click-on-view to enter edit mode.
  const isClickToEdit = initialMode === "view";

  if (isClickToEdit) {
    return (
      <div
        data-testid="description-editor"
        data-mode={mode}
        data-milkdown-wrapper
        className="milkdown-wrapper"
      >
        {mode === "view" ? (
          <div className="relative group">
            <ViewMode
              value={value}
              clickToEdit
              onEnterEdit={() => setMode("edit")}
            />
            <button
              type="button"
              data-testid="editor-edit-button"
              aria-label="Edit description"
              onClick={() => setMode("edit")}
              className={cn(
                "absolute top-1 right-1 inline-flex items-center gap-1 h-6 px-2 rounded text-[11px]",
                "text-[var(--color-text-subtle)] bg-[var(--color-surface-raised)]",
                "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150",
                "border border-[var(--color-border)] hover:text-[var(--color-text)]"
              )}
            >
              <Pencil size={11} />
              Edit
            </button>
          </div>
        ) : (
          <EditMode
            value={value}
            onChange={onChange}
            exitOnBlur
            onExitEdit={() => setMode("view")}
            onSave={onSave}
          />
        )}
      </div>
    );
  }

  // Default behaviour (PromptEditor / RoleEditor): explicit Edit/View tab
  // switcher, starts in edit mode, no blur-to-view interaction.
  return (
    <div data-testid="description-editor" data-mode={mode} data-milkdown-wrapper className="milkdown-wrapper">
      <ModeSwitcher mode={mode} onChange={setMode} />
      {mode === "edit" ? (
        <EditMode value={value} onChange={onChange} />
      ) : (
        <ViewMode value={value} />
      )}
    </div>
  );
}
