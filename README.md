# Promptery

> Context orchestration for AI agents — a kanban board with MCP integration.

Build a library of reusable agent personas (roles + prompts) and apply them to tasks on a kanban board. Agents connect via the Model Context Protocol (MCP) and receive structured context for every task they work on.

## What's new in 0.2.0

- **Inheritance** — roles and prompts now work at board, column, and task levels with a clear priority ladder. A task's effective context unions six origins (direct / role / column / column-role / board / board-role) and deduplicates by specificity.
- **Prompt groups** — organise your prompt library into folders. Many-to-many: one prompt can live in multiple groups.
- **Settings** — data export/import, automatic daily backups, themes (light / dark / system), animated backgrounds.
- **Better CLI** — `start`, `stop`, `backup`, `restore` commands with a proper status view and startup banner.
- **Fixed** — installer now works on nvm/fnm/volta/asdf systems (prior versions couldn't connect from GUI apps that don't inherit shell PATH).

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

- **Prompts** — reusable instruction snippets like "always write comments in English" or "avoid `any` in TypeScript"
- **Prompt groups** — folders that organise related prompts. A prompt can belong to multiple groups simultaneously; it's never duplicated by group membership
- **Roles** — composable agent personas. A role has its own markdown description and a set of default prompts (e.g. "React Performance Specialist" with prompts for memoization and bundle analysis)
- **Boards** — project-level containers. A board can define a default role and default prompts that every task on it inherits
- **Columns** — workflow stages within a board. A column can override the board's role and add its own prompts — e.g. a "Review" column that switches every task to a "Code Reviewer" role automatically
- **Tasks** — work items. Inherit role and prompts from column and board unless overridden directly
- **Context bundle** — when an agent calls `get_task_bundle(id)`, Promptery resolves the full context (inherited role + the deduplicated prompt union from all six origins) and returns it as XML ready to paste into agent instructions

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

**Boards**: list, get, create, update, delete, **set_role**, **set_prompts**, **get_prompts**
**Columns**: list, create, update, delete, **set_role**, **set_prompts**, **get_prompts**
**Tasks**: list, get, **get_task_bundle**, **get_task_context**, create, update, move, delete, set_role, add_prompt, remove_prompt
**Roles**: list, get, create, update, delete, set_prompts
**Prompts**: list, get, create, update, delete
**Prompt groups**: list, get, create, update, delete, **set_group_prompts**, **add_prompt_to_group**, **remove_prompt_from_group**, **reorder_prompt_groups**
**UI**: get_ui_info, open_promptery_ui

## Managing your data

All data lives locally in `~/.promptery/db.sqlite`. No cloud, no telemetry.

### Automatic backups

On every hub startup, Promptery checks whether today's automatic backup exists. If not, it creates one via SQLite `VACUUM INTO` (safe even on a database that's in use). Auto-backups older than 30 days are pruned on the next start.

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
