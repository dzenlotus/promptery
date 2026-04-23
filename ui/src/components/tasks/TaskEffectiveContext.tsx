import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { PromptOriginBadge } from "../common/PromptOriginBadge.js";
import { RoleSourceBadge } from "../common/RoleSourceBadge.js";

interface Props {
  taskId: string;
}

/**
 * Read-only view of the task's resolved context — what the agent will
 * actually receive when it calls get_task_bundle. Shows the active role
 * with its inheritance source and the deduplicated prompt union from all
 * six origins (direct, role, column, column-role, board, board-role).
 *
 * Lives inside TaskDialog next to the editable role/prompts surface so the
 * user can compare their direct edits with the final composite that
 * inheritance produces.
 */
export function TaskEffectiveContext({ taskId }: Props) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.taskContext(taskId),
    queryFn: () => api.tasks.context(taskId),
  });

  if (isLoading) {
    return (
      <div
        data-testid="task-effective-context"
        data-state="loading"
        className="text-[12px] text-[var(--color-text-subtle)] px-3 py-2"
      >
        Resolving context…
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="task-effective-context"
        data-state="error"
        className="text-[12px] text-[var(--color-danger)] px-3 py-2"
      >
        {error instanceof Error ? error.message : "Failed to resolve context"}
      </div>
    );
  }

  if (!data) return null;

  const promptCount = data.prompts.length;

  return (
    <div data-testid="task-effective-context" className="grid gap-3">
      {data.role ? (
        <div className="grid gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
            Active role
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: data.role.color || "#7a746a" }}
            />
            <span className="text-[13px] font-medium tracking-tight">
              {data.role.name}
            </span>
            <RoleSourceBadge source={data.role.source} />
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-[var(--color-text-subtle)] px-3 py-2 rounded-md border border-dashed border-[var(--color-border)]">
          No role set anywhere on this task, its column, or its board.
        </div>
      )}

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
            Prompts ({promptCount})
          </div>
          <span className="text-[10px] text-[var(--color-text-subtle)]">
            union from 6 origins · dedup by most specific
          </span>
        </div>

        {promptCount === 0 ? (
          <div className="text-[12px] text-[var(--color-text-subtle)] px-3 py-2 rounded-md border border-dashed border-[var(--color-border)]">
            No prompts will reach the agent. Attach one directly, set a role,
            or configure column/board defaults.
          </div>
        ) : (
          <ul className="grid gap-1.5">
            {data.prompts.map((p) => (
              <li
                key={p.id}
                data-testid={`effective-prompt-${p.id}`}
                className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)] px-3 py-2"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full shrink-0 mt-[5px]"
                  style={{ backgroundColor: p.color || "#7a746a" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium tracking-tight truncate">
                      {p.name}
                    </span>
                    <PromptOriginBadge origin={p.origin} sourceName={p.source?.name} />
                  </div>
                  {p.content.trim().length > 0 && (
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2 whitespace-pre-wrap">
                      {p.content}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
