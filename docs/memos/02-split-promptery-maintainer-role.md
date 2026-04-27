# Split the `promptery-maintainer` Role

**Issue:** Promptery #13
**Date:** 2026-04-27
**Author:** tech-analyst agent

---

## Problem

The `promptery-maintainer` role bundles every concern of running the project: architectural decisions, release management, prompt library curation, user-facing documentation and marketing, and support triage. When an agent picks up this role, it receives a prompt bundle spanning all of these domains simultaneously. The result is:

1. **Token waste.** An agent working on a release commit does not need marketing-copy guidance or support-response templates. Every token spent on irrelevant prompts is a token not available for the actual task.
2. **Semantic blur.** An agent asked to "curate prompts" should be in librarian mode, not architect mode. A mixed bundle produces mixed outputs — architecture analysis embedded in curation notes, or vice versa.
3. **Maintenance difficulty.** When the library grows, every new prompt added to `promptery-maintainer` makes the problem worse for every use case simultaneously.
4. **Onboarding friction.** A new agent (or a human reading the role definition) cannot quickly determine what this role is *for*.

The goal is a split that produces roles with focused, ≤15-prompt bundles, where any given agent workflow picks exactly one role and gets exactly the context it needs.

---

## Current Role Bundle (Inferred)

Based on the CHANGELOG, README, and project scope, the current `promptery-maintainer` prompt set likely covers:

- Hub/bridge architecture overview
- Filesystem layout and data paths
- Process lifecycle (start/stop/backup)
- Inheritance resolver model
- MCP tool contracts
- Release checklist (npm publish, CHANGELOG, git tags)
- Prompt library curation guidelines
- Agent persona authoring conventions
- README/CONTRIBUTING/docs maintenance
- Issue triage and support response patterns

This is at least 10 distinct concern areas. A coherent single-role bundle tops out at 6-8 focused prompts.

---

## Options

### Option A: Keep the current bundle (status quo)

One role, all concerns. Every agent that touches the project gets everything.

### Option B: Split into three roles

`maintainer-architect` / `maintainer-release` / `maintainer-curator`

### Option C: Split into two roles

`maintainer-technical` (architecture + release) / `maintainer-content` (curation + docs + support)

### Option D: Split into four roles

`maintainer-architect` / `maintainer-release` / `maintainer-curator` / `maintainer-support`

---

## Trade-off Matrix

| Criterion | A (status quo) | B (3-way split) | C (2-way split) | D (4-way split) |
|---|---|---|---|---|
| Bundle size per task | Large (15-25 prompts) | Small (5-8 each) | Medium (8-12 each) | Minimal (3-6 each) |
| Agent focus | Low | High | Medium | High |
| Role-selection friction | None | Low | Low | Medium |
| Library maintenance overhead | Low | Medium | Low | High |
| Coverage of cross-cutting tasks (e.g. "refactor and release") | Full | Requires stacking two roles | Possible with one | Requires stacking |
| Suitable for solo maintainer workflow | Yes | Yes (context-switching is explicit) | Yes | Overhead may exceed benefit |
| Clarity of role purpose | Unclear | Clear | Moderate | Clear |
| Works with planned lean-bundle feature (#18) | Partially | Fully | Partially | Fully |

---

## Recommendation: Option B — Three Roles

**`maintainer-architect`** — Activated when designing or evolving system structure.

Prompt bundle (≤8 prompts):
- Hub/bridge architecture overview
- Inheritance resolver model and resolver invariants
- MCP tool contract stability rules
- Schema migration conventions
- Performance budget constraints
- API versioning policy

**`maintainer-release`** — Activated when preparing or executing a release.

Prompt bundle (≤6 prompts):
- Release checklist (CHANGELOG → npm publish → git tag)
- Semver policy for Promptery
- CI gate requirements (test coverage, lint)
- Package.json version bump conventions
- Communication template for release notes

**`maintainer-curator`** — Activated when managing the prompt library itself.

Prompt bundle (≤7 prompts):
- Prompt authoring conventions (tone, length, specificity norms)
- Agent persona design guidelines
- Deduplication policy (see memo #14)
- Tag taxonomy and naming rules
- Group structure guidelines
- Short description field usage
- Prompt retirement criteria

**Shared context** — Project-level prompts that all three roles inherit via the board or space:
- Filesystem layout and data paths
- Process lifecycle (start/stop)

These two prompts live at the board level and are not duplicated in any role bundle. When an agent activates any maintainer role, the board-level inheritance includes them automatically.

**Cross-cutting tasks** (e.g. "release a new feature that also changes the schema") use explicit role stacking: the agent starts with `maintainer-architect` for the design phase and switches the task's role to `maintainer-release` at the execution phase. This is already supported by the task-level role override mechanism.

---

## Acceptance Criteria

1. Each of the three roles exists in the prompt library as a first-class role entity with a clear markdown description.
2. Each role's prompt bundle contains ≤15 prompts (hard ceiling), with ≤8 as the target.
3. An agent assigned `maintainer-curator` does not receive architecture or release prompts unless they are board-level shared prompts.
4. An agent assigned `maintainer-architect` does not receive curation or release prompts.
5. The old `promptery-maintainer` role is retired or renamed to `maintainer-architect` if its prompt set is pruned to architecture-only content.
6. A human reading any single role description can explain what an agent in that role should be doing in one sentence.

---

## Open Questions

1. Should `maintainer-support` be a fourth role, or is triage/support rare enough that it can be a column-level override on a dedicated "Support" board?
2. Are there prompts in the current bundle that are genuinely cross-cutting and cannot be assigned to any single role? If so, they belong in the board-level shared set, not in any role.
3. Does the project actually have a `promptery-maintainer` role entity in the DB, or is this pattern currently implied by the CLAUDE.md instruction set? The answer determines whether this is a DB migration or a library creation task.

---

## Risks

| Risk | Mitigation |
|---|---|
| Three roles create confusion about which to pick for a given task | Write a decision tree in the curator role's description: "If designing architecture → architect. If publishing → release. If editing prompts → curator." |
| Shared board-level prompts drift out of sync across spaces | Pin shared prompts to a prompt group and attach the group at the board level; manage the group as a unit |
| Splitting increases total prompt count, worsening the scaling problem (#15) | The split produces smaller, more discoverable bundles; total prompt count is unchanged; navigation is solved by memo #04 |
