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

export interface Prompt {
  id: string;
  name: string;
  content: string;
  color: string;
  created_at: number;
  updated_at: number;
}

export type Skill = Prompt;
export type McpTool = Prompt;
export type Role = Prompt;

export interface RoleWithRelations extends Role {
  prompts: Prompt[];
  skills: Skill[];
  mcp_tools: McpTool[];
}

/** Origin marker: "direct" when user attached it, "role:<id>" when inherited. */
export type LinkOrigin = "direct" | `role:${string}`;

export interface TaskLinkedPrompt extends Prompt {
  origin: LinkOrigin;
}
export interface TaskLinkedSkill extends Skill {
  origin: LinkOrigin;
}
export interface TaskLinkedMcpTool extends McpTool {
  origin: LinkOrigin;
}

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  number: number;
  title: string;
  description: string;
  position: number;
  role_id: string | null;
  role: Role | null;
  prompts: TaskLinkedPrompt[];
  skills: TaskLinkedSkill[];
  mcp_tools: TaskLinkedMcpTool[];
  created_at: number;
  updated_at: number;
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

export interface CreatePrimitiveInput {
  name: string;
  content?: string;
  color?: string;
}

export type UpdatePrimitiveInput = Partial<CreatePrimitiveInput>;

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
  | {
      type: "task.role_changed";
      data: { boardId: string; taskId: string; roleId: string | null; task: Task };
    }
  | {
      type: "task.prompt_added";
      data: { boardId: string; taskId: string; promptId: string; task: Task };
    }
  | {
      type: "task.prompt_removed";
      data: { boardId: string; taskId: string; promptId: string; task: Task };
    }
  | {
      type: "task.skill_added";
      data: { boardId: string; taskId: string; skillId: string; task: Task };
    }
  | {
      type: "task.skill_removed";
      data: { boardId: string; taskId: string; skillId: string; task: Task };
    }
  | {
      type: "task.mcp_tool_added";
      data: { boardId: string; taskId: string; mcpToolId: string; task: Task };
    }
  | {
      type: "task.mcp_tool_removed";
      data: { boardId: string; taskId: string; mcpToolId: string; task: Task };
    }
  | { type: "prompt.created"; data: { prompt: Prompt } }
  | { type: "prompt.updated"; data: { promptId: string; prompt: Prompt } }
  | { type: "prompt.deleted"; data: { promptId: string } }
  | { type: "skill.created"; data: { skill: Skill } }
  | { type: "skill.updated"; data: { skillId: string; skill: Skill } }
  | { type: "skill.deleted"; data: { skillId: string } }
  | { type: "mcp_tool.created"; data: { mcpTool: McpTool } }
  | { type: "mcp_tool.updated"; data: { mcpToolId: string; mcpTool: McpTool } }
  | { type: "mcp_tool.deleted"; data: { mcpToolId: string } }
  | { type: "role.created"; data: { role: Role } }
  | { type: "role.updated"; data: { roleId: string; role: Role } }
  | { type: "role.deleted"; data: { roleId: string } }
  | {
      type: "role.relations_updated";
      data: { roleId: string; role: RoleWithRelations };
    };
