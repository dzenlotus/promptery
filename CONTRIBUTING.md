# Contributing to Promptery

Thank you for your interest in contributing. This document covers the repository layout, dev setup, testing, and conventions.

---

## Repository layout

```
bin/          CLI entry point (cli.js — compiled output, committed for npx)
scripts/      Build utilities and dev seeder (postbuild.mjs, seed-dev.mjs)
src/
  bridge/     Stdio MCP server spawned by AI clients
  cli/        CLI command handlers (start, stop, status, backup, restore…)
  cli.ts      CLI entry (commander setup)
  db/         SQLite layer — schema, migrations, queries, repositories
  hub/        HTTP + WebSocket server (Hono), static file serving
  mcp/        MCP tool definitions and handlers
  server/     Shared server bootstrap
  shared/     Types and utilities shared across server and bridge
ui/           React 19 + Vite frontend
  src/
    components/
    routes/
    lib/
```

---

## Dev setup

**Prerequisites:** Node 20+, npm.

```bash
# Install root dependencies
npm install

# Install UI dependencies
npm install --prefix ui

# Build the server (TypeScript → dist/) and UI (ui/dist/)
npm run build

# Start a dev hub on port 4322 with an isolated DB in .dev-home/
npm run dev
```

The dev hub runs on `http://localhost:4322`. It will not touch your production database at `~/.promptery/db.sqlite`.

To iterate on the UI independently:

```bash
npm run dev:ui
```

This starts Vite's dev server (default port 5173) with HMR. The Vite config proxies API and WebSocket requests to the hub at 4322.

To seed the dev hub with sample data (boards, tasks, roles, prompts):

```bash
node scripts/seed-dev.mjs
```

The seeder refuses to run unless the target hub reports `devMode: true`, which prevents accidental writes to a production database.

---

## Test commands

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Type-check server code
npm run typecheck

# Type-check UI code
npm run typecheck --prefix ui
```

Tests use [Vitest](https://vitest.dev/) with in-memory SQLite databases (no external services required). Each test file gets a fresh database via the `testDb` helper in `src/db/__tests__/helpers/testDb.ts`.

---

## Database migrations

Migrations live in `src/db/migrations/`. Each file is a numbered SQL script (e.g. `009_spaces.sql`). Migrations run automatically on hub startup and are applied in order. They are designed to be idempotent.

To reset the dev database:

```bash
rm -rf .dev-home
npm run dev   # hub recreates the schema from scratch on next start
```

Never modify a migration that has already shipped in a released version. Add a new numbered migration instead.

---

## Branch and PR guidelines

- Branch from `main`. Use short, descriptive names: `feat/spaces`, `fix/ws-desync`.
- Keep commits small and focused — one logical change per commit.
- Write commit subjects in the imperative mood: `add spaces support`, not `added spaces support`.
- The commit body should explain *why* the change is needed, not just what changed.
- Reference the relevant issue in the PR description.
- All tests must pass (`npm test`) and both typechecks must be clean (`npm run typecheck`, `npm run typecheck --prefix ui`) before requesting a review.

---

## Commit trailer convention

For paired or AI-assisted work, add a trailer on the final blank-line-separated paragraph:

```
feat(spaces): add cross-space task move

Allows agents to relocate tasks between spaces in a single MCP call
without losing role and prompt assignments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Code style

- **Strict TypeScript** throughout. `strict: true` is enabled in `tsconfig.json`.
- **No `any`**. Use `unknown` and narrow explicitly, or define a proper type.
- **Prefer the platform** — use Node built-ins and Web APIs before reaching for a new dependency.
- Server code is ESM (`"type": "module"` in `package.json`). Use `.js` extensions in imports.
- UI code follows the existing React 19 + Radix UI + Tailwind conventions in `ui/src/`.
- Format consistently with the surrounding code. There is no enforced formatter yet — match indentation (2 spaces) and style of the file you are editing.

---

## License

By contributing you agree that your contributions will be licensed under the [Elastic License 2.0](./LICENSE).
