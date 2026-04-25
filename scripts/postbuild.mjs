import { chmodSync, cpSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const assets = [
  ["src/db/schema.sql", "dist/db/schema.sql"],
  [
    "src/db/migrations/004_refactor_tags_to_typed_entities.sql",
    "dist/db/migrations/004_refactor_tags_to_typed_entities.sql",
  ],
  ["src/db/migrations/005_settings.sql", "dist/db/migrations/005_settings.sql"],
  ["src/db/migrations/006_inheritance.sql", "dist/db/migrations/006_inheritance.sql"],
  ["src/db/migrations/007_prompt_groups.sql", "dist/db/migrations/007_prompt_groups.sql"],
  ["src/db/migrations/008_tasks_fts.sql", "dist/db/migrations/008_tasks_fts.sql"],
];

for (const [src, dest] of assets) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  console.log(`copied ${src} -> ${dest}`);
}

if (process.platform !== "win32") {
  chmodSync("dist/cli.js", 0o755);
  console.log("chmod +x dist/cli.js");
}
