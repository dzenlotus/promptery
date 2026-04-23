# Promptery

> Context orchestration for AI agents — a kanban board with MCP integration.

Build a library of reusable agent personas (roles + prompts) and apply them to tasks on a kanban board. Agents connect via the Model Context Protocol (MCP) and receive structured context for every task they work on.

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
- **Roles** — composable agent personas. A role has its own markdown description and a set of default prompts (e.g. "React Performance Specialist" with prompts for memoization and bundle analysis)
- **Tasks** — work items on a kanban board. Each task can have one role (whose prompts are auto-attached) plus additional direct prompts
- **Context bundle** — when an agent calls `get_task_bundle(id)`, it receives a full XML-formatted context package with role description, prompts, and task details — ready to use as agent context

## MCP tools exposed to agents

**Boards**: list, get, create, update, delete
**Columns**: list, create, update, delete
**Tasks**: list, get, **get_task_bundle**, create, update, move, delete, set_role, add_prompt, remove_prompt
**Roles**: list, get, create, update, delete, set_prompts
**Prompts**: list, get, create, update, delete
**UI**: get_ui_info, open_promptery_ui

## Data location

All data is stored locally in `~/.promptery/db.sqlite`. No cloud, no telemetry, no network calls — everything stays on your machine.

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
