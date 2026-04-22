import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Mounts static UI serving when `dist/ui/` exists next to the compiled server.
 * Non-API paths fall back to `index.html` for SPA client-side routing.
 * Returns true if UI is being served.
 */
export function mountUiStatic(app: Hono): boolean {
  const uiRoot = findUiRoot();
  if (!uiRoot) return false;

  const indexPath = join(uiRoot, "index.html");
  const indexHtml = readFileSync(indexPath, "utf-8");

  // @hono/node-server's serveStatic resolves `root` relative to process.cwd(),
  // so convert absolute path to cwd-relative.
  const rootRel = relative(process.cwd(), uiRoot) || ".";

  app.use(
    "/*",
    serveStatic({
      root: rootRel,
      rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
    })
  );

  // SPA fallback for non-asset, non-API paths (e.g. /board/xyz for client-side routes).
  // Asset paths (anything with a file extension) must 404 if not served above — never
  // masquerade as index.html.
  app.get("*", (c) => {
    const p = new URL(c.req.url).pathname;
    if (p.startsWith("/api") || p === "/ws" || p === "/health") return c.notFound();
    if (/\.[a-z0-9]+$/i.test(p)) return c.notFound();
    return c.html(indexHtml);
  });

  return true;
}

function findUiRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../ui"),
    resolve(here, "../../dist/ui"),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, "index.html"))) return p;
  }
  return null;
}
