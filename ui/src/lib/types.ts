export type TagKind = "role" | "skill" | "prompt" | "mcp";

export interface Tag {
  id: string;
  name: string;
  description: string;
  color: string;
  kind: TagKind;
  created_at: number;
  updated_at: number;
}

export interface TaskTagLite {
  id: string;
  name: string;
  color: string;
  kind: TagKind;
}

export interface TaskTagFull extends TaskTagLite {
  description: string;
}

export interface Board {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: number;
}

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  number: number;
  title: string;
  description: string;
  position: number;
  created_at: number;
  updated_at: number;
  tags: TaskTagLite[];
}

export interface TaskFull extends Omit<Task, "tags"> {
  tags: TaskTagFull[];
}

export interface CreateTaskInput {
  column_id: string;
  title: string;
  description?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  column_id?: string;
  position?: number;
}

export interface CreateTagInput {
  name: string;
  kind: TagKind;
  description?: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  description?: string;
  color?: string;
  kind?: TagKind;
}

export type ServerEvent =
  | { type: "hello"; data: { connectedClients: number } }
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
