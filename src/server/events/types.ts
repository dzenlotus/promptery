import type { Board } from "../../db/queries/boards.js";
import type { Column } from "../../db/queries/columns.js";
import type { Task, TaskWithRelations } from "../../db/queries/tasks.js";
import type { Prompt } from "../../db/queries/prompts.js";
import type { Skill } from "../../db/queries/skills.js";
import type { McpTool } from "../../db/queries/mcpTools.js";
import type { Role, RoleWithRelations } from "../../db/queries/roles.js";

export type ServerEvent =
  | { type: "board.created"; data: { boardId: string; board: Board } }
  | { type: "board.updated"; data: { boardId: string; board: Board } }
  | { type: "board.deleted"; data: { boardId: string } }
  | { type: "column.created"; data: { boardId: string; column: Column } }
  | { type: "column.updated"; data: { boardId: string; columnId: string; column: Column } }
  | { type: "column.deleted"; data: { boardId: string; columnId: string } }
  | { type: "task.created"; data: { boardId: string; task: TaskWithRelations } }
  | {
      type: "task.updated";
      data: { boardId: string; taskId: string; task: TaskWithRelations };
    }
  | {
      type: "task.moved";
      data: { boardId: string; taskId: string; columnId: string; position: number };
    }
  | { type: "task.deleted"; data: { boardId: string; taskId: string } }
  | {
      type: "task.role_changed";
      data: {
        boardId: string;
        taskId: string;
        roleId: string | null;
        task: TaskWithRelations;
      };
    }
  | {
      type: "task.prompt_added";
      data: { boardId: string; taskId: string; promptId: string; task: TaskWithRelations };
    }
  | {
      type: "task.prompt_removed";
      data: { boardId: string; taskId: string; promptId: string; task: TaskWithRelations };
    }
  | {
      type: "task.skill_added";
      data: { boardId: string; taskId: string; skillId: string; task: TaskWithRelations };
    }
  | {
      type: "task.skill_removed";
      data: { boardId: string; taskId: string; skillId: string; task: TaskWithRelations };
    }
  | {
      type: "task.mcp_tool_added";
      data: { boardId: string; taskId: string; mcpToolId: string; task: TaskWithRelations };
    }
  | {
      type: "task.mcp_tool_removed";
      data: { boardId: string; taskId: string; mcpToolId: string; task: TaskWithRelations };
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
