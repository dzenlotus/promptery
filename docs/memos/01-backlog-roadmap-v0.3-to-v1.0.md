# Backlog Roadmap: v0.3 → v1.0

**Issue:** Promptery #11
**Date:** 2026-04-27
**Author:** tech-analyst agent

---

## Problem

Promptery shipped v0.2.4 with a substantial feature surface: inheritance resolver, prompt groups, tags, token counts, per-task overrides, activity log, cross-board move, FTS search, export/import, backup/restore, and drag-and-drop. The backlog beyond that is unordered. Without a roadmap that names milestones, assigns tasks to them, and defines ship/cut criteria, development risks either stalling on polish or shipping incoherent feature clusters.

The git log from `v0.2.4..HEAD` (worktree `main`, 2026-04-27) shows the following already landed but not yet cut into a release tag:

- `feat: 0.3.0 — spaces, slugs, drag-and-drop sidebar, minimal MCP`
- `feat(bridge): role-filtered task listing via bridge registration (#2)`
- `feat(bundle): mandatory delegation-protocol injection when role is present (#46)`
- `feat(prompts): short description field + tooltip (#42)`
- `feat(prompts): auto-save draft on navigate-away`
- `feat(resolver): honour join-table position when sorting prompts in bundles`
- `feat(ui): open task description in view mode by default`
- `feat(prompts): create via modal dialog`
- `feat(ui): back button on prompt view`
- `feat(ui): undo/redo for destructive actions`
- `feat(kanban): drag-and-drop column reordering`
- `feat(tasks): activity log timeline`
- `feat(ui): expand prompt groups when picking prompts`
- `feat(tasks): cross-board move dialog`
- `feat(prompt-groups): remove prompt membership from inside group view`
- `feat(settings): one-click backup list + restore UI`
- `feat(ui): deterministic palette colors + picker`
- `refactor(theme): semantic CSS variables`
- `feat(export-import): cover spaces, slugs, groups, tags, prompt overrides`
- `feat(tasks): per-task prompt enable/disable overrides`
- `feat(tokens): show token counts`
- `feat(prompts): tags many-to-many with filtering`
- `feat(kanban): bulk-select tasks`
- `feat(kanban): assigned role chip on cards`
- `feat(migrations): wizard with auto-snapshot + rollback on failure`
- `docs: GitHub-ready README, CONTRIBUTING, issue templates, v0.3.0 release notes`

This is effectively the v0.3.0 content. It is already shippable as a release cut.

---

## Milestone Definitions

### v0.3 — Workspaces, Collaboration Foundation (release-ready now)

Everything in the log above is scoped to a single release. The defining new concepts are **spaces** (isolated prompt/role workspaces) and **slugs** (stable identifiers for import/export). Activity log and token counts make the tool legible for the first time.

**Tasks landing here:**
1. Spaces + slugs + export/import coherence (#export-import commit chain)
2. Token count display on all entity views (#6)
3. Per-task prompt enable/disable overrides (#7)
4. Tags many-to-many with filtering (#8)
5. Activity log timeline (#9)
6. Drag-and-drop sidebar + column reordering (#10)
7. Bulk-select tasks in a column (#11)
8. Migration wizard with auto-snapshot + rollback (#12)

**Acceptance criteria:**
- `npx @dzenlotus/promptery` version reports `0.3.0`.
- A user can create two spaces, export one, import into the other, and resolve conflicts via the UI.
- Token counts are visible on every prompt, role, and bundle view.
- Activity log shows create/update/move events per task with timestamps.
- Tags filter sidebar prompt list correctly.

**Ship/cut decision:** All eight tasks are already committed. Release cut is a changelog + npm publish action. No new code required.

---

### v0.4 — Collaboration and Multi-Agent Coherence

Scope: a second human (or a second AI client) can use Promptery alongside the first with no data collisions and with useful shared state. Bridge-level features, conflict-safe sharing, and role-aware lean bundles make multi-agent workflows viable.

**Tasks landing here:**
1. Lean bundles: role-aware slicing with `lean=true` on `get_task_bundle` (#18)
2. Workspace-level sharing: read-only bridge mode or scoped access tokens
3. Real-time conflict detection on simultaneous task edits (WS already exists; need optimistic lock)
4. `get_task_bundle` streaming support for large bundles (>32k tokens)
5. Bridge heartbeat and reconnect UI indicator
6. Per-space default role (currently only per-board)
7. Prompt versioning: soft-immutable snapshots so a bundle refers to a prompt at a known revision

**Acceptance criteria:**
- Two bridges registered simultaneously can each call `get_task_bundle` on the same task without race conditions or stale reads.
- With `lean=true`, a frontend-engineer role drops backend-architecture prompts; documented size reduction ≥20%.
- Bridge reconnect shows a status indicator in the UI within 2 seconds of loss.

**Ship/cut decision:** Ship lean bundles and conflict detection; cut prompt versioning to v0.5 if schema work slips. Per-space default role is a migration + API change — it gates the cut.

---

### v0.5 — Agent Reports, Observability, Activity Polish

Scope: agents produce structured reports back into Promptery; the UI surfaces what agents actually did. This milestone closes the loop between "context sent to agent" and "outcome recorded".

**Tasks landing here:**
1. Agent report submission: `submit_report(task_id, content, metadata)` MCP tool (#report-tool)
2. Report rendering in task dialog (markdown-rendered, versioned)
3. Activity log enhancement: link events to specific bundle versions
4. Token usage tracking over time: per-task, per-role, per-board sparklines
5. Search across reports + activity (extend FTS to reports table)
6. Webhook or event hook: fire on task status change (e.g. Slack/HTTP notification)
7. `diff_bundle(task_id, from_rev, to_rev)` to show what changed between two context snapshots

**Acceptance criteria:**
- An agent calls `submit_report` and the result appears in the task dialog within the same session.
- Activity log links each event to the bundle token count at that moment.
- FTS search returns report content alongside task titles.

**Ship/cut decision:** `submit_report` tool and report rendering are the gate; observability features (sparklines, diffs) can slip to v0.6. Webhook is cut if not spec'd by milestone freeze.

---

### v1.0 — Public Stable

This is the **v1.0 commitment milestone**. It does not introduce net-new features; it hardens everything shipped in v0.3–0.5 to production quality.

**Tasks landing here:**
1. 80%+ branch coverage across server routes, resolver, and CLI (see memo #06)
2. Playwright E2E suite covering: install → hub start → board create → task create → `get_task_bundle` via MCP
3. Migration system hardening: forward + backward migration tests for every schema version
4. Role split and prompt deduplication (see memos #13, #14) — library coherence is a v1.0 prerequisite
5. Public API stability declaration: mark `get_task_bundle` XML schema and `GET /api/tasks/:id/context` JSON shape as stable; semver-protect them
6. Performance: `get_task_bundle` p99 ≤ 50ms on a 1000-task database
7. Documentation: architecture doc, MCP tool reference, prompt-authoring guide

**Acceptance criteria:**
- Coverage gate enforced in CI; build fails below 80% branch.
- E2E suite passes on macOS and Linux.
- CHANGELOG marks public API surfaces as stable.
- No open P0/P1 bugs at release freeze.

**Ship/cut decision:** Do not cut test coverage or API stability declaration — these are the definition of v1.0. Cut advanced observability features (sparklines, diff viewer) to a v1.1 if needed.

---

## Open Questions

1. **Spaces vs workspaces naming.** The log uses "spaces"; the roadmap for v0.4 uses "workspace sharing." Are these the same concept or layered? Needs a definition decision before v0.4 scope is locked.
2. **Prompt versioning complexity.** Snapshot-based versioning requires either an append-only prompts table or a separate `prompt_versions` table. Schema choice affects every query in the resolver. Should this gate v0.4 or be deferred?
3. **Elastic License constraints.** If a hosted demo is ever offered, the license prohibits offering it as a managed service. Clarify whether a public read-only demo instance is acceptable under the license before v1.0 marketing.
4. **NPM package name stability.** `@dzenlotus/promptery` is tied to the author scope. If the project is ever transferred or an org account created, the package name breaks existing `npx install` workflows. Decide before v1.0.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| v0.3 release cut blocked by unresolved CI failures | Low | Medium | Cut is code-complete; validate CI pipeline before tagging |
| Lean bundles (v0.4) introduce resolver complexity that breaks existing override logic | Medium | High | Feature-flag behind `lean=true`; existing path unchanged |
| Prompt versioning schema (v0.4/0.5) requires a non-trivial migration that corrupts production DBs | Medium | High | Migration wizard (already shipped) + snapshot before migration |
| v1.0 test coverage goal (80%) requires significant test authoring on top of shipping features | High | Medium | Start coverage infrastructure in v0.4 cycle, not at v1.0 crunch |
| Single maintainer — any milestone can slip if development capacity narrows | High | High | Ship/cut criteria defined per milestone so scope can shrink without blocking release |
