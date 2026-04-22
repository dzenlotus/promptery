import type { WSContext } from "hono/ws";
import { bus } from "./bus.js";

const clients = new Set<WSContext>();

export function handleWsOpen(ws: WSContext): void {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "hello", data: { connectedClients: clients.size } }));
}

export function handleWsClose(ws: WSContext): void {
  clients.delete(ws);
}

export function getConnectedClientsCount(): number {
  return clients.size;
}

// One subscription for the lifetime of the process — events fan out to all open clients.
bus.subscribe((event) => {
  const message = JSON.stringify(event);
  for (const client of clients) {
    try {
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }
});
