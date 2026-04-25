import { describe, expect, it } from "vitest";
import type { TaskWithRelations } from "../../db/queries/tasks.js";
import type { ResolvedTaskContext } from "../../db/inheritance/types.js";
import { buildContextBundle } from "../context.js";

function makeTask(overrides: Partial<TaskWithRelations> = {}): TaskWithRelations {
  const base: TaskWithRelations = {
    id: "t1",
    board_id: "b1",
    column_id: "c1",
    slug: "task-42",
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
    expect(xml).toContain('<task id="task-42" title="Sample">');
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
        slug: "task-1",
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
            short_description: null,
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
    expect(xml).toContain('<task id="task-1" title="Optimize ProductGrid">');
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
            short_description: null,
            created_at: 0,
            updated_at: 0,
            origin: "role:r1",
          },
          {
            id: "dir",
            name: "task-only",
            content: "y",
            color: "#888",
            short_description: null,
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

  it("emits desc attribute when short_description is set, omits it when null", () => {
    const ctx: ResolvedTaskContext = {
      task_id: "t1",
      role: null,
      prompts: [
        {
          id: "pa",
          name: "with-desc",
          content: "body",
          color: null,
          short_description: "Quick summary.",
          origin: "direct",
        },
        {
          id: "pb",
          name: "no-desc",
          content: "body2",
          color: null,
          short_description: null,
          origin: "direct",
        },
      ],
    };
    const xml = buildContextBundle(makeTask(), ctx);
    expect(xml).toContain('<prompt name="with-desc" desc="Quick summary.">');
    expect(xml).toContain('<prompt name="no-desc">');
    expect(xml).not.toContain('desc=""');
  });
});

describe("buildContextBundle — bug #15 regression", () => {
  it("wraps the output in a single <context> root with balanced tags", () => {
    const xml = buildContextBundle(makeTask({ description: "hi" }));
    expect(xml.startsWith("<context>")).toBe(true);
    expect(xml.trimEnd().endsWith("</context>")).toBe(true);
    // Every opening tag must have a matching closer — quick structural check
    // via tag-pair counts. An unbalanced bundle (like the one reported where
    // `<inherited>` and `<board_role_prompts>` had only close tags) fails here.
    for (const tag of [
      "context",
      "task",
    ]) {
      const opens = (xml.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
      const closes = (xml.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      expect({ tag, opens, closes }).toEqual({ tag, opens: 1, closes: 1 });
    }
  });

  it("always includes a <task> section with the title and slug", () => {
    const xml = buildContextBundle(
      makeTask({ slug: "task-15", title: "Inheritance bug", description: "fix me" })
    );
    expect(xml).toContain('<task id="task-15" title="Inheritance bug">');
    expect(xml).toContain("fix me");
  });

  it("does not duplicate role prompts when the active role is inherited from the board", () => {
    // Scenario: task has no role, column has no role, board carries the
    // role. resolveTaskContext returns those prompts tagged origin="board-role"
    // with source pointing at the active role. Previously they appeared in
    // BOTH <role><prompts> and <inherited><board_role_prompts>.
    const ctx: ResolvedTaskContext = {
      task_id: "t1",
      role: {
        id: "R_board",
        name: "board-maintainer",
        content: "do maintenance",
        color: null,
        source: "board",
      },
      prompts: [
        {
          id: "p1",
          name: "role-p1",
          content: "role content",
          color: null,
          origin: "board-role",
          source: { type: "board-role", id: "R_board", name: "board-maintainer" },
        },
      ],
    };
    const xml = buildContextBundle(makeTask(), ctx);
    const matches = xml.match(/role-p1/g) ?? [];
    expect(matches).toHaveLength(1);
    // The render must go into <role><prompts>, not <inherited>.
    const rolePart = xml.slice(xml.indexOf("<role"), xml.indexOf("</role>"));
    expect(rolePart).toContain('<prompt name="role-p1">');
    expect(xml).not.toContain("<board_role_prompts>");
  });

  it("keeps board-role prompts in <inherited> when they don't belong to the active role", () => {
    // Different scenario: task carries its own role (R_task), board has a
    // different role (R_board) whose prompts must show up in <inherited>.
    const ctx: ResolvedTaskContext = {
      task_id: "t1",
      role: {
        id: "R_task",
        name: "task-role",
        content: "task guidance",
        color: null,
        source: "task",
      },
      prompts: [
        {
          id: "pa",
          name: "task-role-p",
          content: "task-role content",
          color: null,
          origin: "role",
          source: { type: "role", id: "R_task", name: "task-role" },
        },
        {
          id: "pb",
          name: "board-role-p",
          content: "board-role content",
          color: null,
          origin: "board-role",
          source: { type: "board-role", id: "R_board", name: "board-role" },
        },
        {
          id: "pc",
          name: "board-direct",
          content: "board-direct content",
          color: null,
          origin: "board",
          source: { type: "board", id: "b1", name: "board" },
        },
      ],
    };
    const xml = buildContextBundle(makeTask(), ctx);

    // Task-role prompt in <role><prompts>, not duplicated in inherited
    expect(xml).toContain('<prompt name="task-role-p">');
    expect((xml.match(/task-role-p/g) ?? []).length).toBe(1);

    // Board-role prompt must appear once, under <board_role_prompts>
    expect(xml).toContain("<board_role_prompts>");
    expect(xml).toContain('<prompt name="board-role-p">');
    expect((xml.match(/board-role-p/g) ?? []).length).toBe(1);

    // Board-direct prompt must appear once, under <board_prompts>
    expect(xml).toContain("<board_prompts>");
    expect(xml).toContain('<prompt name="board-direct">');
  });

  it("does not duplicate column-role prompts when the active role comes from the column", () => {
    const ctx: ResolvedTaskContext = {
      task_id: "t1",
      role: {
        id: "R_col",
        name: "col-role",
        content: "col guidance",
        color: null,
        source: "column",
      },
      prompts: [
        {
          id: "cp",
          name: "col-role-p",
          content: "col-role content",
          color: null,
          origin: "column-role",
          source: { type: "column-role", id: "R_col", name: "col-role" },
        },
      ],
    };
    const xml = buildContextBundle(makeTask(), ctx);
    expect((xml.match(/col-role-p/g) ?? []).length).toBe(1);
    expect(xml).not.toContain("<column_role_prompts>");
  });

  it("renders all 6 layers in a mixed bundle without dropping or duplicating any", () => {
    const ctx: ResolvedTaskContext = {
      task_id: "t1",
      role: {
        id: "R_task",
        name: "task-role",
        content: "",
        color: null,
        source: "task",
      },
      prompts: [
        {
          id: "d1",
          name: "direct-p",
          content: "direct",
          color: null,
          origin: "direct",
        },
        {
          id: "r1",
          name: "role-p",
          content: "role",
          color: null,
          origin: "role",
          source: { type: "role", id: "R_task", name: "task-role" },
        },
        {
          id: "c1",
          name: "col-p",
          content: "col",
          color: null,
          origin: "column",
          source: { type: "column", id: "C", name: "col" },
        },
        {
          id: "cr1",
          name: "col-role-p",
          content: "col-role",
          color: null,
          origin: "column-role",
          source: { type: "column-role", id: "R_col", name: "col-role" },
        },
        {
          id: "b1",
          name: "board-p",
          content: "board",
          color: null,
          origin: "board",
          source: { type: "board", id: "B", name: "board" },
        },
        {
          id: "br1",
          name: "board-role-p",
          content: "board-role",
          color: null,
          origin: "board-role",
          source: { type: "board-role", id: "R_board", name: "board-role" },
        },
      ],
    };
    const xml = buildContextBundle(makeTask(), ctx);
    for (const name of [
      "direct-p",
      "role-p",
      "col-p",
      "col-role-p",
      "board-p",
      "board-role-p",
    ]) {
      // Match only `name="<name>"` occurrences — substring match conflates
      // "role-p" with "col-role-p" / "board-role-p".
      const pattern = new RegExp(`name="${name}"`, "g");
      const count = (xml.match(pattern) ?? []).length;
      expect({ name, count }).toEqual({ name, count: 1 });
    }
  });
});
