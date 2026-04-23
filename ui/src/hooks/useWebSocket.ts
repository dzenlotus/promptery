import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { wsClient } from "../lib/ws.js";
import { qk } from "../lib/query.js";
import type { ServerEvent } from "../lib/types.js";

export function useWebSocket(): void {
  const qc = useQueryClient();

  useEffect(() => {
    wsClient.connect();
    const off = wsClient.subscribe((evt: ServerEvent) => {
      switch (evt.type) {
        case "board.created":
        case "board.updated":
        case "board.deleted":
          qc.invalidateQueries({ queryKey: qk.boards });
          break;
        case "column.created":
        case "column.updated":
        case "column.deleted":
          qc.invalidateQueries({ queryKey: qk.columns(evt.data.boardId) });
          break;
        case "task.created":
        case "task.updated":
        case "task.moved":
        case "task.deleted":
          qc.invalidateQueries({ queryKey: qk.tasks(evt.data.boardId) });
          break;
        case "task.role_changed":
        case "task.prompt_added":
        case "task.prompt_removed":
        case "task.skill_added":
        case "task.skill_removed":
        case "task.mcp_tool_added":
        case "task.mcp_tool_removed":
          qc.setQueryData(qk.task(evt.data.taskId), evt.data.task);
          qc.invalidateQueries({ queryKey: qk.tasks(evt.data.boardId) });
          break;
        case "prompt.created":
        case "prompt.updated":
        case "prompt.deleted":
          qc.invalidateQueries({ queryKey: qk.prompts });
          qc.invalidateQueries({ queryKey: ["tasks"] });
          break;
        case "skill.created":
        case "skill.updated":
        case "skill.deleted":
          qc.invalidateQueries({ queryKey: qk.skills });
          qc.invalidateQueries({ queryKey: ["tasks"] });
          break;
        case "mcp_tool.created":
        case "mcp_tool.updated":
        case "mcp_tool.deleted":
          qc.invalidateQueries({ queryKey: qk.mcpTools });
          qc.invalidateQueries({ queryKey: ["tasks"] });
          break;
        case "role.created":
        case "role.updated":
          qc.invalidateQueries({ queryKey: qk.roles });
          if ("roleId" in evt.data) {
            qc.invalidateQueries({ queryKey: qk.role(evt.data.roleId) });
          }
          qc.invalidateQueries({ queryKey: ["tasks"] });
          break;
        case "role.deleted":
          qc.invalidateQueries({ queryKey: qk.roles });
          qc.invalidateQueries({ queryKey: qk.role(evt.data.roleId) });
          qc.invalidateQueries({ queryKey: ["tasks"] });
          break;
        case "role.relations_updated":
          qc.setQueryData(qk.role(evt.data.roleId), evt.data.role);
          qc.invalidateQueries({ queryKey: ["tasks"] });
          break;
      }
    });
    return () => {
      off();
    };
  }, [qc]);
}
