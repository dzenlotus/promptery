# Promptery

> MCP-native kanban for orchestrating AI coding agents.

[![npm version](https://img.shields.io/npm/v/@dzenlotus/promptery)](https://www.npmjs.com/package/@dzenlotus/promptery)
[![license](https://img.shields.io/badge/license-Elastic--2.0-blue)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Promptery is a local-first tool that gives AI coding agents structured context via the [Model Context Protocol](https://modelcontextprotocol.io). Build a library of reusable roles and prompts, organise work on a kanban board, and let every connected agent — Claude Desktop, Cursor, Codex, and others — read and update the same board in real time. All data stays on your machine in a SQLite file; no cloud, no telemetry.

---

## Screenshots

| Kanban board | Task dialog |
|---|---|
| ![Kanban board](docs/screenshots/kanban.png) | ![Task dialog](docs/screenshots/task-dialog.png) |

> See [`docs/screenshots/README.md`](docs/screenshots/README.md) for the full list of screenshot placeholders.

---

## Quick start

### 1. Start the server

```bash
npx @dzenlotus/promptery server
```

Opens the kanban UI at `http://localhost:4321`.

### 2. Connect your AI client

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "promptery": {
      "command": "npx",
      "args": ["-y", "@dzenlotus/promptery", "bridge"]
    }
  }
}
```

**Cursor** — add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "promptery": {
      "command": "npx",
      "args": ["-y", "@dzenlotus/promptery", "bridge"]
    }
  }
}
```

Or use the one-shot auto-installer:

```bash
npx -y @dzenlotus/promptery install
```

This detects which AI clients are installed and configures each one. Restart your clients afterwards.

### Install into a specific client

```bash
npx -y @dzenlotus/promptery install-claude-desktop
npx -y @dzenlotus/promptery install-claude-code
npx -y @dzenlotus/promptery install-cursor [--scope project]
npx -y @dzenlotus/promptery install-codex
npx -y @dzenlotus/promptery install-qwen
npx -y @dzenlotus/promptery install-gigacode
```

### Check installation status

```bash
npx -y @dzenlotus/promptery status
```

---

## Feature highlights

- **Spaces** — isolate projects into separate workspaces with independent boards and slug namespaces.
- **Kanban** — boards, drag-and-drop columns, tasks with slugs (e.g. `WEB-42`) for stable cross-space references.
- **Inheritance resolver** — roles and prompts cascade through board → column → task with a six-origin deduplication ladder. The most specific origin always wins.
- **Prompt groups** — organise your prompt library into folders. Many-to-many: one prompt can live in multiple groups.
- **Tags** — apply filterable tags to prompts.
- **Task slugs** — human-readable IDs (`SPACE-N`) that survive moves and are stable across agent sessions.
- **Search** — full-text search across all tasks via SQLite FTS5, with ranking that weights title hits above body hits.
- **Undo / redo** — `Cmd+Z` / `Cmd+Shift+Z` for destructive UI actions.
- **Token counts** — tiktoken-based counts shown on prompts, groups, roles, and task bundles.
- **Attachments** — prompt groups collapse into a single chip when fully covered, keeping headers readable.
- **Activity log** — per-task event timeline showing every state change.
- **Per-task prompt overrides** — disable inherited prompts on individual tasks without touching the board or column.
- **Agent reports** — agents can write structured output back to tasks via MCP tools.

---

## Architecture

Promptery runs two processes side by side. The **hub** is a long-running Node server that owns the SQLite database, HTTP API, WebSocket broadcast channel, and the React kanban UI. It starts automatically when the first agent connects, or you can start it explicitly with `promptery start`. The **bridge** is a tiny stdio MCP server that each AI client spawns as a subprocess; multiple bridges all talk to the same hub, so every connected agent shares one board in real time.

Data is stored locally in `~/.promptery/db.sqlite`. Hub state (port, PID) is tracked in `~/.promptery/hub.lock`. On every startup the hub creates a daily SQLite `VACUUM INTO` backup; backups older than 30 days are pruned automatically. You can also trigger manual backups and restore them from the CLI or from Settings → Data in the UI.

---

## MCP tools exposed to agents

| Domain | Tools |
|---|---|
| Boards | `list_boards`, `get_board`, `create_board`, `update_board`, `delete_board`, `set_board_role`, `set_board_prompts`, `get_board_prompts` |
| Columns | `list_columns`, `create_column`, `update_column`, `delete_column`, `set_column_role`, `set_column_prompts`, `get_column_prompts` |
| Tasks | `list_tasks`, `list_all_tasks`, `get_task`, `get_task_bundle`, `get_task_context`, `create_task`, `update_task`, `move_task`, `delete_task`, `set_task_role`, `add_task_prompt`, `remove_task_prompt`, `search_tasks` |
| Roles | `list_roles`, `get_role`, `create_role`, `update_role`, `delete_role`, `set_role_prompts` |
| Prompts | `list_prompts`, `get_prompt`, `create_prompt`, `update_prompt`, `delete_prompt` |
| Prompt groups | `list_prompt_groups`, `get_prompt_group`, `create_prompt_group`, `update_prompt_group`, `delete_prompt_group`, `set_group_prompts`, `add_prompt_to_group`, `remove_prompt_from_group`, `reorder_prompt_groups` |
| UI | `get_ui_info`, `open_promptery_ui` |

---

## Managing your data

All data lives locally in `~/.promptery/db.sqlite`.

### Backups

```bash
promptery backup                          # timestamped snapshot
promptery backup --name pre-refactor      # named snapshot
promptery backups                         # list all backups
promptery restore db-auto-20260423-140000.sqlite
promptery backup-delete <filename>
```

Restore requires the hub to be stopped first (`promptery stop`). A safety backup is written automatically before the restore overwrites the database.

### Export / import

Use **Settings → Data** in the UI to export specific scopes (boards / roles / prompts / settings) as JSON, then import them on another machine. Conflicts can be resolved by skipping existing rows or importing them under `(imported)` suffixes.

---

## Supported AI clients

| Client | Install command |
|---|---|
| Claude Desktop | `install-claude-desktop` |
| Claude Code | `install-claude-code` |
| Cursor | `install-cursor` |
| OpenAI Codex CLI | `install-codex` |
| Qwen Code | `install-qwen` |
| GigaCode | `install-gigacode` |

---

## Troubleshooting

**Agent does not see Promptery tools after install:**

1. Fully quit and restart the client (not just close the window).
2. Run `promptery status` to verify the config was written.
3. Check the client's own MCP log files (path varies by client).
4. Try manual installation by opening the config file shown in `status` output.

**MCP server not connecting on nvm / fnm / volta / asdf systems:**

GUI apps do not inherit shell PATH. The installer writes an absolute path to `npx` in the client config. Re-run the install command after switching Node versions:

```bash
npx -y @dzenlotus/promptery@latest install-claude-code
```

**Port conflicts:**

Promptery tries port `4321` by default and falls back to the next free port. Check `~/.promptery/hub.lock` or `promptery status` for the actual port.

---

## Links

- [Changelog](./CHANGELOG.md)
- [Contributing](./CONTRIBUTING.md)
- [Issues](https://github.com/dzenlotus/promptery/issues)
- [License](./LICENSE)

---

## License

Promptery is licensed under the [Elastic License 2.0](./LICENSE).

- Use it for yourself or your team, free of charge.
- Modify it, fork it, use it inside your company.
- Self-host it for internal use.
- Do not resell it as a hosted or managed service to third parties.
- Do not remove copyright notices or circumvent license keys.

Copyright © 2026 dzenlotus
