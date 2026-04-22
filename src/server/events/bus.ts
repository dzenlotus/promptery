import { EventEmitter } from "node:events";
import type { ServerEvent } from "./types.js";

class EventBus extends EventEmitter {
  publish(event: ServerEvent): void {
    this.emit("event", event);
  }

  subscribe(handler: (event: ServerEvent) => void): () => void {
    this.on("event", handler);
    return () => this.off("event", handler);
  }
}

export const bus = new EventBus();
// WS clients + other subscribers; local tool, generous ceiling is fine.
bus.setMaxListeners(100);
