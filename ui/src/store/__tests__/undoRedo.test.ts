import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUndoRedoStore } from "../undoRedo.js";

function makeAction(label: string) {
  return {
    label,
    do: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn().mockResolvedValue(undefined),
  };
}

describe("useUndoRedoStore", () => {
  beforeEach(() => {
    // Reset store state between tests.
    useUndoRedoStore.setState({ past: [], future: [] });
  });

  describe("recordAction", () => {
    it("appends to past and clears future", () => {
      const a1 = makeAction("action-1");
      const a2 = makeAction("action-2");

      useUndoRedoStore.getState().recordAction(a1);
      useUndoRedoStore.getState().recordAction(a2);

      const { past, future } = useUndoRedoStore.getState();
      expect(past).toHaveLength(2);
      expect(past[0].label).toBe("action-1");
      expect(past[1].label).toBe("action-2");
      expect(future).toHaveLength(0);
    });

    it("clears future on new action after undo", () => {
      const a1 = makeAction("action-1");
      useUndoRedoStore.getState().recordAction(a1);
      useUndoRedoStore.getState().undo();

      // Verify future was populated by undo.
      expect(useUndoRedoStore.getState().future).toHaveLength(1);

      // New action should clear future.
      const a2 = makeAction("action-2");
      useUndoRedoStore.getState().recordAction(a2);
      expect(useUndoRedoStore.getState().future).toHaveLength(0);
    });

    it("caps history at 50 entries, dropping oldest", () => {
      for (let i = 0; i < 55; i++) {
        useUndoRedoStore.getState().recordAction(makeAction(`action-${i}`));
      }
      const { past } = useUndoRedoStore.getState();
      expect(past).toHaveLength(50);
      // Oldest 5 (0–4) were dropped; first remaining is action-5.
      expect(past[0].label).toBe("action-5");
      expect(past[49].label).toBe("action-54");
    });
  });

  describe("undo", () => {
    it("pops from past and pushes to future, returns action", () => {
      const a1 = makeAction("action-1");
      const a2 = makeAction("action-2");
      useUndoRedoStore.getState().recordAction(a1);
      useUndoRedoStore.getState().recordAction(a2);

      const returned = useUndoRedoStore.getState().undo();

      expect(returned?.label).toBe("action-2");
      const { past, future } = useUndoRedoStore.getState();
      expect(past).toHaveLength(1);
      expect(past[0].label).toBe("action-1");
      expect(future).toHaveLength(1);
      expect(future[0].label).toBe("action-2");
    });

    it("returns null and does nothing when history is empty", () => {
      const result = useUndoRedoStore.getState().undo();
      expect(result).toBeNull();
      const { past, future } = useUndoRedoStore.getState();
      expect(past).toHaveLength(0);
      expect(future).toHaveLength(0);
    });

    it("stacks multiple undos", () => {
      const actions = [makeAction("a"), makeAction("b"), makeAction("c")];
      for (const a of actions) useUndoRedoStore.getState().recordAction(a);

      useUndoRedoStore.getState().undo();
      useUndoRedoStore.getState().undo();

      const { past, future } = useUndoRedoStore.getState();
      expect(past).toHaveLength(1);
      expect(past[0].label).toBe("a");
      expect(future[0].label).toBe("b");
      expect(future[1].label).toBe("c");
    });
  });

  describe("redo", () => {
    it("pops from future and pushes to past, returns action", () => {
      const a1 = makeAction("action-1");
      useUndoRedoStore.getState().recordAction(a1);
      useUndoRedoStore.getState().undo();

      const returned = useUndoRedoStore.getState().redo();

      expect(returned?.label).toBe("action-1");
      const { past, future } = useUndoRedoStore.getState();
      expect(past).toHaveLength(1);
      expect(past[0].label).toBe("action-1");
      expect(future).toHaveLength(0);
    });

    it("returns null and does nothing when future is empty", () => {
      const result = useUndoRedoStore.getState().redo();
      expect(result).toBeNull();
    });

    it("redo after multiple undos restores in order", () => {
      const actions = [makeAction("a"), makeAction("b"), makeAction("c")];
      for (const a of actions) useUndoRedoStore.getState().recordAction(a);

      useUndoRedoStore.getState().undo(); // c → future
      useUndoRedoStore.getState().undo(); // b → future

      useUndoRedoStore.getState().redo(); // b back → past

      const { past, future } = useUndoRedoStore.getState();
      expect(past.map((x) => x.label)).toEqual(["a", "b"]);
      expect(future.map((x) => x.label)).toEqual(["c"]);
    });

    it("redo respects history cap when past is already at 50", () => {
      // Fill past to cap.
      for (let i = 0; i < 50; i++) {
        useUndoRedoStore.getState().recordAction(makeAction(`a${i}`));
      }
      // Put one item in future by undoing once.
      useUndoRedoStore.getState().undo();

      // Redo: past was at 49, gets to 50.
      useUndoRedoStore.getState().redo();
      expect(useUndoRedoStore.getState().past).toHaveLength(50);
    });
  });

  describe("clearHistory", () => {
    it("clears both past and future", () => {
      const a = makeAction("x");
      useUndoRedoStore.getState().recordAction(a);
      useUndoRedoStore.getState().undo();

      useUndoRedoStore.getState().clearHistory();

      const { past, future } = useUndoRedoStore.getState();
      expect(past).toHaveLength(0);
      expect(future).toHaveLength(0);
    });
  });
});
