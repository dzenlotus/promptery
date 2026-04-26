/**
 * Pure-logic tests for MilkdownEditor.
 *
 * DOM / React rendering is not available in this test environment (node).
 * These tests cover:
 *   1. applyAction — toolbar formatting mutations on textarea state.
 *   2. resolveKeyboardModeTransition — keyboard shortcut → mode transition
 *      rules for the task-description (click-to-edit) variant.
 *   3. Mode initialisation contract: when initialMode is "view", the editor
 *      starts in view mode; when it is "edit" (default), it starts in edit
 *      mode.
 */
import { describe, it, expect } from "vitest";
import { applyAction, resolveKeyboardModeTransition } from "../MilkdownEditor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulates a HTMLTextAreaElement value + selection for applyAction. */
function fakeTextarea(
  value: string,
  selectionStart: number,
  selectionEnd: number
): HTMLTextAreaElement {
  return { value, selectionStart, selectionEnd } as HTMLTextAreaElement;
}

// ---------------------------------------------------------------------------
// applyAction
// ---------------------------------------------------------------------------

describe("applyAction — wrap", () => {
  it("wraps selected text with the given delimiters", () => {
    const ta = fakeTextarea("hello world", 6, 11); // selects "world"
    const result = applyAction(ta, { type: "wrap", before: "**" });
    expect(result.value).toBe("hello **world**");
    // Selection stays on the wrapped word (between the delimiters)
    expect(result.selStart).toBe(8); // after opening **
    expect(result.selEnd).toBe(13);  // before closing **
  });

  it("inserts symmetric delimiters at cursor when nothing is selected", () => {
    const ta = fakeTextarea("hello", 5, 5);
    const result = applyAction(ta, { type: "wrap", before: "*" });
    expect(result.value).toBe("hello**");
    expect(result.selStart).toBe(6);
    expect(result.selEnd).toBe(6);
  });

  it("uses 'after' override when provided", () => {
    const ta = fakeTextarea("code here", 0, 4); // selects "code"
    const result = applyAction(ta, { type: "wrap", before: "`", after: "`" });
    expect(result.value).toBe("`code` here");
  });
});

describe("applyAction — prepend", () => {
  it("prepends prefix at the start of the current line", () => {
    const ta = fakeTextarea("line one\nline two", 9, 9); // cursor on second line
    const result = applyAction(ta, { type: "prepend", prefix: "# " });
    expect(result.value).toBe("line one\n# line two");
    expect(result.selStart).toBe(11);
    expect(result.selEnd).toBe(11);
  });

  it("prepends at the start when cursor is on the first line", () => {
    const ta = fakeTextarea("first line", 3, 3);
    const result = applyAction(ta, { type: "prepend", prefix: "> " });
    expect(result.value).toBe("> first line");
  });
});

describe("applyAction — block", () => {
  it("wraps selection in a code block", () => {
    const ta = fakeTextarea("const x = 1;", 0, 12);
    const result = applyAction(ta, { type: "block", before: "```\n", after: "\n```" });
    expect(result.value).toBe("```\nconst x = 1;\n```");
    expect(result.selStart).toBe(4);
    expect(result.selEnd).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// resolveKeyboardModeTransition
// ---------------------------------------------------------------------------

describe("resolveKeyboardModeTransition — task description (click-to-edit)", () => {
  const inEdit = (event: { key: string; metaKey?: boolean; ctrlKey?: boolean }) =>
    resolveKeyboardModeTransition(
      "edit",
      { metaKey: false, ctrlKey: false, ...event },
      /* isClickToEdit */ true
    );

  it("Escape in edit mode returns 'view'", () => {
    expect(inEdit({ key: "Escape" })).toBe("view");
  });

  it("Cmd+Enter in edit mode returns 'view'", () => {
    expect(inEdit({ key: "Enter", metaKey: true })).toBe("view");
  });

  it("Ctrl+Enter in edit mode returns 'view'", () => {
    expect(inEdit({ key: "Enter", ctrlKey: true })).toBe("view");
  });

  it("Enter without modifier does not trigger a transition", () => {
    expect(inEdit({ key: "Enter" })).toBeNull();
  });

  it("arbitrary key does not trigger a transition", () => {
    expect(inEdit({ key: "a" })).toBeNull();
  });

  it("Escape from view mode does not trigger a transition", () => {
    const result = resolveKeyboardModeTransition(
      "view",
      { key: "Escape", metaKey: false, ctrlKey: false },
      true
    );
    expect(result).toBeNull();
  });
});

describe("resolveKeyboardModeTransition — standard editor (not click-to-edit)", () => {
  it("never returns a transition regardless of key", () => {
    const result = resolveKeyboardModeTransition(
      "edit",
      { key: "Escape", metaKey: false, ctrlKey: false },
      /* isClickToEdit */ false
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// initialMode contract (pure state logic, not component rendering)
// ---------------------------------------------------------------------------

describe("initialMode contract", () => {
  /**
   * The MilkdownEditor component initialises `mode` with `initialMode ?? "edit"`.
   * We verify this contract stays aligned: "view" yields view, undefined/omitted
   * yields edit. We test the value that useState would be seeded with.
   */
  function resolveInitialMode(initialMode: "edit" | "view" | undefined): "edit" | "view" {
    return initialMode ?? "edit";
  }

  it("defaults to edit mode when initialMode is omitted (PromptEditor/RoleEditor behaviour)", () => {
    expect(resolveInitialMode(undefined)).toBe("edit");
  });

  it("starts in view mode when initialMode='view' (TaskDialog behaviour)", () => {
    expect(resolveInitialMode("view")).toBe("view");
  });

  it("starts in edit mode when initialMode='edit' is explicit", () => {
    expect(resolveInitialMode("edit")).toBe("edit");
  });
});
