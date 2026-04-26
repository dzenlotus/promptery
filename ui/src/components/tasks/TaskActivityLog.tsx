import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Pencil,
  Plus,
  Sparkles,
  UserCog,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { relativeTime } from "../../lib/time.js";
import { cn } from "../../lib/cn.js";
import type { TaskEvent, TaskEventType } from "../../lib/types.js";

interface Props {
  taskId: string;
}

const TYPE_LABEL: Record<TaskEventType, string> = {
  "task.created": "Task created",
  "task.updated": "Task updated",
  "task.moved": "Moved between columns",
  "task.deleted": "Task deleted",
  "task.role_changed": "Role changed",
  "task.prompt_added": "Prompt added",
  "task.prompt_removed": "Prompt removed",
  "task.skill_added": "Skill added",
  "task.skill_removed": "Skill removed",
  "task.mcp_tool_added": "MCP tool added",
  "task.mcp_tool_removed": "MCP tool removed",
};

function eventIcon(type: TaskEventType) {
  switch (type) {
    case "task.created":
      return CirclePlus;
    case "task.updated":
      return Pencil;
    case "task.moved":
      return ArrowRightLeft;
    case "task.role_changed":
      return UserCog;
    case "task.prompt_added":
    case "task.skill_added":
    case "task.mcp_tool_added":
      return Plus;
    case "task.prompt_removed":
    case "task.skill_removed":
    case "task.mcp_tool_removed":
      return X;
    case "task.deleted":
      return X;
    default:
      return Sparkles;
  }
}

/**
 * Single line per event: icon + label + (optional) detail summary,
 * actor chip, and a relative timestamp. The detail text comes from a
 * type-specific switch — we don't expose the raw `details_json` blob
 * to keep the dialog readable.
 */
function eventDetailText(event: TaskEvent): string | null {
  const d = event.details ?? {};
  switch (event.type) {
    case "task.updated": {
      const changes = d.changes as Record<string, unknown> | undefined;
      if (!changes) return null;
      const fields = Object.keys(changes);
      if (fields.length === 0) return null;
      return fields.join(", ");
    }
    case "task.role_changed": {
      const name = d.role_name as string | null | undefined;
      return name ? `→ ${name}` : "cleared";
    }
    case "task.prompt_added":
    case "task.prompt_removed":
      return (d.prompt_name as string | undefined) ?? null;
    case "task.skill_added":
    case "task.skill_removed":
      return (d.skill_name as string | undefined) ?? null;
    case "task.mcp_tool_added":
    case "task.mcp_tool_removed":
      return (d.mcp_tool_name as string | undefined) ?? null;
    default:
      return null;
  }
}

interface ActorChipProps {
  actor: string | null;
}

/**
 * Small colored pill: a deterministic colour per actor (so `claude-desktop`
 * always renders teal, `cursor` always blue, etc.). UI-only requests
 * render as a muted "UI" chip rather than blank space — the timeline
 * stays scannable even when most rows are user-driven.
 */
function ActorChip({ actor }: ActorChipProps) {
  const label = actor ?? "UI";
  const palette = actor ? colorForActor(actor) : { bg: "var(--hover-overlay)", text: "var(--color-text-subtle)" };
  return (
    <span
      className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium tracking-tight whitespace-nowrap"
      style={{ backgroundColor: palette.bg, color: palette.text }}
      data-testid={`task-event-actor-${label}`}
    >
      {label}
    </span>
  );
}

function colorForActor(actor: string): { bg: string; text: string } {
  // Cheap stable hash → hue. Fixed saturation/lightness so chips stay legible
  // in both themes; we tint the bg via alpha and lift the text colour to the
  // base hue so the pill doesn't fight with the row text.
  let h = 0;
  for (let i = 0; i < actor.length; i++) {
    h = (h * 31 + actor.charCodeAt(i)) % 360;
  }
  return {
    bg: `hsl(${h} 70% 60% / 0.18)`,
    text: `hsl(${h} 70% 45%)`,
  };
}

export function TaskActivityLog({ taskId }: Props) {
  const [open, setOpen] = useState(false);

  // Fetch only after the user expands the section — keeps the dialog snappy
  // for users who never look at the timeline. WS-driven updates land in the
  // same query key so an open list stays live.
  const { data: events = [], isLoading } = useQuery({
    queryKey: qk.taskEvents(taskId),
    queryFn: () => api.tasks.events(taskId),
    enabled: open,
  });

  return (
    <div data-testid="task-activity-log" className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-medium",
          "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]",
          "self-start"
        )}
        data-testid="task-activity-toggle"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Activity
        {events.length > 0 ? (
          <span className="ml-1 text-[10px] text-[var(--color-text-subtle)] normal-case tracking-normal">
            ({events.length})
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="grid gap-1 pl-2 border-l border-[var(--color-border)]">
          {isLoading ? (
            <div className="text-[12px] text-[var(--color-text-subtle)] py-1">
              Loading…
            </div>
          ) : events.length === 0 ? (
            <div
              className="text-[12px] text-[var(--color-text-subtle)] py-1"
              data-testid="task-activity-empty"
            >
              No activity yet.
            </div>
          ) : (
            <ul className="grid gap-1">
              {events.map((event) => (
                <ActivityRow key={event.id} event={event} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ActivityRow({ event }: { event: TaskEvent }) {
  const Icon = eventIcon(event.type);
  const detail = eventDetailText(event);
  const absolute = new Date(event.created_at).toLocaleString();
  return (
    <li
      data-testid={`task-event-${event.type}`}
      className="flex items-start gap-2 py-1 text-[12px] leading-snug"
    >
      <Icon
        size={12}
        className="mt-[3px] shrink-0 text-[var(--color-text-subtle)]"
        aria-hidden="true"
      />
      <div className="grid gap-0.5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[var(--color-text)] truncate">
            {TYPE_LABEL[event.type]}
            {detail ? (
              <>
                {" "}
                <span className="text-[var(--color-text-subtle)]">{detail}</span>
              </>
            ) : null}
          </span>
          <ActorChip actor={event.actor} />
        </div>
        <span
          title={absolute}
          className="text-[11px] text-[var(--color-text-subtle)]"
        >
          {relativeTime(event.created_at)}
        </span>
      </div>
    </li>
  );
}
