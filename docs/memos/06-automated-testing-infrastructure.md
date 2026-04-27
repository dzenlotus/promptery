# Automated Testing Infrastructure

**Issue:** Promptery #27
**Date:** 2026-04-27
**Author:** tech-analyst agent

---

## Problem

Promptery's test surface as of v0.3:

- **Unit tests:** resolver, DB query functions, CLI installers, port utilities, context helpers.
- **Integration tests:** HTTP routes via `app.fetch()` with in-memory SQLite, covering tasks (search, move), boards, columns, prompts. Bridge registry tested with real WS connections.
- **MCP tools test:** `tools-via-hub.test.ts` (bridge-to-hub call path).
- **Performance test:** 1000-row search budget under 100ms.
- **No E2E tests:** no tests that exercise the full path from a real MCP client perspective, the React UI, or the CLI install-then-run cycle.
- **No component tests:** React components are untested.
- **Coverage:** partial; `@vitest/coverage-v8` is installed but no coverage gate enforces a floor.

The gap between "integration tests pass on in-memory DB" and "the product works" includes: frontend rendering, WebSocket live-update flows, the full CLI lifecycle, and MCP-to-hub round-trips as a real external process. Any of these can regress silently.

---

## Options

### Option A: Vitest + jsdom for Component Tests

Add `@testing-library/react` and `@testing-library/user-event` to the dev deps. Render React components in a jsdom environment. Test component behavior: task dialog renders, prompt picker opens, drag-and-drop fires correct callbacks.

Coverage: UI unit behavior. Does not cover Hono routes, WebSocket, or real browser rendering.

### Option B: Playwright E2E Against the Running Hub

Launch the hub in a test process, navigate to `http://localhost:4321` in a real browser (Chromium/Firefox), drive actions via Playwright's page API. Test: create board → create task → open task dialog → verify context bundle display.

Coverage: full stack for happy paths. Catches CSS/layout regressions, WebSocket connectivity, and SPA routing issues. High signal value.

### Option C: Agent-as-Tester

An LLM is given access to the MCP tools and a test script (a list of operations to perform). It calls the tools, records outputs, and reports whether behavior matches expected. This is a non-deterministic test; the same scenario may produce different structured observations.

Coverage: MCP tool contracts. Signal value: high for "does the tool exist and return parseable output." Low for "does it return the *correct* output" (LLM evaluates correctness, which is fuzzy).

### Option D: Snapshot Tests for Bundle XML Output

Render `get_task_bundle` XML for a known database state, save the output as a `.snap` file. Subsequent runs diff against the snapshot. A resolver change that alters output fails the snapshot test; the developer must explicitly update the snapshot to acknowledge the change.

Coverage: resolver output contract. Does not cover UI or CLI.

---

## Trade-off Matrix

| Criterion | A (jsdom components) | B (Playwright E2E) | C (agent-as-tester) | D (snapshot bundles) |
|---|---|---|---|---|
| Implementation cost | Medium | High | High (LLM dependency) | Low |
| Maintenance cost | Medium (breaks on refactors) | Medium (breaks on UI changes) | High (non-deterministic) | Low |
| Coverage of critical paths | Low-Medium | High | Medium | Medium |
| Catches regression in resolver | No | Partial | Partial | Yes (directly) |
| Catches CSS/render regressions | Yes (behavior only) | Yes | No | No |
| Runs in CI without a browser | Yes | No (needs headless browser) | No (needs LLM) | Yes |
| Signal-to-noise ratio | High | High | Low-Medium | High |
| Reveals WebSocket regressions | No | Yes | Partial | No |
| Required for v1.0 coverage gate | Partial | Yes | No | Partial |

---

## Recommendation: Incremental Three-Phase Plan

### Phase 1 — Snapshot Tests + Coverage Gate (v0.4)

**Goal:** establish a coverage baseline and protect the resolver contract.

1. Add snapshot tests for `get_task_bundle` XML output for three canonical scenarios:
   - Task with no role, no inherited prompts.
   - Task inheriting role from board, prompts from three layers.
   - Task with per-task overrides (disabled prompt).
2. Add snapshot tests for `get_task_context` JSON shape (parallel to the XML test).
3. Configure Vitest coverage gate: enforce 75% branch coverage as a CI check. This number is achievable with the current test suite; it forces the gate to exist and blocks regressions without requiring a large authoring sprint.
4. Add a `vitest.config.ts` coverage threshold block:
   ```
   coverage: { thresholds: { branches: 75, lines: 80 } }
   ```

**Named test files to add:**
- `src/db/__tests__/bundle-snapshot.test.ts`
- `src/db/__tests__/context-snapshot.test.ts`
- `src/db/__tests__/bundle-lean.test.ts` (when lean bundles ship)

**Estimated effort:** 2-3 days.

---

### Phase 2 — Component Tests with Vitest + jsdom (v0.4/v0.5)

**Goal:** cover the React components most likely to regress: task dialog, prompt picker, context panel, tag filter.

1. Install `@testing-library/react`, `@testing-library/user-event`.
2. Configure `vitest.config.ts` with `environment: 'jsdom'` for the UI test glob.
3. Write component tests for:
   - `TaskDialog`: renders task title, opens prompt picker, shows effective context panel.
   - `PromptPicker`: filters by tag, expands a group, selects a prompt.
   - `EffectiveContextPanel`: renders per-layer badges correctly for a mock bundle.
   - `TagFilter`: apply tag filters the prompt list.
4. Do not test animated background, themes, or drag-and-drop in jsdom — these require a real browser.

**Named test files to add:**
- `ui/src/__tests__/TaskDialog.test.tsx`
- `ui/src/__tests__/PromptPicker.test.tsx`
- `ui/src/__tests__/EffectiveContextPanel.test.tsx`
- `ui/src/__tests__/TagFilter.test.tsx`

**Coverage impact:** these components represent high-surface, frequently-changed code. Adding them should push branch coverage to 80%+.

**Estimated effort:** 3-4 days.

---

### Phase 3 — Playwright E2E (v0.5/v1.0)

**Goal:** validate the full user journey and catch regressions that unit/integration tests cannot.

**E2E test scenarios (minimum set for v1.0):**
1. Install CLI → hub starts → UI loads at `localhost:4321`.
2. Create board → create column → create task → verify task appears in kanban column.
3. Attach a role to board → open task → verify role chip appears in task dialog.
4. `get_task_bundle` via the MCP endpoint → verify XML contains role name and at least one prompt.
5. Export board as JSON → import on a fresh DB → verify board and tasks match.
6. Undo/redo: delete task → Cmd+Z → task reappears.

**Setup:**
- A Playwright config (`playwright.config.ts`) at the repo root.
- A test fixture that starts the hub on a free port (`PROMPTERY_PORT=4399`), waits for the health endpoint, and tears it down after the suite.
- Test data seeded via `scripts/seed-dev.mjs` (already exists).

**Named test files to add:**
- `e2e/hub-startup.spec.ts`
- `e2e/board-task-lifecycle.spec.ts`
- `e2e/mcp-bundle.spec.ts`
- `e2e/export-import.spec.ts`
- `e2e/undo-redo.spec.ts`

**CI note:** Playwright tests require a headless browser. They should run in a separate CI job (`test:e2e`) gated to main-branch pushes and PRs targeting main, not on every commit. The current unit/integration suite runs on every push.

**Estimated effort:** 4-5 days for setup + initial 5 specs.

---

## Coverage Target Path

| Phase | Estimated Branch Coverage |
|---|---|
| Current (v0.3) | ~55-65% (estimated; no gate enforced) |
| After Phase 1 (snapshots + gate) | 75% (gate enforced) |
| After Phase 2 (component tests) | 80-85% |
| After Phase 3 (E2E) | 80-85% (E2E doesn't add to branch coverage metric; it adds confidence) |

Note: E2E tests run against the compiled artifact, not source. They do not contribute to V8 branch coverage metrics but provide orthogonal confidence that the above coverage is meaningful.

---

## Acceptance Criteria

**Phase 1:**
1. `npm test` fails if branch coverage drops below 75%.
2. Three snapshot test files exist and pass.
3. A PR that changes the resolver output format fails the snapshot test before it merges.

**Phase 2:**
1. Four component test files exist.
2. `npm test` branch coverage ≥ 80%.
3. The task dialog test verifies that a task with an inherited board role shows the role chip.

**Phase 3:**
1. `npm run test:e2e` runs all five E2E specs against a live hub.
2. E2E suite passes on macOS (developer machine) and in GitHub Actions Linux runner.
3. A regression in the `/api/tasks/:id/context` route causes at least one E2E spec to fail.

---

## Open Questions

1. Should the Playwright tests use the full npm package (`npx @dzenlotus/promptery hub`) or the local `ts-node` runner? Using the local runner is faster and simpler for CI; using the npm package would also test the packaging pipeline.
2. Does the jsdom approach work given the heavy use of Radix UI portals and dnd-kit? Some tests may require a more permissive DOM environment or specific mocks. Evaluate during Phase 2 setup.
3. Option C (agent-as-tester) was deprioritized due to non-determinism. It could be valuable as a manual QA tool before releases, invoked by the maintainer rather than in CI. This would not block any phase above.

---

## Risks

| Risk | Mitigation |
|---|---|
| jsdom tests break frequently on Radix UI portal behavior | Wrap portal-dependent components in a test utility that provides a real document body; mock portal refs if necessary |
| Playwright setup cost exceeds budget for a solo maintainer | Phase 3 is scoped to 5 specs; additional coverage grows incrementally over v0.5 and v1.0 |
| Coverage gate blocks a release at a bad moment | The gate threshold is configurable; raise or lower it consciously, not by removing it |
| E2E tests are flaky due to race conditions on hub startup | Use a retry + health-check fixture with a 10-second timeout; fail fast with a clear error message if the hub does not come up |
