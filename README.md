# Promptery

> Context orchestration for AI agents — a kanban board with MCP integration.

Build a library of reusable agent personas (roles + prompts) and apply them to tasks on a kanban board. Agents connect via the Model Context Protocol (MCP) and receive structured context for every task they work on.

## What's new in 0.3.0

- **Spaces** — workspace organisation layer above boards. Each space carries a slug `prefix` (e.g. `pmt`) used to mint task slugs (`pmt-46`). Boards live inside spaces; one default space is system-managed and pinned at the bottom of the sidebar as plain "Boards".
- **Task slugs replace per-board numbers** — `task.number` is gone; every task carries a globally unique `slug` like `pmt-46` derived from its space's prefix. Slugs may change when a board moves between spaces (re-slugged automatically); the internal `id` is the stable identifier — agents are encouraged to persist ids, not slugs.
- **Drag-and-drop sidebar** — reorder spaces, reorder boards within a space, drag boards between spaces. Cross-space drops re-slug every task on the moved board to the destination prefix.
- **`/t/<id>` and `/b/<id>` URLs** — short URL scheme matching `/s/<id>` for spaces. The `/t/` route accepts either a slug or an internal id and resolves to the task's board.
- **Slug exact match in search** — `search_tasks("pmt-46")` returns the slug-carrying task as the top result with `match_type: "exact"`, regardless of FTS rank. Other hits carry `match_type: "fts"`.
- **Minimal MCP responses** — every MCP write tool now returns `{id, ...minimal_changed_fields}` (50–200 bytes); every read tool except `get_task_bundle` strips `description` / role content / full prompt content from the payload. Use `get_task_bundle` (XML for system prompt) or `get_prompt(id)` (full prompt content) when you actually need the heavy fields.
- **Pre-migration safety net** — destructive migrations (`009_spaces`, `010_board_position`) now snapshot the DB to `~/.promptery/backups/db-pre-<name>-<ts>.sqlite` before applying, alongside the existing daily auto-backup.

**Breaking changes from 0.2.x:**
- `tasks.number` is removed from the schema, the API, and MCP responses. Use `tasks.slug`.
- MCP read/write response shapes are minimal by default. Tools that previously returned full entities now return navigation data only — code that reaches into `description` / `role.prompts` etc. on MCP responses needs to call `get_task_bundle` or `get_prompt` instead.
- HTTP API responses are unchanged (UI depends on full shapes).
- Existing DBs migrate automatically: tasks get `pmt-N` slugs if their boards' names start with "Promptery", `task-N` otherwise.

See [CHANGELOG.md](./CHANGELOG.md) for the full list.

## Quick start

Install Promptery into all your AI clients at once:

```bash
npx -y @dzenlotus/promptery install
```

This auto-detects which AI clients you have installed and adds Promptery to each one. Then restart your clients.

## Install into a specific client

```bash
# Claude Desktop
npx -y @dzenlotus/promptery install-claude-desktop

# Claude Code
npx -y @dzenlotus/promptery install-claude-code

# Cursor (global — applies to all projects)
npx -y @dzenlotus/promptery install-cursor

# Cursor (current project only)
npx -y @dzenlotus/promptery install-cursor --scope project

# OpenAI Codex CLI
npx -y @dzenlotus/promptery install-codex

# Qwen Code
npx -y @dzenlotus/promptery install-qwen

# GigaCode
npx -y @dzenlotus/promptery install-gigacode
```

## Check installation status

```bash
npx -y @dzenlotus/promptery status
```

Shows which supported clients are detected and where Promptery is currently installed.

## Uninstall

```bash
# Remove from a specific client
npx -y @dzenlotus/promptery uninstall-claude-desktop
# ...also uninstall-claude-code, uninstall-cursor, uninstall-codex,
#        uninstall-qwen, uninstall-gigacode

# Remove from every detected client
npx -y @dzenlotus/promptery uninstall-all
```

## Run the UI standalone

```bash
npx -y @dzenlotus/promptery hub
```

Opens the kanban board at `http://localhost:4321` (or the next free port).

## How it works

Promptery has two processes that run together:

**Hub** — a long-running process that holds the SQLite database, HTTP API, WebSocket for live UI updates, and the web kanban UI. Started automatically when the first agent connects.

**Bridge** — a lightweight stdio MCP server that each AI client spawns. Multiple bridges talk to the same hub, so all your agents share the same board in real time.

You can open Claude Desktop, Cursor, and Codex simultaneously — all three agents see and modify the same board.

## Concepts

- **Spaces** — workspace organisation layer. Boards live inside spaces; each space has a `prefix` (1–10 lowercase letters/digits/hyphens) that becomes the slug prefix for tasks created on its boards. One default space is system-managed (prefix `task`) and shows up at the bottom of the sidebar as plain "Boards".
- **Prompts** — reusable instruction snippets like "always write comments in English" or "avoid `any` in TypeScript"
- **Prompt groups** — folders that organise related prompts. A prompt can belong to multiple groups simultaneously; it's never duplicated by group membership
- **Roles** — composable agent personas. A role has its own markdown description and a set of default prompts (e.g. "React Performance Specialist" with prompts for memoization and bundle analysis)
- **Boards** — project-level containers. A board can define a default role and default prompts that every task on it inherits. Boards belong to exactly one space.
- **Columns** — workflow stages within a board. A column can override the board's role and add its own prompts — e.g. a "Review" column that switches every task to a "Code Reviewer" role automatically
- **Tasks** — work items. Each task has a stable internal `id` and a human-friendly `slug` (`pmt-46`) derived from its board's space prefix. Slugs are mutable across `move_board_to_space`; ids are not.
- **Context bundle** — when an agent calls `get_task_bundle(id_or_slug)`, Promptery resolves the full context (inherited role + the deduplicated prompt union from all six origins) and returns it as XML ready to paste into agent instructions. Accepts both slugs and internal ids.

## Inheritance model

**Active role**: priority `task > column > board`. The most specific non-null role wins.

**Prompts**: union from six origins, deduplicated by `prompt_id` with specificity priority:

1. Direct on the task
2. The active role's prompts
3. Column direct prompts
4. Column role's prompts (if different from the active role)
5. Board direct prompts
6. Board role's prompts (if different from active and column roles)

When the same prompt arrives from multiple layers, only the most specific origin is kept. The `get_task_bundle` XML output keeps prompts grouped under `<role>` / `<task>` / `<inherited>` so the agent can tell "who I am" from "what I'm doing here" from "workspace-wide context".

## MCP tools exposed to agents

**Spaces** *(new in 0.3.0)*: list, get, create, update, delete, **move_board_to_space**
**Boards**: list, get, create *(takes optional `space_id`)*, update, delete, **set_role**, **set_prompts**, **get_prompts**
**Columns**: list, create, update, delete, **set_role**, **set_prompts**, **get_prompts**
**Tasks**: list, get, **get_task_bundle** *(accepts slug or id)*, **get_task_context**, create *(returns slug)*, update, move, delete, set_role, add_prompt, remove_prompt
**Roles**: list, get, create, update, delete, set_prompts
**Prompts**: list, get, create, update, delete
**Prompt groups**: list, get, create, update, delete, **set_group_prompts**, **add_prompt_to_group**, **remove_prompt_from_group**, **reorder_prompt_groups**
**UI**: get_ui_info, open_promptery_ui

### Response shapes (0.3.0)

All MCP write tools return a minimal confirmation envelope (`{id, ...changed}`, 50–200 bytes). All MCP read tools except `get_task_bundle` and `get_prompt` return navigation data only — no description, no full role/prompt content. The two heavy entry points by design:

- `get_task_bundle(id_or_slug)` — full agent context as XML, ready to paste into a system prompt.
- `get_prompt(id)` — single prompt's full content body.

The HTTP API at `/api/...` is unchanged from 0.2.x — UI clients still get full entities for optimistic updates. Only the MCP bridge layer projects to minimal shapes.

### Slug vs id

Tasks carry a `slug` (e.g. `pmt-46`) for human-readable conversation and an `id` (CUID) for stable references. Use `slug` when chatting about a task; use `id` for any reference you'll persist (storing a task pointer in another task's description, linking from a chat log, etc.). Slugs change when a board is moved between spaces; ids never do.

## Managing your data

All data lives locally in `~/.promptery/db.sqlite`. No cloud, no telemetry.

### Automatic backups

On every hub startup, Promptery checks whether today's automatic backup exists. If not, it creates one via SQLite `VACUUM INTO` (safe even on a database that's in use). Auto-backups older than 30 days are pruned on the next start.

Destructive schema migrations (currently `009_spaces` and `010_board_position`) take a separate snapshot to `~/.promptery/backups/db-pre-<name>-<ts>.sqlite` immediately before they apply, so an upgrade can always be rolled back via `promptery restore`.

### Manual backups via CLI

```bash
promptery backup                    # timestamped backup
promptery backup --name pre-refactor
promptery backups                   # list all backups
promptery restore db-auto-20260423-140000.sqlite
promptery backup-delete <filename>
```

Restore requires the hub to be stopped first (`promptery stop`). A safety backup of the current database is written to the backups directory before the restore overwrites it.

### Export / import

Use **Settings → Data** in the UI to export specific scopes (boards / roles / prompts / settings) as JSON, then import them on another machine. Conflicts can be resolved by skipping existing rows or importing them under `(imported)` suffixes.

## Supported AI clients

| Client           | Config format | Install command           |
| ---------------- | ------------- | ------------------------- |
| Claude Desktop   | JSON          | `install-claude-desktop`  |
| Claude Code      | JSON          | `install-claude-code`     |
| Cursor           | JSON          | `install-cursor`          |
| OpenAI Codex CLI | TOML          | `install-codex`           |
| Qwen Code        | JSON          | `install-qwen`            |
| GigaCode         | JSON          | `install-gigacode`        |

## Notes

**Codex and comments.** When the installer updates Codex's `~/.codex/config.toml`, comments will be stripped — this is a limitation of the underlying TOML library. Keep a backup if you rely on comments.

**Qwen / GigaCode settings.** The installer preserves all other keys in `settings.json`; only the `mcpServers` section is modified.

## Troubleshooting

If an agent doesn't see Promptery's tools after install:

1. Fully quit and restart the client (not just close the window).
2. Run `promptery status` to verify that the config was written.
3. Check the client's own MCP log files (path varies by client).
4. Try manual installation by opening the config file shown in `status` output.

### MCP server not connecting (nvm / fnm / volta / asdf users)

If your Node is managed via nvm, fnm, volta, or asdf and the MCP server
doesn't start in Claude Desktop / Claude Code, re-run the installer:

```bash
npx -y @dzenlotus/promptery@latest install-claude-code
```

GUI apps don't inherit shell PATH, so a bare `npx` can't be resolved. The
installer writes the absolute path to `npx` into the client config so the
host can spawn it directly. When you switch Node versions later, re-run
the install command to refresh the path.

### Hub management

```bash
promptery status      # where Promptery is installed, per client
promptery start       # foreground hub with banner (Ctrl+C to stop)
promptery stop        # SIGTERM with SIGKILL fallback
```

The hub auto-starts when any bridge needs it (e.g. when Claude Desktop
connects), so explicit `start` is only needed for dev or pre-warming.

### Port conflicts

By default Promptery tries port `4321` and falls back to the next free
port in range. Check `~/.promptery/hub.lock` or `promptery status` output
for the actual port in use.

## Status

Early-stage personal tool. Rough edges expected. Feedback welcome via GitHub issues.

## License

Promptery is licensed under the [Elastic License 2.0](./LICENSE).

In short:
- ✅ Use it for yourself or your team, free of charge
- ✅ Modify it, fork it, use it inside your company
- ✅ Self-host it for internal use
- ❌ Don't resell it as a hosted/managed service to third parties
- ❌ Don't remove copyright notices or circumvent license keys

For full terms see [LICENSE](./LICENSE).

Copyright © 2026 dzenlotus
