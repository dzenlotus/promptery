import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UI_SRC = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      out.push(...listTsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function findCommandItemBlocks(source: string): string[] {
  const blocks: string[] = [];
  const marker = "<Command.Item";
  let from = 0;
  while (true) {
    const open = source.indexOf(marker, from);
    if (open < 0) break;
    // Find the matching '>' that ends the opening tag — ignoring '>' inside
    // JSX expressions ({...}). Tracks brace depth so `value={x > 0 ? ...}` and
    // similar JSX stay balanced.
    let depth = 0;
    let end = open + marker.length;
    while (end < source.length) {
      const ch = source[end];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        // skip `=>` arrows inside the tag
        if (source[end - 1] !== "=") break;
      }
      end++;
    }
    blocks.push(source.slice(open, end + 1));
    from = end + 1;
  }
  return blocks;
}

describe("Command.Item value+keywords contract", () => {
  const files = listTsxFiles(UI_SRC).filter((f) =>
    /from "cmdk"|from 'cmdk'/.test(readFileSync(f, "utf-8"))
  );

  it("finds every component that imports cmdk", () => {
    // Guardrail: if the set of cmdk consumers changes, bump this count and
    // audit the new file. Prevents a future selector from quietly being added
    // without the value/keywords contract.
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    const rel = file.replace(UI_SRC + "/", "");
    const source = readFileSync(file, "utf-8");
    if (!source.includes("<Command.Item")) continue;

    it(`${rel} marks item wrappers with cmdk-group-items`, () => {
      // cmdk's search-reorder walks every visible CommandItem and calls
      // `item.closest('[cmdk-group-items=""]').appendChild(...)`. Without
      // the attribute on our flex-wrap wrapper the closest() query misses,
      // the fallback selector returns null, and appendChild(null) crashes
      // the whole React tree on first keystroke. See bug #27.
      expect(source).toMatch(/cmdk-group-items=""/);
    });
  }

  for (const file of files) {
    const rel = file.replace(UI_SRC + "/", "");
    const source = readFileSync(file, "utf-8");
    const blocks = findCommandItemBlocks(source);

    if (blocks.length === 0) continue;

    describe(rel, () => {
      for (const [i, block] of blocks.entries()) {
        it(`CommandItem #${i + 1} uses id-based value (not name)`, () => {
          // value={...} must be present — without it cmdk falls back to
          // scanning textContent, which collides whenever two items render
          // identical text and crashes on first keystroke.
          expect(block).toMatch(/\bvalue\s*=/);
          // A literal value={x.name} (or `${..name}`) is the exact bug
          // pattern we're guarding against. ids are the safe choice.
          expect(block).not.toMatch(/value\s*=\s*\{[^}]*\.name\b/);
          expect(block).not.toMatch(/value\s*=\s*\{`[^`]*\$\{[^}]*\.name\}/);
        });

        it(`CommandItem #${i + 1} routes display text through keywords`, () => {
          // Skip static non-data items (e.g. a fixed "__clear__" row) —
          // they have no name to collide with. Heuristic: their value is a
          // plain string literal instead of an expression.
          const isStatic = /value\s*=\s*(['"])/.test(block);
          if (isStatic) return;
          expect(block).toMatch(/\bkeywords\s*=/);
        });
      }
    });
  }
});
