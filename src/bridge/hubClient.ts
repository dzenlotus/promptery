/**
 * Thin typed wrapper around fetch — centralises URL construction, error
 * translation, and heartbeat bookkeeping so MCP tools can stay one-liners.
 *
 * Surfaces non-2xx responses as real Error objects carrying the server's
 * error body; the MCP handler wraps them as tool errors.
 */
export class HubClient {
  private bridgeId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(public readonly baseUrl: string) {}

  async register(agentHint?: string | null, roleIds?: string[]): Promise<void> {
    const res = await this.post<{ id: string }>("/api/bridges/register", {
      pid: process.pid,
      agent_hint: agentHint ?? null,
      role_ids: roleIds && roleIds.length > 0 ? roleIds : undefined,
    });
    this.bridgeId = res.id;
    this.heartbeatTimer = setInterval(() => {
      if (!this.bridgeId) return;
      this.post(`/api/bridges/${this.bridgeId}/heartbeat`, {}).catch(() => {
        // hub may have bounced — don't spam stderr
      });
    }, 30_000);
    this.heartbeatTimer.unref();
  }

  async unregister(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (!this.bridgeId) return;
    try {
      await this.post(`/api/bridges/${this.bridgeId}/unregister`, {});
    } catch {
      // hub may already be gone — unregister is best effort
    }
    this.bridgeId = null;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), { headers: this.bridgeHeaders() });
    return this.parseJson<T>(res, "GET", path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.bridgeHeaders() },
      body: JSON.stringify(body),
    });
    return this.parseJson<T>(res, "POST", path);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...this.bridgeHeaders() },
      body: JSON.stringify(body),
    });
    return this.parseJson<T>(res, "PATCH", path);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.bridgeHeaders() },
      body: JSON.stringify(body),
    });
    return this.parseJson<T>(res, "PUT", path);
  }

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "DELETE",
      headers: this.bridgeHeaders(),
    });
    return this.parseJson<T>(res, "DELETE", path);
  }

  /** Raw text response — for endpoints like /bundle that return XML. */
  async getText(path: string): Promise<string> {
    const res = await fetch(this.url(path), { headers: this.bridgeHeaders() });
    if (!res.ok) {
      throw new Error(
        `GET ${path}: ${res.status} ${res.statusText} ${await res.text()}`
      );
    }
    return res.text();
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /** Returns `X-Bridge-Id` header when the bridge is registered. */
  private bridgeHeaders(): Record<string, string> {
    if (!this.bridgeId) return {};
    return { "X-Bridge-Id": this.bridgeId };
  }

  private async parseJson<T>(
    res: Response,
    method: string,
    path: string
  ): Promise<T> {
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${method} ${path}: ${res.status} ${res.statusText} ${body}`);
    }
    // Some endpoints legitimately return empty body. Try JSON first, fall
    // back to empty object rather than throwing on JSON.parse("").
    const text = await res.text();
    if (text.length === 0) return {} as T;
    return JSON.parse(text) as T;
  }
}
