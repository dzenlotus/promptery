import { createServer } from "node:net";

export async function findFreePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port in range ${start}-${end}`);
}

export interface PreferredPort {
  /** Port to try first. */
  port: number;
  /** When true, binding must succeed on exactly `port` — no fallback to the next free one. */
  exact: boolean;
}

/**
 * Resolves the preferred port for the hub, honouring `PROMPTERY_PORT` env as an
 * explicit user override. Explicit = "bind this port or fail loudly" — that's
 * the whole point of setting it (e.g. running a dev hub on 4322 alongside a
 * production hub on 4321 without collisions). CLI `--port` keeps the
 * next-free-port fallback for the default interactive case.
 */
export function resolvePreferredPort(cliPort?: number): PreferredPort {
  const raw = process.env.PROMPTERY_PORT;
  if (raw && raw.trim().length > 0) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      throw new Error(
        `Invalid PROMPTERY_PORT "${raw}" — must be an integer in 0-65535`
      );
    }
    return { port: parsed, exact: true };
  }
  return { port: cliPort ?? 4321, exact: false };
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, "127.0.0.1");
  });
}
