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
        case "task.tag_added":
        case "task.tag_removed":
          // Task list contains tags, so invalidate all task lists.
          qc.invalidateQueries({ queryKey: ["tasks"] });
          break;
        case "tag.created":
        case "tag.updated":
        case "tag.deleted":
          qc.invalidateQueries({ queryKey: ["tags"] });
          qc.invalidateQueries({ queryKey: ["tasks"] });
          break;
      }
    });
    return () => {
      off();
    };
  }, [qc]);
}
