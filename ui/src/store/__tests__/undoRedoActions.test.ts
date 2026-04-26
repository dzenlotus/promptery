/**
 * Integration-style tests for each undo/redo action category.
 *
 * These tests verify the closure contract: when an action is created and then
 * undone/redone, it calls the correct API methods with the correct arguments.
 * The API module is mocked so no real network calls are made.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUndoRedoStore } from "../undoRedo.js";

// ---------------------------------------------------------------------------
// Minimal stubs for dependencies so the closures can run in isolation.
// ---------------------------------------------------------------------------

// We can't import the real API because it depends on `fetch` (DOM). Instead
// we define the same shape and patch calls with vi.fn().
const mockApi = {
  tasks: {
    delete: vi.fn().mockResolvedValue({ ok: true }),
    create: vi.fn().mockResolvedValue({ id: "new-id", number: 2, title: "test" }),
    move: vi.fn().mockResolvedValue({}),
  },
  columns: {
    delete: vi.fn().mockResolvedValue({ ok: true }),
    create: vi.fn().mockResolvedValue({ id: "col-new", name: "Column A" }),
  },
  prompts: {
    delete: vi.fn().mockResolvedValue({ ok: true }),
    create: vi.fn().mockResolvedValue({ id: "p-new", name: "Prompt A" }),
  },
  promptGroups: {
    delete: vi.fn().mockResolvedValue({ ok: true }),
    create: vi.fn().mockResolvedValue({ id: "g-new", name: "Group A", prompts: [] }),
  },
};

const mockInvalidate = vi.fn().mockResolvedValue(undefined);
const mockSetQueryData = vi.fn();
const mockQc = {
  invalidateQueries: mockInvalidate,
  setQueryData: mockSetQueryData,
};

// ---------------------------------------------------------------------------
// Helper to build the undo action closures identically to how the components
// build them — without importing the actual component (which needs DOM/React).
// ---------------------------------------------------------------------------

function makeTaskDeleteAction(task: {
  id: string;
  column_id: string;
  title: string;
  description: string;
  board_id: string;
}) {
  const boardId = task.board_id;
  return {
    label: `Delete task "${task.title}"`,
    do: async () => {
      await mockApi.tasks.delete(task.id);
      mockQc.setQueryData(`tasks-${boardId}`, (old: unknown) => old);
    },
    undo: async () => {
      const restored = await mockApi.tasks.create(boardId, {
        column_id: task.column_id,
        title: task.title,
        description: task.description,
      });
      await mockQc.invalidateQueries({ queryKey: [`tasks-${boardId}`] });
      return restored;
    },
  };
}

function makeTaskMoveAction(
  taskId: string,
  taskTitle: string,
  originalColumnId: string,
  originalPosition: number,
  targetColumnId: string,
  newPosition: number,
  boardId: string
) {
  return {
    label: `Move task "${taskTitle}"`,
    do: async () => {
      await mockApi.tasks.move(taskId, targetColumnId, newPosition);
      await mockQc.invalidateQueries({ queryKey: [`tasks-${boardId}`] });
    },
    undo: async () => {
      await mockApi.tasks.move(taskId, originalColumnId, originalPosition);
      await mockQc.invalidateQueries({ queryKey: [`tasks-${boardId}`] });
    },
  };
}

function makeColumnDeleteAction(
  column: { id: string; name: string },
  boardId: string
) {
  return {
    label: `Delete column "${column.name}"`,
    do: async () => {
      await mockApi.columns.delete(column.id);
      mockQc.setQueryData(`cols-${boardId}`, (old: unknown) => old);
    },
    undo: async () => {
      const restored = await mockApi.columns.create(boardId, column.name);
      await mockQc.invalidateQueries({ queryKey: [`cols-${boardId}`] });
      return restored;
    },
  };
}

function makePromptDeleteAction(prompt: {
  id: string;
  name: string;
  content: string;
  color: string;
}) {
  return {
    label: `Delete prompt "${prompt.name}"`,
    do: async () => {
      await mockApi.prompts.delete(prompt.id);
      await mockQc.invalidateQueries({ queryKey: ["prompts"] });
    },
    undo: async () => {
      const restored = await mockApi.prompts.create({
        name: prompt.name,
        content: prompt.content,
        color: prompt.color,
      });
      await mockQc.invalidateQueries({ queryKey: ["prompts"] });
      return restored;
    },
  };
}

function makeGroupDeleteAction(group: {
  id: string;
  name: string;
  color: string | null;
  member_ids: string[];
}) {
  return {
    label: `Delete group "${group.name}"`,
    do: async () => {
      await mockApi.promptGroups.delete(group.id);
      await mockQc.invalidateQueries({ queryKey: ["prompt-groups"] });
    },
    undo: async () => {
      const restored = await mockApi.promptGroups.create({
        name: group.name,
        color: group.color ?? undefined,
        prompt_ids: group.member_ids,
      });
      await mockQc.invalidateQueries({ queryKey: ["prompt-groups"] });
      return restored;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("undo/redo action category — task delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUndoRedoStore.setState({ past: [], future: [] });
  });

  it("undo calls create with original task data", async () => {
    const task = {
      id: "t1",
      board_id: "b1",
      column_id: "col1",
      title: "My task",
      description: "desc",
    };
    const action = makeTaskDeleteAction(task);
    useUndoRedoStore.getState().recordAction(action);

    const undone = useUndoRedoStore.getState().undo();
    expect(undone).not.toBeNull();
    await undone!.undo();

    expect(mockApi.tasks.create).toHaveBeenCalledWith("b1", {
      column_id: "col1",
      title: "My task",
      description: "desc",
    });
  });

  it("redo calls delete with original task id", async () => {
    const task = {
      id: "t1",
      board_id: "b1",
      column_id: "col1",
      title: "My task",
      description: "desc",
    };
    const action = makeTaskDeleteAction(task);
    useUndoRedoStore.getState().recordAction(action);
    useUndoRedoStore.getState().undo();

    const redone = useUndoRedoStore.getState().redo();
    expect(redone).not.toBeNull();
    await redone!.do();

    expect(mockApi.tasks.delete).toHaveBeenCalledWith("t1");
  });
});

describe("undo/redo action category — task move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUndoRedoStore.setState({ past: [], future: [] });
  });

  it("undo calls move with original column and position", async () => {
    const action = makeTaskMoveAction(
      "task-1",
      "Task title",
      "col-original",
      5,
      "col-target",
      10,
      "board-1"
    );
    useUndoRedoStore.getState().recordAction(action);

    const undone = useUndoRedoStore.getState().undo();
    await undone!.undo();

    expect(mockApi.tasks.move).toHaveBeenCalledWith("task-1", "col-original", 5);
  });

  it("redo calls move with target column and new position", async () => {
    const action = makeTaskMoveAction(
      "task-1",
      "Task title",
      "col-original",
      5,
      "col-target",
      10,
      "board-1"
    );
    useUndoRedoStore.getState().recordAction(action);
    useUndoRedoStore.getState().undo();

    const redone = useUndoRedoStore.getState().redo();
    await redone!.do();

    expect(mockApi.tasks.move).toHaveBeenCalledWith("task-1", "col-target", 10);
  });
});

describe("undo/redo action category — column delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUndoRedoStore.setState({ past: [], future: [] });
  });

  it("undo calls column create with original name", async () => {
    const action = makeColumnDeleteAction({ id: "c1", name: "To Do" }, "b1");
    useUndoRedoStore.getState().recordAction(action);

    const undone = useUndoRedoStore.getState().undo();
    await undone!.undo();

    expect(mockApi.columns.create).toHaveBeenCalledWith("b1", "To Do");
  });
});

describe("undo/redo action category — prompt delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUndoRedoStore.setState({ past: [], future: [] });
  });

  it("undo calls prompt create with original data", async () => {
    const action = makePromptDeleteAction({
      id: "p1",
      name: "System prompt",
      content: "You are an assistant.",
      color: "#ff0000",
    });
    useUndoRedoStore.getState().recordAction(action);

    const undone = useUndoRedoStore.getState().undo();
    await undone!.undo();

    expect(mockApi.prompts.create).toHaveBeenCalledWith({
      name: "System prompt",
      content: "You are an assistant.",
      color: "#ff0000",
    });
  });
});

describe("undo/redo action category — group delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUndoRedoStore.setState({ past: [], future: [] });
  });

  it("undo calls group create with original name and member_ids", async () => {
    const action = makeGroupDeleteAction({
      id: "g1",
      name: "Writing helpers",
      color: "#aabbcc",
      member_ids: ["p1", "p2", "p3"],
    });
    useUndoRedoStore.getState().recordAction(action);

    const undone = useUndoRedoStore.getState().undo();
    await undone!.undo();

    expect(mockApi.promptGroups.create).toHaveBeenCalledWith({
      name: "Writing helpers",
      color: "#aabbcc",
      prompt_ids: ["p1", "p2", "p3"],
    });
  });

  it("undo with null color passes undefined (not null)", async () => {
    const action = makeGroupDeleteAction({
      id: "g2",
      name: "No color",
      color: null,
      member_ids: [],
    });
    useUndoRedoStore.getState().recordAction(action);

    const undone = useUndoRedoStore.getState().undo();
    await undone!.undo();

    expect(mockApi.promptGroups.create).toHaveBeenCalledWith(
      expect.objectContaining({ color: undefined })
    );
  });
});

describe("history cleared on route change simulation", () => {
  beforeEach(() => {
    useUndoRedoStore.setState({ past: [], future: [] });
  });

  it("clearHistory wipes both stacks", () => {
    const store = useUndoRedoStore.getState();
    store.recordAction(makeGroupDeleteAction({
      id: "g1", name: "G", color: null, member_ids: []
    }));
    store.undo();

    store.clearHistory();

    expect(useUndoRedoStore.getState().past).toHaveLength(0);
    expect(useUndoRedoStore.getState().future).toHaveLength(0);
  });
});
