import type { PromptGroup } from "../../lib/types.js";

/** Defensive accessor — older backend builds don't populate `member_ids` in
 *  list responses. Treating it as an empty array lets callers run without a
 *  runtime crash while the hub catches up. */
export function memberIds(g: PromptGroup): string[] {
  return g.member_ids ?? [];
}

/**
 * Compute the next selected-id list when the user clicks a group in the
 * picker. Toggle semantics — flatten on pick:
 *
 *  - If the group is fully covered (every member already selected), remove
 *    its members. Members shared with another fully-covered group stay so we
 *    don't silently tear down the other group's coverage.
 *  - Otherwise, append every missing member at the end while preserving the
 *    existing order. Already-selected members stay put.
 *
 * Selection lives as a flat list of prompt ids — the backend never sees the
 * group reference. Group membership changes after the fact won't propagate
 * to existing attachments. This is intentional: keeps the inheritance
 * resolver and the schema simple.
 */
export function toggleGroupSelection(
  group: PromptGroup,
  currentValue: string[],
  allGroups: PromptGroup[]
): string[] {
  const members = memberIds(group);
  if (members.length === 0) return currentValue;

  const selected = new Set(currentValue);
  const fullyCovered = members.every((id) => selected.has(id));

  if (fullyCovered) {
    const memberSet = new Set(members);
    const stillCoveredByOthers = new Set<string>();
    for (const other of allGroups) {
      if (other.id === group.id) continue;
      const otherMembers = memberIds(other);
      if (otherMembers.length === 0) continue;
      const otherFullyCovered = otherMembers.every((id) => selected.has(id));
      if (!otherFullyCovered) continue;
      for (const id of otherMembers) stillCoveredByOthers.add(id);
    }
    return currentValue.filter(
      (id) => !memberSet.has(id) || stillCoveredByOthers.has(id)
    );
  }

  const next = [...currentValue];
  for (const id of members) {
    if (!selected.has(id)) next.push(id);
  }
  return next;
}

/** A group is "fully covered" when every one of its members appears in the
 *  selected list AND the group has at least one member. Empty groups never
 *  count as covered — there's nothing to attach. */
export function isGroupFullyCovered(
  group: PromptGroup,
  selectedIds: Set<string> | string[]
): boolean {
  const members = memberIds(group);
  if (members.length === 0) return false;
  const set = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return members.every((id) => set.has(id));
}
