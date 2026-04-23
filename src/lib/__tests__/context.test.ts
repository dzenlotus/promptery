import { describe, expect, it } from "vitest";
import type { TaskWithRelations } from "../../db/queries/tasks.js";
import { buildContextBundle } from "../context.js";

function makeTask(overrides: Partial<TaskWithRelations> = {}): TaskWithRelations {
  const base: TaskWithRelations = {
    id: "t1",
    board_id: "b1",
    column_id: "c1",
    number: 42,
    title: "Sample",
    description: "",
    position: 1,
    role_id: null,
    role: null,
    prompts: [],
    skills: [],
    mcp_tools: [],
    created_at: 0,
    updated_at: 0,
  };
  return { ...base, ...overrides };
}

describe("buildContextBundle", () => {
  it("emits only a <task> section when no role and no relations", () => {
    const xml = buildContextBundle(makeTask({ description: "do the thing" }));
    expect(xml).not.toContain("<role");
    expect(xml).toContain('<task id="42" title="Sample">');
    expect(xml).toContain("do the thing");
  });

  it("omits empty <description> inside the task block", () => {
    const xml = buildContextBundle(makeTask({ description: "" }));
    expect(xml).not.toContain("<description>");
  });

  it("renders role section with all three primitive groups when populated", () => {
    const xml = buildContextBundle(
      makeTask({
        title: "Optimize ProductGrid",
        number: 1,
        description: "speed it up",
        role_id: "role1",
        role: {
          id: "role1",
          name: "React Perf Specialist",
          content: "you optimise React",
          color: "#888",
          created_at: 0,
          updated_at: 0,
        },
        prompts: [
          {
            id: "p1",
            name: "comments-english",
            content: "write comments in English",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "role:role1",
          },
        ],
        skills: [
          {
            id: "s1",
            name: "memoization",
            content: "use useMemo",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "role:role1",
          },
        ],
        mcp_tools: [
          {
            id: "m1",
            name: "react-devtools",
            content: "profiler tab",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "role:role1",
          },
        ],
      })
    );

    expect(xml).toContain('<role name="React Perf Specialist">');
    expect(xml).toContain("<prompts>");
    expect(xml).toContain('<prompt name="comments-english">');
    expect(xml).toContain("<skills>");
    expect(xml).toContain('<skill name="memoization">');
    expect(xml).toContain("<mcp_tools>");
    expect(xml).toContain('<mcp_tool name="react-devtools">');
    expect(xml).toContain('<task id="1" title="Optimize ProductGrid">');
  });

  it("omits empty primitive groups in role section but keeps the role block", () => {
    const xml = buildContextBundle(
      makeTask({
        role_id: "r1",
        role: {
          id: "r1",
          name: "Solo",
          content: "lone wolf",
          color: "#888",
          created_at: 0,
          updated_at: 0,
        },
      })
    );
    expect(xml).toContain('<role name="Solo">');
    expect(xml).toContain("<description>");
    expect(xml).not.toContain("<prompts>");
    expect(xml).not.toContain("<skills>");
    expect(xml).not.toContain("<mcp_tools>");
  });

  it("splits direct vs role-origin attachments into the correct sections", () => {
    const xml = buildContextBundle(
      makeTask({
        role_id: "r1",
        role: {
          id: "r1",
          name: "R",
          content: "",
          color: "#888",
          created_at: 0,
          updated_at: 0,
        },
        prompts: [
          {
            id: "inh",
            name: "from-role",
            content: "x",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "role:r1",
          },
          {
            id: "dir",
            name: "task-only",
            content: "y",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "direct",
          },
        ],
      })
    );

    // role section gets the inherited prompt, task section gets the direct one
    const rolePart = xml.slice(xml.indexOf("<role"), xml.indexOf("</role>"));
    const taskPart = xml.slice(xml.indexOf("<task"));
    expect(rolePart).toContain('<prompt name="from-role">');
    expect(rolePart).not.toContain('<prompt name="task-only">');
    expect(taskPart).toContain("<direct_prompts>");
    expect(taskPart).toContain('<prompt name="task-only">');
    expect(taskPart).not.toContain('<prompt name="from-role">');
  });

  it("uses <direct_*> wrapper tags for direct attachments on a task with no role", () => {
    const xml = buildContextBundle(
      makeTask({
        skills: [
          {
            id: "s1",
            name: "tdd",
            content: "test first",
            color: "#888",
            created_at: 0,
            updated_at: 0,
            origin: "direct",
          },
        ],
      })
    );
    expect(xml).toContain("<direct_skills>");
    expect(xml).toContain('<skill name="tdd">');
    expect(xml).not.toContain("<role");
  });

  it("escapes &, < and quotes inside attribute values; escapes & and < (but not >) in body text", () => {
    const xml = buildContextBundle(
      makeTask({
        title: 'A & "B" <C>',
        description: "use foo & <bar> > quote",
      })
    );
    expect(xml).toContain('title="A &amp; &quot;B&quot; &lt;C&gt;"');
    // `>` stays unescaped in body text so markdown blockquotes survive.
    expect(xml).toContain("use foo &amp; &lt;bar> > quote");
  });
});
