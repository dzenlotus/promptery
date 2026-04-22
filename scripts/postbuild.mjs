import { cpSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const assets = [["src/db/schema.sql", "dist/db/schema.sql"]];

for (const [src, dest] of assets) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  console.log(`copied ${src} -> ${dest}`);
}
