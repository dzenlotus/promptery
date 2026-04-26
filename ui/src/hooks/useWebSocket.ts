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
        case "space.created":
        case "space.updated":
        case "space.deleted":
          qc.invalidateQueries({ queryKey: qk.spaces });
          if ("spaceId" in evt.data) {
            qc.invalidateQueries({ queryKey: qk.space(evt.data.spaceId) });
          }
          break;
        case "spaces.reordered":
          qc.invalidateQueries({ queryKey: qk.spaces });
          break;
        case "boards.reordered":
          // Position is the only thing that changed; the cheapest fresh
          // read is via the boards list.
          qc.invalidateQueries({ queryKey: qk.boards });
          break;
        case "board.moved_to_space":
          // Slugs of every task on the board changed; the board's space_id
          // also changed. Refresh boards, the moved board's tasks, and both
          // affected spaces.
          qc.invalidateQueries({ queryKey: qk.spaces });
          qc.invalidateQueries({ queryKey: qk.boards });
          qc.invalidateQueries({ queryKey: qk.board(evt.data.boardId) });
          qc.invalidateQueries({ queryKey: qk.tasks(evt.data.boardId) });
          break;
        case "board.created":
        case "board.updated":
        case "board.deleted":
          qc.invalidateQueries({ queryKey: qk.boards });
          if ("boardId" in evt.data) {
            qc.invalidateQueries({ queryKey: qk.board(evt.data.boardId) });
          }
          // Boards can move between spaces; refresh space board_ids too.
          qc.invalidateQueries({ queryKey: qk.spaces });
          qc.invalidateQueries({ queryKey: ["task-context"] });
          break;
        case "board.role_changed":
        case "board.prompts_changed":
          qc.invalidateQueries({ queryKey: qk.board(evt.data.boardId) });
          qc.invalidateQueries({ queryKey: ["task-context"] });
          break;
        case "column.created":
        case "column.updated":
        case "column.deleted":
          qc.invalidateQueries({ queryKey: qk.columns(evt.data.boardId) });
          if ("columnId" in evt.data) {
            qc.invalidateQueries({ queryKey: qk.column(evt.data.columnId) });
          }
          qc.invalidateQueries({ queryKey: ["task-context"] });
          break;
        case "column.reordered":
          // Server-authoritative reorder: overwrite local order so other tabs
          // reflect the drop immediately. If this tab originated the reorder,
          // the optimistic update already applied and this is a no-op.
          qc.invalidateQueries({ queryKey: qk.columns(evt.data.boardId) });
          break;
        case "column.role_changed":
        case "column.prompts_changed":
          qc.invalidateQueries({ queryKey: qk.column(evt.data.columnId) });
          qc.invalidateQueries({ queryKey: qk.columns(evt.data.boardId) });
          qc.invalidateQueries({ queryKey: ["task-context"] });
          break;
        case "task.created":
          qc.invalidateQueries({ queryKey: qk.tasks(evt.data.boardId) });
          // Seed the individual-task cache so the dialog is immediately fresh
          // if opened after creation, without a separate round trip.
          qc.setQueryData(qk.task(evt.data.task.id), evt.data.task);
          break;
        case "task.updated":
          // Refresh the board list (card view) AND the individual-task cache
          // (dialog view) so both stay in sync when an agent or another tab
          // calls update_task. task.updated carries the full updated task.
          qc.invalidateQueries({ queryKey: qk.tasks(evt.data.boardId) });
          qc.setQueryData(qk.task(evt.data.taskId), evt.data.task);
          qc.invalidateQueries({ queryKey: qk.taskContext(evt.data.taskId) });
          break;
        case "task.deleted":
          qc.invalidateQueries({ queryKey: qk.tasks(evt.data.boardId) });
          qc.removeQueries({ queryKey: qk.task(evt.data.taskId) });
          break;
        case "task.moved":
          // Cross-board moves need both source and destination invalidated:
          // the source board tab must drop the task from its list, the
          // destination board tab must show it. Same-board moves dedupe
          // to a single invalidation.
          qc.invalidateQueries({ queryKey: qk.tasks(evt.data.oldBoardId) });
          if (evt.data.oldBoardId !== evt.data.newBoardId) {
            qc.invalidateQueries({ queryKey: qk.tasks(evt.data.newBoardId) });
          }
          qc.invalidateQueries({ queryKey: qk.taskContext(evt.data.taskId) });
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
          qc.invalidateQueries({ queryKey: qk.taskContext(evt.data.taskId) });
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
        case "setting.changed":
          qc.setQueryData(qk.setting(evt.data.key), evt.data.value);
          break;
        case "setting.deleted":
          qc.invalidateQueries({ queryKey: qk.setting(evt.data.key) });
          break;
        case "data.imported":
        case "data.restored":
          // Both events can touch every table; refetch everything.
          qc.invalidateQueries();
          break;
        case "data.backup_created":
        case "data.backup_deleted":
          qc.invalidateQueries({ queryKey: ["backups"] });
          break;
        case "prompt_group.created":
        case "prompt_group.deleted":
        case "prompt_group.reordered":
          qc.invalidateQueries({ queryKey: qk.promptGroups });
          break;
        case "prompt_group.updated":
          qc.invalidateQueries({ queryKey: qk.promptGroups });
          qc.invalidateQueries({ queryKey: qk.promptGroup(evt.data.groupId) });
          break;
      }
    });
    return () => {
      off();
    };
  }, [qc]);
}
