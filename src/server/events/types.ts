import type { Board } from "../../db/queries/boards.js";
import type { Column } from "../../db/queries/columns.js";
import type { Task } from "../../db/queries/tasks.js";
import type { Tag } from "../../db/queries/tags.js";

export type ServerEvent =
  | { type: "board.created"; data: { boardId: string; board: Board } }
  | { type: "board.updated"; data: { boardId: string; board: Board } }
  | { type: "board.deleted"; data: { boardId: string } }
  | { type: "column.created"; data: { boardId: string; column: Column } }
  | { type: "column.updated"; data: { boardId: string; columnId: string; column: Column } }
  | { type: "column.deleted"; data: { boardId: string; columnId: string } }
  | { type: "task.created"; data: { boardId: string; task: Task } }
  | { type: "task.updated"; data: { boardId: string; taskId: string; task: Task } }
  | {
      type: "task.moved";
      data: { boardId: string; taskId: string; columnId: string; position: number };
    }
  | { type: "task.deleted"; data: { boardId: string; taskId: string } }
  | { type: "task.tag_added"; data: { taskId: string; tag: Tag } }
  | { type: "task.tag_removed"; data: { taskId: string; tagId: string } }
  | { type: "tag.created"; data: { tag: Tag } }
  | { type: "tag.updated"; data: { tagId: string; tag: Tag } }
  | { type: "tag.deleted"; data: { tagId: string } };
