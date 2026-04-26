/**
 * Global keyboard hook for Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo).
 *
 * Guard: if the focused element is a text input, textarea, or contenteditable
 * node, the shortcut is ignored so native browser undo still works inside
 * those fields.
 *
 * Mount once at the app/route level. Clears history on route change.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useUndoRedoStore } from "../store/undoRedo.js";

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useUndoRedoHotkeys() {
  const store = useUndoRedoStore();
  const [location] = useLocation();

  // Clear history on route change so stale closures referencing the previous
  // page's data don't accidentally fire.
  useEffect(() => {
    store.clearHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key !== "z" && e.key !== "Z") return;

      // Don't intercept inside text fields.
      if (isTypingTarget(document.activeElement)) return;

      e.preventDefault();

      const isRedo = e.shiftKey;

      if (isRedo) {
        const action = store.redo();
        if (!action) return;
        action
          .do()
          .then(() => toast.success(`${action.label} redone`))
          .catch((err: unknown) => {
            toast.error(
              err instanceof Error ? err.message : `Failed to redo: ${action.label}`
            );
          });
      } else {
        const action = store.undo();
        if (!action) return;
        action
          .undo()
          .then(() => toast.success(`${action.label} undone`))
          .catch((err: unknown) => {
            toast.error(
              err instanceof Error ? err.message : `Failed to undo: ${action.label}`
            );
          });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);
}
