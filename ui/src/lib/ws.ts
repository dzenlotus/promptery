import type { ServerEvent } from "./types.js";

type WsEventHandler = (event: ServerEvent) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<WsEventHandler>();
  private reconnectTimer: number | null = null;

  connect() {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;
    const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ServerEvent;
        this.handlers.forEach((h) => h(event));
      } catch {
        // ignore malformed messages
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      ws.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  subscribe(handler: WsEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

export const wsClient = new WSClient();
