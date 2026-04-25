# Changelog

## 0.2.4 — 2026-04-25

### Added

- **Cross-board `move_task`.** The `move_task` MCP tool (and the underlying
  `POST /api/tasks/:id/move` endpoint) now accepts a target column on any
  board, not just the task's current board. Previously cross-board calls
  returned `400 column does not belong to this board`, which forced a
  destructive delete-and-recreate to reorganise tasks. Semantics are
  intentionally narrow: task-owned data (`role_id`, direct
  `task_prompts/skills/mcp_tools`) travels with the task; inherited
  context (board-level and column-level prompts/roles, plus
  role-via-board / role-via-column) does NOT — the resolver picks up the
  new location's context on the next read. The denormalised
  `tasks.board_id` is updated from the target column so per-board listings
  remain consistent. `position` is now optional on the `/move` route — if
  omitted, the task is appended to the end of the target column
  (`MAX(position) + 1`), matching `createTask`'s rule.
- `makePrompt` test factory in `src/db/__tests__/helpers/factories.ts`.

### Internal

- New `tasks-move.unit.test.ts` (queries-level, 8 tests) and
  `tasks-move.integration.test.ts` (HTTP, 5 tests) cover cross-board moves,
  role-id preservation (set vs NULL), direct-prompt preservation,
  append-to-end position, explicit-position pass-through, 404 on missing
  column or task, and same-board reorder regression.

## 0.2.3 — 2026-04-25

### Changed

- **`search_tasks` ranking** now weights title hits above description hits.
  Previously a query that matched once in either column ranked the same; with
  the spec-driven test suite added in this release we discovered that
  description-only matches could outrank title-only matches when the
  description column happened to be shorter (FTS5's bm25 length
  normalisation). The repo's `ORDER BY` was changed from default `rank` to
  `bm25(tasks_fts, 0.5, 5.0)` so a hit in the title reliably ranks above a
  hit in the body, while a hit in both still wins overall.
- **`searchTasks()` repository function** now caps `limit` at 500
  defensively. The HTTP layer already rejected larger limits with a 400 via
  the Zod schema; the cap also guards direct callers (other server code,
  bundle CLI) from accidentally requesting unbounded result sets.

### Fixed

- **Routing-order regression test**. `GET /api/tasks/search` is registered
  ahead of `GET /api/tasks/:id` and now has dedicated regression tests
  (status `200`, array body, query-string variant) so a future edit that
  reorders the registrations fails fast instead of silently 404-ing search
  requests as `task not found`.

### Internal — testing infrastructure

- New test infrastructure under `src/db/__tests__/helpers/`:
  - `testDb.ts` — fresh `:memory:` SQLite per test with full schema +
    migrations applied; `{ includeFTS: false }` constructs a pre-008
    snapshot used to verify the migration's backfill step.
  - `factories.ts` — `makeBoard / makeColumn / makeTask / makeRole /
    seedWorkspace` factories so test files compose realistic scenarios
    without re-implementing `INSERT` statements.
- Three-layer coverage for the search/list/get-task surface:
  - `tasks-search.unit.test.ts` — repository-level (38 tests): FTS sync
    triggers (insert / update title / update description / delete / batch /
    compound update / no-op update), query semantics (case sensitivity,
    multi-word AND, miss tokens), special chars (hyphens, quotes,
    apostrophes, Cyrillic, emoji, SQL-injection attempts), filters, limits,
    result shape, ordering, `getTaskWithLocation`.
  - `tasks-search.migration.test.ts` — backfill from a pre-FTS DB,
    idempotence on re-run, post-migration triggers fire on new inserts.
  - `tasks-search.integration.test.ts` — `app.fetch()` HTTP suite (16
    tests) with per-test in-memory DB swapped via `_setDbForTesting`;
    covers routing precedence, 400/404/200 paths, filter composition.
  - `tasks-search.perf.test.ts` — 1000-row search and listing budget
    under 100ms.
- Two small production seams added to support the above:
  - `runMigrations(db, { includeFTS?: boolean })` + `runFTSMigration(db)`.
  - `_setDbForTesting(db | null)` on the DB singleton (replaces the
    cached instance for `app.fetch()`-driven tests).
- Added `@vitest/coverage-v8` dev dependency. Run `npm test -- --coverage`
  to produce a v8 coverage report. The new repository code (`searchTasks`,
  `getTaskWithLocation`) lands at 100% line coverage / 93% branch coverage.

## 0.2.2 — 2026-04-25

### Added

- **`search_tasks` MCP tool** — full-text search across every task in the
  workspace, returning each hit with its column and board context in one
  call. Backed by a SQLite FTS5 virtual table (`tasks_fts`) kept in sync
  with the `tasks` table via insert / update / delete triggers; the
  `unicode61` tokenizer (with diacritics removal) handles Cyrillic and
  other non-ASCII text. FTS5 special characters in the query (`"`, `-`,
  `*`, `:`, `.`) are auto-escaped per token, so user input like
  `cmd-k "exact phrase"` or `не работает` runs without breaking the FTS
  grammar. Optional filters narrow by `board_id`, `column_id`, or
  `role_id`. Empty result returns `[]` rather than erroring.
- **`list_all_tasks` MCP tool** — cross-board task listing with the same
  location envelope, ordered by `created_at DESC`. Replaces the
  `list_boards → list_columns → list_tasks` walk that previously cost
  one tool call per column. Supports the same `board_id` / `column_id` /
  `role_id` filters and a `limit` (default 20, max 500).
- **`GET /api/tasks/search`** HTTP endpoint backing both tools, with Zod
  query-param validation and standard error envelope.
- **`GET /api/tasks/:id/with-location`** — lite get-task endpoint that
  returns the task plus its column and board, without the heavy
  `role / prompts / skills / mcp_tools` bundle.
- **Migration 008 (`tasks_fts`)** — declares the FTS virtual table and
  triggers, then backfills existing rows so upgrades from 0.2.1 land
  with a fully-populated index. Idempotent (`INSERT … WHERE id NOT IN`),
  re-runs are no-ops.

### Changed

- **`get_task` MCP tool** is now the lite variant — it returns the task
  with its column and board context but no longer hydrates the role /
  prompts / skills / mcp_tools relations. Use `get_task_bundle` (XML for
  agent prompts) or `get_task_context` (structured JSON) when you need
  the full execution bundle. This makes task inspection cheap by
  default; the heavy path stays available under explicit names.

## 0.2.1 — 2026-04-24

### Fixed

- **cmdk-based prompt/role pickers** no longer crash with `appendChild(null)`
  on the first keystroke. Each `Command.Item` now carries a stable `value={id}`
  with search text moved into `keywords`, and the flex-wrap item container is
  marked with `cmdk-group-items=""` so cmdk's search-reorder has a valid
  parent to reorder within. A root-level `<ErrorBoundary>` was added as a
  safety net so a future subtree crash can't take down the whole UI.
- **`get_task_bundle` XML** is now a well-formed document: wrapped in a single
  `<context>` root, every tag balanced, and role prompts no longer duplicate
  between `<role><prompts>` and `<inherited><board_role_prompts>` when the
  active role is inherited from the board. The resolver-side contract
  (direct > role > column > column-role > board > board-role) is unchanged.
- **`index.html` stale-cache on SPA routes**. A hub started before
  `npm run build` served a closure-cached HTML with dead asset-hash
  references; rebuilds would leave `/board/:id` (and every other
  client-side route) 404'ing on its own JS/CSS. `index.html` is now
  re-read from disk per fallback request.

### Added

- **Dev/prod hub isolation.** `PROMPTERY_PORT` env var locks the hub to an
  exact port (fails loud on EADDRINUSE, no silent fallback). Combined with
  `PROMPTERY_HOME_DIR`, a dev hub can run alongside a production one
  without sharing a DB. New `npm run dev` / `npm run dev:build` scripts
  spawn a dev hub on 4322 with data in `./.dev-home/`. A `[DEV]` badge and
  tab-title marker are surfaced via a new `GET /api/meta` endpoint whenever
  a non-default home directory is active. Banner now also prints the
  resolved home dir and DB path.
- **Polished scrollbars** via a Radix-backed `<ScrollArea/>` component,
  applied to the sidebar sections, kanban board (horizontal), kanban column
  (vertical), prompt editor, and prompt-group view. Native scroll stays
  under the hood — `@dnd-kit`'s auto-scroll keeps working — with a narrow
  3px thumb that grows to 10px on hover and auto-hides after 900ms.
- **`scripts/seed-dev.mjs`** — one-shot dev-hub seeder that creates 40
  prompts, 12 roles, 3 boards and 40 tasks. Refuses to run unless the
  target hub reports `devMode: true` to prevent accidental writes to a
  production database.

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
