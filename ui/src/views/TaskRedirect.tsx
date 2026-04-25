import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api.js";
import { qk } from "../lib/query.js";
import { ROUTES } from "../lib/routes.js";

/**
 * `/t/<idOrSlug>` — external-friendly task URL. Resolves the slug or id
 * via the server, then redirects to the task's board (`/board/<boardId>`).
 *
 * Why a redirect rather than a standalone task view:
 *
 *  - The kanban context (siblings, column, board header) is part of how a
 *    user reasons about a task. Showing a task in isolation would strip
 *    that context.
 *  - Slugs are mutable across `move_board_to_space`; the internal id
 *    isn't. Carrying either form into the resolver keeps both kinds of
 *    links viable across moves.
 *  - The agent / MCP side prefers id refs anyway; this route exists for
 *    humans pasting slugs into chat.
 */
export function TaskRedirect() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const [, setLocation] = useLocation();

  const { data, error, isLoading } = useQuery({
    queryKey: qk.taskWithLocation(idOrSlug),
    queryFn: () => api.tasks.withLocation(idOrSlug),
    retry: false,
  });

  useEffect(() => {
    if (data?.board?.id) {
      // `replace: true` so the browser's back button skips the /t/ URL —
      // the user lands on the board and "back" returns to wherever they
      // came from, not to a redirect step.
      setLocation(ROUTES.board(data.board.id), { replace: true });
    }
  }, [data?.board?.id, setLocation]);

  if (isLoading) {
    return (
      <div
        data-testid="task-redirect-loading"
        className="h-full grid place-items-center text-[13px] text-[var(--color-text-subtle)]"
      >
        Resolving task…
      </div>
    );
  }

  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div
      data-testid="task-redirect-not-found"
      className="h-full grid place-items-center p-8 text-center"
    >
      <div className="grid gap-1">
        <p className="text-[15px] font-medium">
          {notFound ? "Task not found" : "Could not load task"}
        </p>
        <p className="text-[12px] text-[var(--color-text-subtle)]">
          {notFound
            ? `No task matches "${idOrSlug}". The slug may have changed if its board was moved between spaces — try the internal id.`
            : "Please try again."}
        </p>
      </div>
    </div>
  );
}
