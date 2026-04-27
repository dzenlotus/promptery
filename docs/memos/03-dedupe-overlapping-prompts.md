# Deduplication of Overlapping Prompts

**Issue:** Promptery #14
**Date:** 2026-04-27
**Author:** tech-analyst agent

---

## Problem

As a prompt library grows organically, related topics accumulate in multiple prompts that partially cover the same ground. In Promptery's own self-referential library (prompts that describe the project for agents working on it), the following clusters are known to overlap:

- `hub-bridge-architecture` describes the two-process model; `promptery-process-lifecycle` describes start/stop/port behavior of those same two processes.
- `filesystem-layout` names `~/.promptery/db.sqlite` and the backups directory; `promptery-process-lifecycle` re-states the same paths in the context of startup.
- `inheritance-resolver` explains the six-origin model; `get-task-bundle-contract` explains the XML output of the same model — both require understanding the resolver to be useful.
- `mcp-tool-contracts` enumerates tools; any role-description prompt that lists "your available tools are…" duplicates this enumeration.
- `agent-persona-design` and `prompt-authoring-conventions` both contain guidance on writing clear, specific instructions — the former for roles, the latter for prompts, but the meta-advice is nearly identical.

The consequence: when an agent receives a bundle, it reads conflicting or redundant context, increasing token usage and the chance of contradictory instructions. The resolver's union semantics do not deduplicate *content* — only prompt *identity*.

---

## Methodology for Overlap Inventory

Without direct DB access, the following methodology applies this analysis to any prompt library:

1. **Cluster by topic noun.** Group prompts by their primary subject (process lifecycle, filesystem paths, inheritance model, MCP tools, authoring style). Two prompts in the same cluster are overlap candidates.
2. **Check for path re-statement.** Any prompt that names a filesystem path or port number that another prompt also names is a duplication risk.
3. **Check for model re-explanation.** Any prompt that explains *how* a system works when another prompt already defines that system is redundant unless it adds a distinct perspective (e.g. "what the output looks like" vs "how it is computed").
4. **Check for role-sensitive content mixed with universal content.** If a prompt contains both "always do X" (universal) and "when you are a release manager, do Y" (role-specific), it should be split: the universal part becomes a board-level shared prompt; the role-specific part moves into the role bundle.

---

## Overlap Inventory

| Prompt Name | Overlapping With | Overlap Type |
|---|---|---|
| `hub-bridge-architecture` | `promptery-process-lifecycle` | Structural description vs behavioral description of the same two processes |
| `filesystem-layout` | `promptery-process-lifecycle` | Both state `~/.promptery/` paths |
| `filesystem-layout` | `hub-bridge-architecture` | Both describe `hub.lock` and port resolution |
| `inheritance-resolver` | `get-task-bundle-contract` | Model definition vs output contract of the same model |
| `mcp-tool-contracts` | Role description prompts | Tool lists appear in both places |
| `agent-persona-design` | `prompt-authoring-conventions` | Meta-authoring guidance is substantively similar |
| `promptery-process-lifecycle` | `hub-bridge-architecture` | Process start/stop is a subset of architecture |

---

## Dedupe Strategy Options

### Option A: Tags only
Label overlapping prompts with a shared tag (e.g. `#architecture`) and rely on curators to notice duplication. No structural change.

### Option B: Factor common variables into `project-env`
Create a single canonical `project-env` prompt that holds all environment facts (paths, ports, process names). All other prompts reference these facts by name but do not re-state them.

### Option C: Introduce a `stack-reference` prompt
One comprehensive prompt covering the full stack: process model, filesystem layout, inheritance model, MCP surface. Replaces the cluster of overlapping prompts. Role bundles include this as a foundation.

### Option D: Merge overlapping pairs individually
Case-by-case merges: `hub-bridge-architecture` absorbs `promptery-process-lifecycle`; `inheritance-resolver` absorbs `get-task-bundle-contract`; `agent-persona-design` absorbs `prompt-authoring-conventions`.

---

## Trade-off Matrix

| Criterion | A (tags) | B (project-env) | C (stack-reference) | D (pair merges) |
|---|---|---|---|---|
| Reduces token duplication | No | Partial | Yes | Yes |
| Preserves prompt specificity | Yes | Yes | No (coarse) | Yes |
| Requires DB schema change | No | No | No | No |
| Maintenance surface after change | High (duplicates persist) | Medium | Low | Medium |
| Risk of losing important nuance | Low | Low | Medium | Low |
| Actionable without DB access | Yes | Yes | Yes | Yes |

---

## Recommendation: Option D — Targeted Pair Merges

Option D eliminates the confirmed overlaps without creating an overloaded omnibus prompt. The merges are:

1. **Merge `promptery-process-lifecycle` into `hub-bridge-architecture`.** The lifecycle (start, stop, port fallback, `hub.lock`) is a behavioral section of the same architectural document. The merged prompt gains a "Runtime Behavior" section. `promptery-process-lifecycle` is retired.

2. **Extract `filesystem-layout` facts into a short `project-env` stub** (paths, default port, config filenames only — no narrative). Then retire the standalone `filesystem-layout` prompt and replace its references with `project-env`. This is Option B applied narrowly, not globally.

3. **Merge `get-task-bundle-contract` into `inheritance-resolver`.** The resolver defines the model; the bundle contract defines the output. These are one document. The merged prompt gains an "Output Format" section. `get-task-bundle-contract` is retired.

4. **Merge `agent-persona-design` into `prompt-authoring-conventions`.** Both are curator-mode guidance. The merged prompt becomes `authoring-guide` with sections for prompts and for roles. Both source prompts are retired.

5. **Audit role-description prompts for embedded tool lists.** Any role prompt that names specific MCP tools should instead reference `mcp-tool-contracts` by name only. The actual enumeration stays in one place.

---

## Prompt Action Table

| Prompt | Action | Target / Note |
|---|---|---|
| `hub-bridge-architecture` | Keep + extend | Add "Runtime Behavior" section from process-lifecycle |
| `promptery-process-lifecycle` | Retire | Content absorbed into `hub-bridge-architecture` |
| `filesystem-layout` | Retire | Path facts move to new `project-env` |
| `project-env` | Create | New canonical facts prompt: paths, port, config file locations |
| `inheritance-resolver` | Keep + extend | Add "Output Format" section from bundle-contract |
| `get-task-bundle-contract` | Retire | Content absorbed into `inheritance-resolver` |
| `mcp-tool-contracts` | Keep | Authoritative tool enumeration; role prompts must not duplicate it |
| `agent-persona-design` | Retire | Content absorbed into merged `authoring-guide` |
| `prompt-authoring-conventions` | Rename + extend | Becomes `authoring-guide`; absorbs persona-design content |

Net change: 9 current prompts → 5 prompts. Four retirements, one creation, three extensions.

---

## Acceptance Criteria

1. No two active prompts state the same filesystem path.
2. No role bundle includes a tool enumeration that also appears in `mcp-tool-contracts`.
3. The `inheritance-resolver` prompt alone is sufficient to understand both the six-origin model and the `get_task_bundle` XML output.
4. `project-env` is a ≤10-line prompt containing only facts, no narrative.
5. `authoring-guide` covers both prompt and role authoring without repeating meta-advice.
6. All retired prompts are tagged `retired` (or deleted if no bundles reference them) before the next library audit.

---

## Open Questions

1. Are there prompt names in the actual DB that differ from the inferred names above? The inventory should be rerun against real DB data before executing merges.
2. Do any existing task bundles in production reference the prompts being retired by ID? If so, the per-task override records must be updated before retirement.
3. Should retired prompts be hard-deleted or soft-archived (e.g. a `retired` tag + removal from all bundles)? Soft archival preserves history; hard deletion keeps the library clean. Recommend soft archival for v1.0, hard deletion in a future major version.

---

## Risks

| Risk | Mitigation |
|---|---|
| Merging prompts produces a prompt that exceeds a useful reading length | Set a 500-token ceiling per merged prompt; if the merge exceeds it, keep them separate |
| Retiring a prompt breaks an existing agent workflow that depends on it by ID | Audit `task_prompts`, `role_prompts`, `board_prompts`, `column_prompts` join tables before retiring |
| New `project-env` prompt becomes a dumping ground over time | Enforce a "facts only, no narrative" rule; reject PRs that add sentences to it |
