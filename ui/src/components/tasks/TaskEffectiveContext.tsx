import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Folder, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { useRole } from "../../hooks/useRoles.js";
import type { Prompt } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";
import {
  buildLayeredInheritance,
  type LayerId,
  type LayerPromptEntry,
  type PreparedLayer,
} from "./inheritancePreview.js";

interface Props {
  boardId: string;
  columnId: string;
  /** Staged (not yet saved) task role — drives live preview. */
  localRoleId: string | null;
  /** Staged direct-prompt ids on the task. */
  localDirectIds: string[];
  /** Prompt catalogue, used for name / colour / content lookup. */
  allPrompts: Prompt[];
}

const LAYER_TITLE: Record<LayerId, string> = {
  board: "Board context",
  column: "Column context",
  task: "Task context",
};

/**
 * Live, layered view of everything that flows into a task's resolved
 * context. Rendered as three stacked cards (Board → Column → Task) where
 * each entry carries a ✓/✗ marker telling the user whether it actually
 * makes it into the final agent payload or gets shadowed by a stronger
 * (more specific) layer.
 *
 * All inputs (including local draft state from TaskDialog) are wired in,
 * so adding or removing a direct prompt — or switching the task role —
 * updates the view immediately without a save round trip.
 */
export function TaskEffectiveContext({
  boardId,
  columnId,
  localRoleId,
  localDirectIds,
  allPrompts,
}: Props) {
  const promptById = useMemo(
    () => new Map(allPrompts.map((p) => [p.id, p])),
    [allPrompts]
  );

  const { data: board } = useQuery({
    queryKey: qk.board(boardId),
    queryFn: () => api.boards.get(boardId),
  });
  const { data: column } = useQuery({
    queryKey: qk.column(columnId),
    queryFn: () => api.columns.get(columnId),
  });

  // Role details — each is skipped cleanly when the id is null.
  const taskRoleQ = useRole(localRoleId);
  const columnRoleQ = useRole(column?.role_id ?? null);
  const boardRoleQ = useRole(board?.role_id ?? null);

  const layers = useMemo<PreparedLayer[]>(
    () =>
      buildLayeredInheritance({
        localRoleId,
        localDirectIds,
        taskRoleDetail: taskRoleQ.data ?? null,
        column: {
          role: column?.role ?? null,
          prompts: column?.prompts ?? [],
          roleDetail: columnRoleQ.data ?? null,
        },
        board: {
          role: board?.role ?? null,
          prompts: board?.prompts ?? [],
          roleDetail: boardRoleQ.data ?? null,
        },
      }),
    [
      localRoleId,
      localDirectIds,
      taskRoleQ.data,
      column?.role,
      column?.prompts,
      columnRoleQ.data,
      board?.role,
      board?.prompts,
      boardRoleQ.data,
    ]
  );

  const anyContent = layers.some(
    (l) => l.layerRole !== null || l.entries.length > 0
  );

  if (!anyContent) {
    return (
      <div
        data-testid="task-effective-context"
        data-state="empty"
        className="text-[12px] text-[var(--color-text-subtle)] px-3 py-2 rounded-md border border-dashed border-[var(--color-border)]"
      >
        No role or prompts set anywhere on this task, its column, or its board.
      </div>
    );
  }

  // Weakest on top, strongest on bottom — that matches how the user
  // thinks: "global defaults first, this task last". Empty layers
  // collapse to nothing so the card never shows a bare header.
  return (
    <div data-testid="task-effective-context" className="grid gap-3">
      {layers.map((layer) => {
        if (layer.layerRole === null && layer.entries.length === 0) return null;
        return (
          <LayerCard
            key={layer.layerId}
            layer={layer}
            promptById={promptById}
          />
        );
      })}
    </div>
  );
}

function LayerCard({
  layer,
  promptById,
}: {
  layer: PreparedLayer;
  promptById: Map<string, Prompt>;
}) {
  const hasRole = !!layer.layerRole;
  const hasPrompts = layer.entries.length > 0;

  return (
    <section
      data-testid={`inheritance-layer-${layer.layerId}`}
      className="rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)] px-3 py-2 grid gap-2.5"
    >
      <header className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
          {LAYER_TITLE[layer.layerId]}
        </span>
        {layer.layerId === "task" && (
          <span className="text-[10px] text-[var(--color-text-subtle)]">
            strongest
          </span>
        )}
        {layer.layerId === "board" && (
          <span className="text-[10px] text-[var(--color-text-subtle)]">
            global defaults
          </span>
        )}
      </header>

      {hasRole && layer.layerRole && (
        <LayerSection label="Role">
          <Row
            applied={layer.roleApplied}
            name={layer.layerRole.name}
            colorDot={layer.layerRole.color}
            testId={`inheritance-${layer.layerId}-role-${layer.layerRole.id}`}
            tooltip={
              layer.roleApplied
                ? "Active role at this layer"
                : "Overridden by a stronger layer's role"
            }
          />
        </LayerSection>
      )}

      {hasPrompts && (
        <LayerSection label="Prompts">
          <ul className="grid gap-1">
            {layer.entries.map((entry) => (
              <PromptRow
                key={entry.promptId}
                layerId={layer.layerId}
                entry={entry}
                prompt={promptById.get(entry.promptId)}
              />
            ))}
          </ul>
        </LayerSection>
      )}

      {!hasRole && !hasPrompts && (
        <div className="text-[11px] text-[var(--color-text-subtle)] pl-1">
          No role or prompts at this layer.
        </div>
      )}
    </section>
  );
}

/** Section wrapper used inside a LayerCard — renders the subsection label
 *  (Role / Prompts / later Skills / MCP) above a hairline divider. */
function LayerSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
          {label}
        </span>
        <span aria-hidden className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
      {children}
    </div>
  );
}

function PromptRow({
  layerId,
  entry,
  prompt,
}: {
  layerId: LayerId;
  entry: LayerPromptEntry;
  prompt: Prompt | undefined;
}) {
  const name = prompt?.name ?? entry.promptId;
  const tooltip = !entry.applied
    ? "Shadowed by a stronger layer"
    : entry.origin === "role" && entry.role
      ? `from role: ${entry.role.name}`
      : "direct";

  return (
    <li
      data-testid={`inheritance-${layerId}-${entry.promptId}`}
      data-applied={entry.applied}
    >
      <Row
        applied={entry.applied}
        name={name}
        colorDot={prompt?.color ?? null}
        tooltip={tooltip}
        suffix={
          entry.origin === "role" && entry.role ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-subtle)] tracking-tight"
              title={`Inherited from role "${entry.role.name}"`}
            >
              <Folder size={9} style={{ color: entry.role.color || "#7a746a" }} />
              {entry.role.name}
            </span>
          ) : null
        }
      />
    </li>
  );
}

/** One line: status dot + colour swatch + name (+ optional suffix). */
function Row({
  applied,
  name,
  colorDot,
  suffix,
  testId,
  tooltip,
}: {
  applied: boolean;
  name: string;
  colorDot: string | null;
  suffix?: React.ReactNode;
  testId?: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <StatusDot applied={applied} />
      {colorDot !== null && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: colorDot || "#7a746a" }}
        />
      )}
      <span
        className={cn(
          "text-[12px] truncate",
          applied
            ? "text-[var(--color-text)]"
            : "line-through text-[var(--color-text-muted)]"
        )}
        title={tooltip}
      >
        {name}
      </span>
      {suffix}
    </div>
  );
}

function StatusDot({ applied }: { applied: boolean }) {
  return (
    <span
      aria-label={applied ? "applied" : "shadowed"}
      data-applied={applied}
      className={cn(
        "inline-flex items-center justify-center h-4 w-4 rounded-full shrink-0",
        applied
          ? "bg-[color-mix(in_oklab,var(--color-success)_20%,transparent)] text-[var(--color-success)]"
          : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
      )}
    >
      {applied ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
    </span>
  );
}
