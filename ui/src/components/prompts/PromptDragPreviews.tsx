import type { Prompt, PromptInGroup } from "../../lib/types.js";
import { ColorDot } from "../sidebar/ColorDot.js";

/**
 * Floating visuals for DragOverlay. Rendered via the @dnd-kit portal so
 * they don't inherit overflow clipping from the sidebar / main area.
 * Each preview mirrors the source row's look at its natural size —
 * no stretch, no scale, same paddings — so the pickup feels like the
 * row detaches rather than mutates.
 */

export function SidebarPromptDragPreview({ prompt }: { prompt: Prompt }) {
  return (
    <div
      data-testid="drag-preview-sidebar-prompt"
      className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border-strong)] shadow-[var(--shadow-lg)] text-[13px] tracking-tight whitespace-nowrap"
    >
      <ColorDot color={prompt.color || "#a1a1a1"} size={8} />
      <span>{prompt.name}</span>
    </div>
  );
}

export function GroupMemberDragPreview({ member }: { member: PromptInGroup }) {
  return (
    <div
      data-testid="drag-preview-member"
      className="inline-block max-w-[560px] rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3 py-3 shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: member.color || "#7a746a" }}
        />
        <h3 className="text-[14px] font-medium tracking-tight truncate">{member.name}</h3>
      </div>
      {member.content.trim().length > 0 && (
        <p className="text-[12px] text-[var(--color-text-muted)] line-clamp-2 whitespace-pre-wrap">
          {member.content}
        </p>
      )}
    </div>
  );
}
