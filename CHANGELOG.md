# Changelog

## 0.2.0 — 2026-04-23

### Added

**Settings**
- New Settings section in the sidebar with Data and Appearance subsections.
- Database-backed settings store, live-synced across tabs via WebSocket.

**Data management**
- Export boards, roles, prompts, and optionally settings as JSON. Format v1.0.
- Import with preview + conflict resolution (skip or rename). Atomic
  transaction; partial failures roll back.
- Automatic daily backups on hub startup via SQLite `VACUUM INTO` (safe on a
  live database). 30-day retention by default.
- Manual backups via `promptery backup` / `promptery backups` /
  `promptery restore <filename>` CLI commands.
- Full backup management UI under Settings → Data.
- Path-traversal guard on backup filenames.

**Appearance**
- Light, Dark, and System themes (auto-follows OS preference).
- Three background types: solid colour, gradient, animated.
- Five solid presets (default / slate / warm / cool / sand) and five muted
  gradient presets (dusk / sage / dune / mist / ember) with dark variants.
- Three canvas animations (Aurora, Lava lamp, Particles) in a calm dusk
  palette. Shared animation contract, DPR-capped rendering, pauses on hidden
  tab, respects `prefers-reduced-motion`, reflows via ResizeObserver.
- Adjustable brightness, contrast, blur (animated only), speed, tint colour.
- Slider commits only on pointer release so drags don't flood the network.

**Inheritance for roles and prompts**
- Roles can be set at task, column, or board level.
- Active role priority: `task > column > board` — first set wins.
- Prompts union from six origins per task: direct, role, column,
  column-role, board, board-role. Deduplicated by specificity: the most
  specific origin wins for any given prompt.
- Resolver exposed at `GET /api/tasks/:id/context` (JSON) and via the
  existing `get_task_bundle` XML endpoint (now includes `<inherited>` section).
- Task dialog shows an "Effective context" view with per-prompt origin
  badges and the active role's source layer.
- Board header and column header show active role + direct prompts as chips.
- Edit dialogs for board and column let you assign role and prompts in one
  place; board create form also accepts role + prompts up front.

**Prompt groups**
- Many-to-many organisational layer for prompts. One prompt can live in
  multiple groups simultaneously; prompts are never duplicated by membership.
- Groups section at the top of the Prompts sidebar, with create / edit /
  delete context menus.
- Group detail page at `/prompts/groups/:id` listing members.
- Deleting a group removes only the memberships; the prompts remain in the
  global list. Deleting a prompt cascades out of every group it was in.
- New MCP tools: `list_prompt_groups`, `get_prompt_group`,
  `create_prompt_group`, `update_prompt_group`, `delete_prompt_group`,
  `set_group_prompts`, `add_prompt_to_group`, `remove_prompt_from_group`,
  `reorder_prompt_groups`.

**Kanban UX**
- `+` affordance right of the last column to create a new one.
- `⋯` menu in each column header with Rename, Edit (role + prompts), Delete.
- Board header gains a `⋯` menu with Edit (role + prompts) and Delete.
- Column header shows role chip and direct prompt chips inline.
- Sidebar, task cards, dialogs and overlays now use translucent glass
  surfaces so the animated background is visible through the UI.

**Prompt drag & drop**
- Drag a prompt from the sidebar directly onto a Prompt Group page to
  attach it. Reorder members inside a group by dragging within the page.
- Drag preview renders via a portal-level `DragOverlay` clone, so the
  floating chip is never clipped by the sidebar's overflow and keeps its
  natural proportions while moving.

**Effective context panel**
- Task dialog shows three stacked cards — Board / Column / Task — with
  per-section sub-labels (ROLE, PROMPTS) and ✓ / ✗ markers. Updates live
  as you stage changes (switching the task role, adding or removing
  direct prompts) with no save round-trip.
- Role shadowing is id-aware: pointing multiple layers at the *same*
  role id no longer reads as "overridden", it correctly shows both rows
  as active. A weaker layer is only struck through when its role id
  actually differs from the effective one.
- Prompt rows always show as applied on every layer that lists them —
  matching the backend's union semantics, so "this prompt comes from
  board *and* task" reads as two green rows, not one green and one red.

**Attachment chip row**
- Board and column headers collapse a fully-covered prompt group into a
  single group chip (with folder icon and member count) instead of
  spamming one chip per member. Behaves identically in the task dialog,
  column-edit dialog, and role editor's prompt picker.
- Role editor's prompt picker now surfaces Groups as a first-class section
  alongside individual prompts.

**Editor polish**
- Markdown textarea auto-grows with content; the surrounding pane owns
  scrolling, so the editor never has its own internal scrollbar.
- Editor footers (Role editor, Prompt editor) rebuilt as inset rounded-pill
  containers with a translucent `hover-overlay` background, matching the
  rest of the glass UI language.
- Prompt selection is deep-linkable: `/prompts/:id?` and
  `/prompts/groups/:id` share a single route host, so switching between
  prompts or between a prompt and a group no longer remounts the view.

**MCP tools — new in 0.2.0**
- `set_board_role`, `set_board_prompts`, `get_board_prompts`
- `set_column_role`, `set_column_prompts`, `get_column_prompts`
- `get_task_context` (structured JSON counterpart to `get_task_bundle`)
- All prompt-group tools listed above.

**CLI**
- `promptery start` runs the hub in the foreground with a styled banner.
- `promptery stop` sends SIGTERM with SIGKILL fallback.
- `promptery status` reports installation status across all supported clients.
- `promptery backup`, `promptery backups`, `promptery restore`,
  `promptery backup-delete`.

### Changed
- Deleting a column that still contains tasks is blocked with a 409 carrying
  a machine-readable `error: "ColumnNotEmpty"` code. Move or delete tasks
  first. The MCP `delete_column` tool surfaces guidance to the agent.
- `GET /api/boards/:id` now returns `BoardWithRelations` (role + direct
  prompts included). Plain list endpoint still returns the lean `Board` shape.
- `GET /api/columns/:id` now returns `ColumnWithRelations` for the same reason.

### Fixed
- Installers now write the absolute path to `npx` in client configs. Fixes
  MCP connection failures for nvm / fnm / volta / asdf users — GUI apps
  like Claude Desktop and Claude Code don't inherit shell PATH and can't
  resolve `npx` by short name.
- Install commands now warn when a Node version manager is detected so the
  user knows to re-run after switching Node versions.
- Popovers and dropdowns no longer disappear behind the canvas — removed a
  redundant z-index layer that was shadowing Radix portals.
- Prompt and Role editors no longer crash when opened. A defensive
  accessor for the (sometimes missing) `member_ids` array was rewritten
  as a direct property read — the earlier self-referential helper blew
  the stack once any picker mounted.
- Fully-covered prompt groups now collapse into a single group chip in
  every surface (board header, column header, task dialog), not just in
  the multi-select popover.
- Effective context panel no longer marks the same prompt as shadowed at
  multiple layers — prompts are unioned, not shadowed, at the backend, so
  they should read as applied wherever they appear.
- Drag-preview thumbnails keep their original size and shape while being
  dragged — switched from in-place `transform` (which got clipped by the
  sidebar's `overflow: hidden`) to a portal-rendered `DragOverlay`.

## 0.1.1 — 2026-04-23

### Fixed
- Installers now write the absolute path to `npx` in client configs. This
  fixes MCP connection failures on systems where Node is installed via a
  version manager (nvm, fnm, volta, asdf) — GUI apps like Claude Desktop
  and Claude Code don't inherit shell PATH and can't resolve `npx` by
  short name.
- Install commands now warn when a version manager is detected so users
  know to re-run the installer after switching Node versions.

### Added
- UI for creating, renaming, and deleting columns — `+` button after the
  last column, and a `⋯` menu in each column header with Rename / Delete
  actions.
- Backend validation: deleting a column that still contains tasks is
  blocked with a clear 409 error. The MCP `delete_column` tool surfaces
  the same guidance to the agent so it can empty the column first.

## 0.1.0 — 2026-04-23

### Added
- Initial public release.
- MCP hub+bridge architecture supporting concurrent agents.
- Installers for Claude Desktop, Claude Code, Cursor, Codex, Qwen Code,
  GigaCode.
- Kanban UI with boards, tasks, roles, prompts.
