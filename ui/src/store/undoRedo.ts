/**
 * Undo/redo store — closure-based action model.
 *
 * Why closures instead of a dispatch + inverse-payload split?
 * Each action captures the exact API parameters and cache keys at the moment
 * the user performed the operation. This sidesteps the need to serialise
 * payload shapes for every action type and keeps the undo/redo logic
 * co-located with the mutation that created it, making it easy to audit.
 * The tradeoff is that the history cannot be persisted across page reloads —
 * which is intentional for a v1 keyboard-only undo feature.
 *
 * Caveat: re-created objects (delete → undo) receive a new server-assigned
 * id/slug. The caller is responsible for surfacing this in a toast.
 */

import { create } from "zustand";

export interface UndoableAction {
  /** Short human-readable label shown in toasts: "Task deleted", etc. */
  label: string;
  /** Re-perform the action (called by redo). */
  do: () => Promise<void>;
  /** Reverse the action (called by undo). */
  undo: () => Promise<void>;
}

const HISTORY_CAP = 50;

interface UndoRedoState {
  past: UndoableAction[];
  future: UndoableAction[];

  /** Append action to past, clear future. Call after a destructive mutation succeeds. */
  recordAction: (action: UndoableAction) => void;

  /**
   * Pop from past, call its undo(), push to future.
   * Returns the action if executed, null if history was empty.
   */
  undo: () => UndoableAction | null;

  /**
   * Pop from future, call its do(), push back to past.
   * Returns the action if executed, null if future was empty.
   */
  redo: () => UndoableAction | null;

  /** Clear both past and future (e.g. on route change). */
  clearHistory: () => void;
}

export const useUndoRedoStore = create<UndoRedoState>((set, get) => ({
  past: [],
  future: [],

  recordAction(action) {
    set((s) => {
      const next = [...s.past, action];
      // Cap at HISTORY_CAP — drop the oldest entry on overflow.
      if (next.length > HISTORY_CAP) next.shift();
      return { past: next, future: [] };
    });
  },

  undo() {
    const { past, future } = get();
    if (past.length === 0) return null;
    const action = past[past.length - 1];
    set({ past: past.slice(0, -1), future: [action, ...future] });
    return action;
  },

  redo() {
    const { past, future } = get();
    if (future.length === 0) return null;
    const action = future[0];
    const nextPast = [...past, action];
    if (nextPast.length > HISTORY_CAP) nextPast.shift();
    set({ past: nextPast, future: future.slice(1) });
    return action;
  },

  clearHistory() {
    set({ past: [], future: [] });
  },
}));
