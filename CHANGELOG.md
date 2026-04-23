# Changelog

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
