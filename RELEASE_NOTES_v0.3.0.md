# Release Notes — v0.3.0

This release is a significant expansion of Promptery's workspace organisation, task identity, and UI capabilities. It also includes numerous polish and reliability improvements across the board.

---

## Highlights

### Spaces

Tasks, boards, and slug sequences are now scoped to named **spaces**. Each space is an isolated container with its own boards and its own slug counter, so `WEB-42` and `MOBILE-42` can coexist without ambiguity. Spaces appear in the sidebar and can be created, renamed, and deleted from the UI. Export and import cover spaces and their slug state.

### Slug system

Every task gets a **slug** (`SPACE-N`, e.g. `WEB-1`, `BLOG-7`) that is assigned once and never changes. Slugs survive column moves, cross-board moves, and renames. Agents can reference tasks by slug in tool calls and in written reports, giving them stable identifiers that humans recognise too.

### Drag-and-drop sidebar and column reorder

The sidebar now supports drag-and-drop reordering of spaces and prompt groups. Kanban columns can be reordered by dragging their headers. Both operations persist to the database immediately.

### Cross-board task move with role/prompt resolution

The **Move task** dialog (and the `move_task` MCP tool) now supports moving a task to any column on any board, including boards in a different space. The dialog previews how the effective context (role, inherited prompts) will change after the move, so agents and users can make an informed decision before committing.

### Activity log

Each task has a new **Activity** tab that shows a chronological timeline of state changes — creation, status moves, role assignments, prompt additions and removals, and agent reports. Events are stored in a `task_events` table and synced live via WebSocket.

### Tags for prompts

Prompts can now be labelled with one or more **tags**. Tags are many-to-many and filterable in the prompt list. The export/import pipeline covers tags and their assignments.

### Token counts everywhere

Promptery uses [js-tiktoken](https://github.com/dqbd/tiktoken) to count tokens in prompt content, group aggregates, role bundles, and task bundles. Counts are shown inline throughout the UI so you can see at a glance how much context budget a role or task will consume.

### Per-task prompt overrides

Individual prompts inherited from a board, column, or role can now be **disabled on a specific task** without touching the source. The override is stored in a join table and is fully reflected in `get_task_bundle` XML output. Disabled prompts are visually dimmed in the task dialog.

### Group expansion in pickers

Prompt group pickers (on roles, boards, columns, and tasks) now expand inline when you click a group, showing its member prompts without leaving the picker. This eliminates the need to navigate to the group page just to confirm which prompts it contains.

### Bundle prompt ordering by position

Prompts in `get_task_bundle` XML are now sorted by their `position` value in the relevant join table (role→prompt, board→prompt, etc.), so the order you set in the UI is faithfully preserved in the context bundle delivered to agents.

### Undo / redo

Destructive actions in the UI (task deletion, column deletion, prompt removal) are reversible with `Cmd+Z` / `Cmd+Shift+Z`. The undo stack is per-session and clears on page reload.

---

## Improvements

- **Back button on prompt views** — navigating to a prompt from a group, role, or task context now shows a back button so you can return without losing your place.
- **View-mode default for tasks** — the task description opens in read-only view mode by default; click to switch to edit mode. Reduces accidental edits and makes the dialog faster to open.
- **Palette colors** — entities (spaces, boards, columns) now receive deterministic colors derived from their IDs, giving the UI visual variety without manual configuration. A palette picker lets you override the color.
- **Theme polish** — all hardcoded color values have been migrated to semantic CSS variables, making light/dark/system theme switching fully consistent across every surface.
- **Restore button in backup UI** — the one-click backup list in Settings → Data now includes a restore button per entry, so you no longer need the CLI to roll back to a previous backup.
- **Role chip on task cards** — the assigned (or inherited) role is shown as a chip directly on the kanban card and in the task dialog header.
- **Mandatory delegation-protocol injection** — when a task bundle includes a role, a delegation-protocol block is automatically injected into the XML so agents always receive consistent persona framing.
- **Role-filtered task listing via bridge registration** — bridges can register with a role ID; `list_tasks` then returns only tasks assigned that role, letting specialised agents focus on their own work queue.

---

## Fixes

- WebSocket now includes both old and new `boardId` on `task.moved` events so cross-board moves invalidate the correct UI caches.
- Per-task cache is invalidated on `task.updated`, fixing stale data showing in the task dialog after a background update.
- Hono HTTP exceptions now propagate their original status code instead of being masked as 500.
- Import correctly drops stale `tasks.number` column references and mints unique space prefixes for slugs.
- Sidebar groups expand/collapse state is persisted to localStorage and restored on reload.
- Prompt draft is auto-saved when navigating away from an unsaved new-prompt form.

---

## Commits in this release

```
597537f feat: 0.3.0 — spaces, slugs, drag-and-drop sidebar, minimal MCP
c706f57 feat(prompts): short description field + tooltip
9a805c5 feat(bridge): role-filtered task listing via bridge registration
abb9450 feat(bundle): mandatory delegation-protocol injection when role is present
755ea8a fix(sidebar): persist groups expand/collapse state to localStorage
ff80133 feat(prompts): auto-save draft on navigate-away from unsaved new-prompt form
d7e4f97 fix(ws): invalidate per-task cache on task.updated to fix card/dialog desync
46d8ff9 refactor(prompts): create via modal dialog, retire sidebar-draft pattern
6fc523d feat(resolver): honour join-table position when sorting prompts in bundles
6942871 feat(ui): open task description in view mode by default
81e8eaf fix(error-handler): propagate Hono HTTPException status instead of masking as 500
374e31a test: cover task route mutations and tasks.ts gaps
6a7383b fix(ws): include both old and new boardIds on task.moved for cross-board moves
362784a feat(ui): back button on prompt view when entered from group/role/task
832a4af feat(ui): undo/redo for destructive actions (Cmd+Z / Cmd+Shift+Z)
ebd9d50 feat(kanban): drag-and-drop column reordering
ea26f69 feat(ui): expand prompt groups when picking prompts for role/board/column/task
1b729ba feat(tasks): activity log timeline (task_events table + UI section)
85ee965 refactor(theme): migrate hardcoded colors to semantic CSS variables
307f3c7 feat(ui): deterministic palette colors for entities + palette picker component
4acf8b5 feat(settings): one-click backup list + restore UI
a136b58 feat(prompt-groups): remove prompt membership from inside group view
269e51b feat(tasks): cross-board move dialog with role/prompt resolution
ebab512 feat(export-import): cover spaces, slugs, groups, tags, prompt overrides
e316031 fix(import): drop tasks.number column refs and mint unique space prefix
af0734a feat(prompts): tags many-to-many with filtering
6da3faf feat(tasks): per-task prompt enable/disable overrides
b36d334 feat(tokens): show token counts on prompts/groups/roles/task bundles
d2b4abf chore: install js-tiktoken (token-count dependency)
839ad3c feat(kanban): show assigned role chip on task cards and dialog header
```

---

See [CHANGELOG.md](./CHANGELOG.md) for prior release history.
