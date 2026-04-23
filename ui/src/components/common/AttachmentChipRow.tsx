import { useMemo } from "react";
import { Folder } from "lucide-react";
import { Chip } from "../ui/Chip.js";
import type { Prompt, PromptGroup } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";
import { breakdownAttachments } from "./attachmentChipLogic.js";

interface Props {
  /** Direct prompts attached at this layer (board.prompts or column.prompts). */
  prompts: Prompt[];
  /** All known prompt groups — used to detect fully-covered sets. */
  allGroups: PromptGroup[];
  /** Prompt ids already implied by a higher signal (e.g. the active role).
   *  They are dropped from the visible set; group membership is still computed
   *  over the un-filtered direct prompts so the group chip shows even when
   *  the role coincidentally happens to provide some of its members. */
  hiddenPromptIds?: Set<string>;
  /** Test id for the outer wrapper. */
  testId?: string;
  /** Visual size of both chip kinds. Defaults to "sm" for kanban headers. */
  size?: "sm" | "md";
}

/**
 * Renders a direct-attachment chip row that collapses fully-covered groups
 * into a single group chip. Symmetric to PromptsMultiSelector's selection
 * row: if board/column's direct prompts contain every member of group G,
 * the user sees "G" as one chip and the members vanish. Partial coverage
 * leaves every member as an individual prompt chip.
 *
 * Returns null when there is nothing to show so callers can omit the
 * wrapper entirely.
 */
export function AttachmentChipRow({
  prompts,
  allGroups,
  hiddenPromptIds,
  testId,
  size = "sm",
}: Props) {
  const { fullyCoveredGroups, visiblePrompts } = useMemo(
    () => breakdownAttachments(prompts, allGroups, hiddenPromptIds),
    [prompts, allGroups, hiddenPromptIds]
  );

  if (fullyCoveredGroups.length === 0 && visiblePrompts.length === 0) return null;

  return (
    <div data-testid={testId} className="flex flex-wrap gap-1.5">
      {fullyCoveredGroups.map((g) => (
        <GroupChip key={g.id} group={g} size={size} />
      ))}
      {visiblePrompts.map((p) => (
        <Chip key={p.id} name={p.name} color={p.color} size={size} />
      ))}
    </div>
  );
}

function GroupChip({
  group,
  size,
}: {
  group: PromptGroup;
  size: "sm" | "md";
}) {
  const tint = group.color || "#7a746a";
  const sizeCls =
    size === "sm"
      ? "h-5 px-1.5 gap-1 text-[11px]"
      : "h-6 px-2 gap-1.5 text-[12px]";
  const count = (group.member_ids ?? []).length;
  return (
    <span
      title={`Group: ${group.name}`}
      data-testid={`group-chip-${group.id}`}
      className={cn(
        "inline-flex items-center rounded-full bg-[var(--hover-overlay)] text-[var(--color-text)]",
        "border tracking-tight shrink-0 whitespace-nowrap",
        sizeCls
      )}
      style={{ borderColor: `${tint}55` }}
    >
      <Folder size={size === "sm" ? 11 : 12} style={{ color: tint }} />
      <span className="truncate">{group.name}</span>
      <span className="text-[var(--color-text-subtle)] tabular-nums">·{count}</span>
    </span>
  );
}
