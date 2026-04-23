import { nanoid } from "nanoid";

export interface BridgeInfo {
  id: string;
  pid: number;
  agent_hint: string | null;
  registered_at: number;
  last_seen: number;
}

const bridges = new Map<string, BridgeInfo>();

const STALE_MS = 120_000;
const SWEEP_INTERVAL_MS = 60_000;

export interface RegisterBridgeInput {
  pid: number;
  agent_hint?: string | null;
}

export function registerBridge(input: RegisterBridgeInput): BridgeInfo {
  const id = nanoid(10);
  const now = Date.now();
  const bridge: BridgeInfo = {
    id,
    pid: input.pid,
    agent_hint: input.agent_hint ?? null,
    registered_at: now,
    last_seen: now,
  };
  bridges.set(id, bridge);
  return bridge;
}

export function heartbeat(id: string): boolean {
  const bridge = bridges.get(id);
  if (!bridge) return false;
  bridge.last_seen = Date.now();
  return true;
}

export function unregisterBridge(id: string): boolean {
  return bridges.delete(id);
}

export function listBridges(): BridgeInfo[] {
  return Array.from(bridges.values());
}

/** Test-only — clears all state. */
export function _resetBridges(): void {
  bridges.clear();
}

// Sweep stale bridges periodically. unref so the timer doesn't hold the event
// loop open — otherwise hub shutdown would hang.
const sweeper = setInterval(() => {
  const cutoff = Date.now() - STALE_MS;
  for (const [id, bridge] of bridges) {
    if (bridge.last_seen < cutoff) bridges.delete(id);
  }
}, SWEEP_INTERVAL_MS);
sweeper.unref();
