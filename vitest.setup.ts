import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate each vitest run from the user's real ~/.promptery DB.
process.env.PROMPTERY_HOME_DIR = mkdtempSync(join(tmpdir(), "promptery-test-"));
