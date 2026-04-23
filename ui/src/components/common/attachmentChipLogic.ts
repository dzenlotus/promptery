import type { Prompt, PromptGroup } from "../../lib/types.js";

export interface ChipBreakdown {
  /** Groups fully covered by the set of direct prompts — shown as a single chip. */
  fullyCoveredGroups: PromptGroup[];
  /** Direct prompts visible as individual chips (not hidden, not group-covered). */
  visiblePrompts: Prompt[];
}

/**
 * Given the direct prompts attached at a layer and the set of known groups,
 * decide which groups are fully covered (all members present) and which
 * individual prompt chips remain visible once groups and hidden prompts
 * are subtracted.
 *
 * - A group needs at least one member AND every member to appear in the
 *   direct prompts set to count as covered.
 * - `hiddenPromptIds` drops prompts that are already implied elsewhere
 *   (e.g. by the active role); group detection still runs over the raw
 *   direct set so the group chip shows even when the role coincidentally
 *   contains some of its members.
 */
export function breakdownAttachments(
  directPrompts: Prompt[],
  allGroups: PromptGroup[],
  hiddenPromptIds: Set<string> = new Set()
): ChipBreakdown {
  const directIds = new Set(directPrompts.map((p) => p.id));

  const fullyCoveredGroups = allGroups.filter((g) => {
    const members = g.member_ids ?? [];
    return members.length > 0 && members.every((id) => directIds.has(id));
  });

  const coveredIds = new Set<string>();
  for (const g of fullyCoveredGroups) {
    for (const id of g.member_ids ?? []) coveredIds.add(id);
  }

  const visiblePrompts = directPrompts.filter(
    (p) => !hiddenPromptIds.has(p.id) && !coveredIds.has(p.id)
  );

  return { fullyCoveredGroups, visiblePrompts };
}
