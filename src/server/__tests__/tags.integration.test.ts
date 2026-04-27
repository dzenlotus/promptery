import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type ServerHandle } from "../index.js";

let handle: ServerHandle;
let baseUrl: string;

beforeAll(async () => {
  handle = await startServer(0, 0);
  baseUrl = `http://localhost:${handle.port}`;
});

afterAll(async () => {
  await handle.close();
});

async function api(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, { method, headers, body: payload });
}

async function makePrompt(name: string): Promise<{ id: string; name: string }> {
  const res = await api("POST", "/api/prompts", { name });
  return (await res.json()) as { id: string; name: string };
}

describe("tags API", () => {
  it("POST creates a tag with prompts, GET returns members", async () => {
    const p1 = await makePrompt("tag-p1");
    const p2 = await makePrompt("tag-p2");
    const created = await api("POST", "/api/tags", {
      name: "tag-core",
      color: "#8b5cf6",
      prompt_ids: [p1.id, p2.id],
    });
    expect(created.status).toBe(201);
    const tag = (await created.json()) as {
      id: string;
      name: string;
      prompts: { id: string }[];
      prompt_count: number;
    };
    expect(tag.name).toBe("tag-core");
    expect(tag.prompt_count).toBe(2);
    expect(tag.prompts.map((p) => p.id).sort()).toEqual(
      [p1.id, p2.id].sort()
    );

    const fetched = await api("GET", `/api/tags/${tag.id}`);
    expect(fetched.status).toBe(200);
  });

  it("returns 409 on duplicate tag name (case-insensitive)", async () => {
    const r1 = await api("POST", "/api/tags", { name: "tag-dup" });
    expect(r1.status).toBe(201);
    const r2 = await api("POST", "/api/tags", { name: "TAG-DUP" });
    expect(r2.status).toBe(409);
  });

  it("PUT /:id/prompts replaces membership", async () => {
    const p1 = await makePrompt("tag-set-1");
    const p2 = await makePrompt("tag-set-2");
    const tag = (await (
      await api("POST", "/api/tags", {
        name: "tag-set",
        prompt_ids: [p1.id],
      })
    ).json()) as { id: string };

    const res = await api("PUT", `/api/tags/${tag.id}/prompts`, {
      prompt_ids: [p2.id],
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { prompts: { id: string }[] };
    expect(updated.prompts.map((p) => p.id)).toEqual([p2.id]);
  });

  it("POST /:id/prompts is idempotent", async () => {
    const p = await makePrompt("tag-idem");
    const tag = (await (
      await api("POST", "/api/tags", {
        name: "tag-idem-t",
        prompt_ids: [p.id],
      })
    ).json()) as { id: string };

    const res = await api("POST", `/api/tags/${tag.id}/prompts`, {
      prompt_id: p.id,
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { prompts: { id: string }[] };
    expect(updated.prompts).toHaveLength(1);
  });

  it("DELETE /:id leaves prompts alive", async () => {
    const p = await makePrompt("tag-del");
    const tag = (await (
      await api("POST", "/api/tags", {
        name: "tag-del-t",
        prompt_ids: [p.id],
      })
    ).json()) as { id: string };

    const del = await api("DELETE", `/api/tags/${tag.id}`);
    expect(del.status).toBe(200);

    const promptStillThere = await api("GET", `/api/prompts/${p.id}`);
    expect(promptStillThere.status).toBe(200);
  });

  it("DELETE /:id/prompts/:promptId removes the membership", async () => {
    const p = await makePrompt("tag-remove");
    const tag = (await (
      await api("POST", "/api/tags", {
        name: "tag-remove-t",
        prompt_ids: [p.id],
      })
    ).json()) as { id: string };

    const res = await api("DELETE", `/api/tags/${tag.id}/prompts/${p.id}`);
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { prompts: unknown[] };
    expect(updated.prompts).toEqual([]);
  });

  it("PATCH /:id renames a tag", async () => {
    const tag = (await (
      await api("POST", "/api/tags", { name: "tag-orig" })
    ).json()) as { id: string };

    const res = await api("PATCH", `/api/tags/${tag.id}`, { name: "tag-new" });
    expect(res.status).toBe(200);
    const renamed = (await res.json()) as { name: string };
    expect(renamed.name).toBe("tag-new");
  });

  it("returns 400 for unknown prompt ids on create", async () => {
    const res = await api("POST", "/api/tags", {
      name: "tag-bad",
      prompt_ids: ["does-not-exist"],
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for missing tag", async () => {
    const res = await api("GET", "/api/tags/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("GET /by-prompt returns one row per prompt with grouped tags", async () => {
    const p1 = await makePrompt("by-prompt-1");
    const p2 = await makePrompt("by-prompt-2");
    const t1 = (await (
      await api("POST", "/api/tags", {
        name: "by-prompt-tag-A",
        prompt_ids: [p1.id, p2.id],
      })
    ).json()) as { id: string };
    const t2 = (await (
      await api("POST", "/api/tags", {
        name: "by-prompt-tag-B",
        prompt_ids: [p1.id],
      })
    ).json()) as { id: string };

    const res = await api("GET", "/api/tags/by-prompt");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{
      prompt_id: string;
      tags: Array<{ id: string; name: string }>;
    }>;

    const byPrompt = new Map(rows.map((r) => [r.prompt_id, r.tags]));
    const p1Tags = (byPrompt.get(p1.id) ?? []).map((t) => t.id).sort();
    const p2Tags = (byPrompt.get(p2.id) ?? []).map((t) => t.id).sort();
    expect(p1Tags).toEqual([t1.id, t2.id].sort());
    expect(p2Tags).toEqual([t1.id]);
  });
});
