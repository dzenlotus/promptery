# Lean Bundles: Role-Aware Slicing

**Issue:** Promptery #18
**Date:** 2026-04-27
**Author:** tech-analyst agent

---

## Problem

The `get_task_bundle` MCP tool returns a full context bundle: the task's effective role, all prompts from the six-origin inheritance chain, and the mandatory delegation-protocol injection. For a task on a board with 8 board-level prompts, a column with 3 column-level prompts, a role with 10 prompts, and 2 direct task prompts, the bundle easily reaches 2,000-4,000 tokens before any task description is included.

Many of those prompts are not applicable to the active role. A `frontend-engineer` role working on a UI task does not benefit from backend database-schema prompts that were attached to the board for the convenience of backend engineers. A `tech-analyst` role does not benefit from coding style prompts. Yet the resolver's union semantics include them all.

The problem is not the resolver's correctness — it is the absence of a signal to the resolver that says "include only what this role actually uses."

The per-task prompt override feature (shipped in v0.3) solves this at task-creation time, but requires the user to manually disable prompts per task. This is a friction-heavy workaround for a systematic problem.

---

## Proposed Mechanism

### Prompt Metadata: `applies_to_roles`

Add an optional field `applies_to_roles: string[]` to the prompts table. This is a JSON array of role slugs. An empty array or null means "applies to all roles" (current behavior, backward-compatible).

```
prompts table: add column applies_to_roles TEXT DEFAULT NULL
```

A prompt tagged `["backend-engineer", "db-administrator"]` will be excluded from the bundle when the active role is `frontend-engineer`. A prompt tagged `[]` or `NULL` is always included (universal prompt).

### `lean=true` Flag on `get_task_bundle`

The MCP tool gains an optional boolean parameter `lean` (default: `false`). When `lean=true`:

1. The resolver computes the full union of prompts (existing behavior, unchanged).
2. For each prompt in the union, if `applies_to_roles` is non-null and non-empty, check whether the active role's slug appears in the array.
3. If the active role slug is absent, exclude that prompt from the output.
4. All prompts with `applies_to_roles = null` or `applies_to_roles = []` are always included regardless of `lean`.

When `lean=false` (default), behavior is identical to the current resolver — `applies_to_roles` is ignored, all prompts are included. No existing workflows break.

### Role Slug Requirement

This mechanism depends on roles having stable slugs. Slugs were introduced in v0.3 (commit: `feat: 0.3.0 — spaces, slugs`). Confirmed: roles have slugs. The `applies_to_roles` array references role slugs, not role IDs, for portability across import/export.

---

## Options Compared

### Option A: `applies_to_roles` + `lean=true` (this proposal)

Described above. Opt-in, backward-compatible.

### Option B: Per-task prompt override (already shipped)

The user disables individual prompts on specific tasks. Already in v0.3. Solves the problem at task granularity but requires manual action per task.

### Option C: Role-scoped boards

Create separate boards for each role. Board-level prompts on the "frontend" board never include backend prompts. Solves the problem through partitioning, not filtering.

### Option D: Prompt groups as bundle layers

Attach a prompt group to a role. The resolver already includes role prompts. A group attached to the role only includes prompts from that group. This is close to the current behavior — it depends on the curator having already built coherent per-role groups.

---

## Trade-off Matrix

| Criterion | A (lean bundles) | B (per-task override) | C (role-scoped boards) | D (role-attached groups) |
|---|---|---|---|---|
| Automatic once configured | Yes | No (per-task manual) | Yes | Yes |
| Requires curation effort | Yes (tag prompts) | Yes (per task) | Yes (maintain boards) | Yes (maintain groups) |
| Backward-compatible | Yes | Yes (already shipped) | No (restructuring required) | Yes |
| Solves systematic cross-role pollution | Yes | No (symptomatic) | Yes | Partial |
| Works for single-maintainer at current scale | Yes | Yes (adequate for <30 prompts) | Overkill | Yes |
| Scales to 100+ prompts | Yes | No (too many manual overrides) | Partial | Partial |
| Implementation complexity | Medium | 0 (done) | 0 (user-level) | 0 (user-level) |
| DB schema change required | Yes (one column) | No | No | No |
| Resolver changes required | Yes (lean filter pass) | No | No | No |

---

## Recommendation

Ship Option A as a complement to Option B. Option B (per-task overrides) remains the right tool for one-off exceptions. Option A (lean bundles) becomes the right tool for systematic role-based filtering at scale.

Do not ship Option A in isolation — the mechanism is only valuable if curators actually tag prompts with `applies_to_roles`. The rollout plan must include:

1. A bulk-tagging UI in Settings → Prompts (or the prompt editor itself) where the maintainer can select 1-N prompts and assign role applicability.
2. Default behavior for untagged prompts is "applies to all" — no disruption on upgrade.
3. The `get_task_bundle` tool description updated to document the `lean` parameter and its semantics.
4. A dry-run mode: `lean=true&dry_run=true` returns the same bundle plus a `excluded_prompts` list showing what was filtered and why, without truncating the output. This lets agents verify configuration before committing to lean mode.

---

## Bundle Size Comparison (Illustrative)

Assumptions: board has 8 prompts (3 backend-specific, 5 universal), column has 2 prompts (1 backend-specific, 1 universal), active role `frontend-engineer` has 6 prompts (all universal), task has 1 direct prompt.

| Mode | Prompt count | Est. tokens |
|---|---|---|
| `lean=false` (current) | 18 (8+2+6+1+delegation) | ~3,600 |
| `lean=true` (4 backend prompts excluded) | 14 | ~2,800 |
| Reduction | 4 prompts | ~22% |

In a larger library (50+ prompts at board level), the reduction scales proportionally. A well-curated library with clearly scoped role tags can achieve 30-50% bundle reduction.

---

## Acceptance Criteria

1. `prompts` table has a `applies_to_roles` column (TEXT, nullable, default null) after migration.
2. `get_task_bundle` accepts an optional `lean: boolean` parameter (default false).
3. With `lean=false`, output is byte-for-byte identical to current behavior.
4. With `lean=true` and active role `frontend-engineer`, prompts tagged `applies_to_roles: ["backend-engineer"]` are absent from the output.
5. With `lean=true`, prompts with `applies_to_roles = null` or `[]` are always present.
6. The dry-run mode returns an `excluded_prompts` array in the XML output.
7. Bundle sizes for the same task with `lean=false` vs `lean=true` are documented in the test that covers this feature (exact token counts, using js-tiktoken which is already installed).

---

## Open Questions

1. Should `applies_to_roles` use role slugs (portable, human-readable) or role IDs (stable regardless of renames)? Slugs are more legible for curators; IDs are safer if a role is renamed. A slug-indexed approach should handle rename gracefully via a slug redirect or re-tagging prompt.
2. Should the lean filter apply to delegation-protocol injection? The delegation protocol is mandatory (enforced in the resolver as of the #46 commit). It should be immune to lean filtering.
3. Is there a use case for `lean` at the board or column level (i.e., "this board always requests lean bundles")? That would be a board/column-level setting rather than a per-tool-call parameter.

---

## Risks

| Risk | Mitigation |
|---|---|
| Curators forget to tag prompts; lean mode silently includes everything | Dry-run mode reveals untagged prompts; a UI warning can flag prompts with no `applies_to_roles` |
| Role slug rename breaks `applies_to_roles` references | Treat role slug changes as a breaking change; propagate updates to prompt metadata |
| Lean mode unexpectedly removes a prompt the agent needed | The per-task override (Option B) remains available to re-include a specific prompt regardless of lean filtering |
