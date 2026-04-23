import { useEffect, useRef, useState } from "react";
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
 */

type Action =
  | { type: "wrap"; before: string; after?: string }
  | { type: "prepend"; prefix: string }
  | { type: "block"; before: string; after: string };

function applyAction(
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

function EditMode({ value, onChange }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <>
      <Toolbar onAction={handle} />
      <textarea
        ref={taRef}
        data-testid="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write markdown here…"
        spellCheck={false}
        className={cn(
          "w-full min-h-[260px] resize-none bg-transparent outline-none block",
          "p-4 font-mono text-[13px] leading-[1.55] text-[var(--color-text)]",
          "placeholder:text-[var(--color-text-subtle)]"
        )}
      />
    </>
  );
}

function ViewMode({ value }: { value: string }) {
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
        className="milkdown text-[13px] text-[var(--color-text-subtle)]"
      >
        Nothing to preview yet. Switch to Edit to write some markdown.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-testid="editor-view"
      className="milkdown"
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

export function MilkdownEditor({ value, onChange }: Props) {
  const [mode, setMode] = useState<Mode>("edit");
  return (
    <div data-testid="description-editor" data-mode={mode} className="milkdown-wrapper">
      <ModeSwitcher mode={mode} onChange={setMode} />
      {mode === "edit" ? (
        <EditMode value={value} onChange={onChange} />
      ) : (
        <ViewMode value={value} />
      )}
    </div>
  );
}
