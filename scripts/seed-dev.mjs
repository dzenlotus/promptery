#!/usr/bin/env node
/**
 * Seed the dev hub with test data: 40 prompts, 12 roles, 40 tasks across
 * 3 boards. Assumes a running hub on PROMPTERY_SEED_URL (default :4322).
 *
 * Usage:
 *   node scripts/seed-dev.mjs
 *   PROMPTERY_SEED_URL=http://localhost:4322 node scripts/seed-dev.mjs
 */

const BASE = process.env.PROMPTERY_SEED_URL ?? "http://localhost:4322";

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path}: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function pick(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

const PROMPT_SEEDS = [
  ["strict-typescript", "Avoid `any`. Prefer `unknown` + narrowing.", "#3178c6"],
  ["no-premature-abstraction", "Inline until 3+ identical uses.", "#f59e0b"],
  ["small-commits", "One logical change per commit.", "#10b981"],
  ["handle-errors-explicitly", "Never swallow errors silently.", "#ef4444"],
  ["test-before-claim", "Run the suite before saying 'done'.", "#ec4899"],
  ["check-existing-patterns", "Search for similar code before inventing.", "#f97316"],
  ["api-layer", "Thin handlers → repository layer.", "#8b5cf6"],
  ["db-schema", "Document all join tables and cascade rules.", "#8b5cf6"],
  ["websocket-sync", "One event per mutation, no polling.", "#0ea5e9"],
  ["inheritance-resolution", "Dedup by prompt_id with specificity.", "#8b5cf6"],
  ["mcp-tools-design", "Every tool has a clear one-line description.", "#8b5cf6"],
  ["hub-bridge-architecture", "Bridge stdio MCP, hub on localhost port.", "#6366f1"],
  ["filesystem-layout", "Never write outside ~/.promptery/ at runtime.", "#14b8a6"],
  ["process-lifecycle", "Handle SIGINT/SIGTERM: flush WAL, release lock.", "#06b6d4"],
  ["dependency-discipline", "Justify every new npm package.", "#eab308"],
  ["license-elastic-v2", "Elastic License 2.0 constraints apply.", "#0ea5e9"],
  ["agent-user-control", "Agents don't mutate workflow structure.", "#84cc16"],
  ["pattern-repository", "Persistence isolated from business logic.", "#d946ef"],
  ["pattern-dependency-injection", "Pass collaborators, don't import them.", "#d946ef"],
  ["pattern-adapter", "Wrap external SDKs behind your domain types.", "#d946ef"],
  ["pattern-strategy", "Swap algorithms via uniform interface.", "#d946ef"],
  ["pattern-observer", "Typed event bus beats Node's EventEmitter.", "#d946ef"],
  ["pattern-command", "Action objects enable undo/redo.", "#d946ef"],
  ["pattern-result-type", "Make failure part of the type signature.", "#d946ef"],
  ["analyst-workflow", "Ship specs, not code. Answer the four questions.", "#14b8a6"],
  ["product-prioritization", "Pain + Leverage − Risk, by effort.", "#ec4899"],
  ["release-sequencing", "Backend schema lands one release before UI.", "#ec4899"],
  ["trade-off-matrix", "End with a recommendation; don't leave it open.", "#14b8a6"],
  ["search-backend-options", "SQLite FTS5 by default; sqlite-vss layered.", "#14b8a6"],
  ["design-critique", "Critique the goal, not just the execution.", "#fb7185"],
  ["observability-baseline", "Structured logs, one trace ID per request.", "#22d3ee"],
  ["security-minimum", "Sanitize input at boundaries; no secrets in logs.", "#ef4444"],
  ["accessibility-baseline", "All interactive elements keyboard reachable.", "#a78bfa"],
  ["i18n-posture", "UTF-8 end-to-end; no English-only assumptions.", "#f472b6"],
  ["perf-budget", "Measure before optimising; set a ceiling.", "#fbbf24"],
  ["migration-safety", "Backfill in batches; never in one transaction.", "#c084fc"],
  ["telemetry-minimalism", "Only collect what drives a decision.", "#64748b"],
  ["editor-discipline", "Don't commit commented-out code.", "#94a3b8"],
  ["docs-as-code", "READMEs live next to the thing they describe.", "#a3e635"],
  ["refactor-rule-of-three", "Extract on the third duplication, not the first.", "#f59e0b"],
];

const ROLE_SEEDS = [
  ["backend-engineer", "Server-side TS, SQLite, Hono. Focused on reliability.", "#0284c7"],
  ["frontend-engineer", "React + Tailwind. Accessibility-first, minimal state.", "#22d3ee"],
  ["fullstack-engineer", "Owns the feature end-to-end. Cross-cuts FE/BE.", "#a78bfa"],
  ["release-engineer", "Migrations, versioning, CI/CD. Zero-downtime.", "#f59e0b"],
  ["tech-analyst", "Ships specs, not code. Tradeoff matrices, risks.", "#14b8a6"],
  ["product-manager", "Pain + Leverage − Risk. MVP over perfection.", "#ec4899"],
  ["security-reviewer", "Threat models, input validation, secret hygiene.", "#ef4444"],
  ["designer", "IA + UI. Style systems, keyboard/tap targets, motion.", "#f472b6"],
  ["qa-engineer", "Regression strategy, edge cases, release readiness.", "#84cc16"],
  ["devops-engineer", "Infra, observability, deploys, runbooks.", "#06b6d4"],
  ["docs-writer", "Runbooks, API refs, onboarding. Plain voice.", "#64748b"],
  ["promptery-maintainer", "Architecture guardrails for this repo.", "#8b5cf6"],
];

const BOARD_SEEDS = [
  {
    name: "Promptery (dev seed)",
    columns: ["Backlog", "Doing", "Review", "Done"],
  },
  {
    name: "Backend epics (seed)",
    columns: ["Ideas", "Scoped", "Building", "Shipped"],
  },
  {
    name: "UX sweep (seed)",
    columns: ["Triage", "In design", "In build", "Live"],
  },
];

const TASK_TITLES = [
  "Rate-limit bridge-register endpoint",
  "Switch backups to hourly rotation",
  "Surface role attribution in the task header",
  "Add /api/meta fields for auto-backup timing",
  "Refactor resolveTaskContext into pure functions",
  "Column-role indicator chip tooltip",
  "Make group chips keyboard-reorderable",
  "Prompt editor: autosave draft every 10s",
  "Skill picker: virtualise long lists",
  "MCP tool registry: surface version in list",
  "Bundle XML: pretty-print optional flag",
  "Import wizard: resume from partial",
  "Export: per-board selection",
  "Board archive + unarchive",
  "Column colour accents",
  "Task dependencies (blocks/blocked-by)",
  "Search: FTS5 over prompts and tasks",
  "Semantic search behind a flag",
  "Keyboard shortcuts cheat sheet",
  "First-run onboarding tour",
  "Per-board role defaults",
  "Prompt groups: share via URL",
  "MCP usage metrics per tool",
  "Offline draft queue for dialogs",
  "A11y: audit focus rings across dialogs",
  "A11y: ARIA labels for sidebar tabs",
  "Theme preset: sepia / solarised",
  "Settings export / import parity",
  "Task ordering: position migration safety",
  "Undo/redo for destructive actions",
  "Dual-pane diff for prompt edits",
  "Backfill board-role on older tasks",
  "Storybook for UI primitives",
  "E2E: Playwright basic smoke",
  "Docs: inheritance resolver examples",
  "Docs: release process runbook",
  "Bridges list: show stale/alive badge",
  "Hub memory pressure watchdog",
  "Seed script as CLI (promptery seed)",
  "Error boundary telemetry hook",
];

function descForTask(title, role) {
  return [
    `## Context`,
    ``,
    `Task "${title}" generated by dev seed script.`,
    ``,
    role
      ? `Assigned role: **${role.name}** — ${role.content}`
      : `No role assigned yet — pick one from the role selector.`,
    ``,
    `## Acceptance`,
    `- Minimal implementation that satisfies the title.`,
    `- Tests + typecheck green.`,
    `- No net-new dependencies unless justified.`,
  ].join("\n");
}

async function main() {
  // Sanity check — must be the dev hub, not production.
  const meta = await api("GET", "/api/meta");
  if (!meta.devMode) {
    throw new Error(
      `Refusing to seed: ${BASE}/api/meta reports devMode=false. ` +
        `Point PROMPTERY_SEED_URL at the dev hub (default :4322).`
    );
  }
  console.log(`→ seeding ${BASE} (devMode=true, version=${meta.version})`);

  // 1. Prompts
  const prompts = [];
  for (const [name, content, color] of PROMPT_SEEDS) {
    const p = await api("POST", "/api/prompts", { name, content, color });
    prompts.push(p);
  }
  console.log(`  ✓ ${prompts.length} prompts`);

  // 2. Roles with 3-6 prompts each, drawn from the prompt pool
  const roles = [];
  for (const [name, content, color] of ROLE_SEEDS) {
    const role = await api("POST", "/api/roles", { name, content, color });
    const count = 3 + Math.floor(Math.random() * 4);
    const chosen = pick(prompts, count).map((p) => p.id);
    await api("PUT", `/api/roles/${role.id}/prompts`, { prompt_ids: chosen });
    roles.push({ ...role, promptIds: chosen });
  }
  console.log(`  ✓ ${roles.length} roles (with 3-6 prompts each)`);

  // 3. Boards with columns
  const boards = [];
  for (const spec of BOARD_SEEDS) {
    const board = await api("POST", "/api/boards", { name: spec.name });
    const cols = [];
    // The default column created with a board is "Backlog"; list and rename
    // to our first desired column, then append the rest.
    const existingCols = await api("GET", `/api/boards/${board.id}/columns`);
    if (existingCols.length > 0) {
      await api("PATCH", `/api/columns/${existingCols[0].id}`, {
        name: spec.columns[0],
      });
      cols.push({ id: existingCols[0].id, name: spec.columns[0] });
    } else {
      const c = await api("POST", `/api/boards/${board.id}/columns`, {
        name: spec.columns[0],
      });
      cols.push(c);
    }
    for (const name of spec.columns.slice(1)) {
      const c = await api("POST", `/api/boards/${board.id}/columns`, { name });
      cols.push(c);
    }
    boards.push({ ...board, columns: cols });
  }
  console.log(`  ✓ ${boards.length} boards with columns`);

  // Attach a board-level role on the primary board so inheritance has
  // something to chew on for seed tasks with no explicit role.
  const primaryRole = roles.find((r) => r.name === "promptery-maintainer");
  if (primaryRole) {
    await api("PUT", `/api/boards/${boards[0].id}/role`, {
      role_id: primaryRole.id,
    });
  }

  // 4. Tasks — 40 spread across all boards/columns with varied roles
  const targetTotal = TASK_TITLES.length;
  const allSlots = boards.flatMap((b) =>
    b.columns.map((c) => ({ boardId: b.id, columnId: c.id }))
  );
  let created = 0;
  for (let i = 0; i < targetTotal; i++) {
    const slot = allSlots[i % allSlots.length];
    // Roughly 60% of tasks get an explicit role; the rest inherit.
    const role = Math.random() < 0.6 ? roles[i % roles.length] : null;
    const title = TASK_TITLES[i];
    const payload = {
      column_id: slot.columnId,
      title,
      description: descForTask(title, role),
    };
    if (role) payload.role_id = role.id;
    await api("POST", `/api/boards/${slot.boardId}/tasks`, payload);
    created++;
  }
  console.log(`  ✓ ${created} tasks across ${boards.length} boards`);

  console.log("\nSeed complete. Open the dev hub and poke around.");
}

main().catch((err) => {
  console.error(`\n✗ Seed failed: ${err.message}`);
  process.exit(1);
});
