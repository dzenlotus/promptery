# Prompt Library Scaling

**Issue:** Promptery #15
**Date:** 2026-04-27
**Author:** tech-analyst agent

---

## Problem

Tags shipped in v0.3. That solves filtering. It does not solve navigation for a library of 30-plus prompts. At that scale, the sidebar has a flat list of prompts and a flat list of groups. A user must scroll or search to find anything. Cognitive overhead grows linearly with library size.

The scaling problem has two distinct axes:

1. **Navigation axis.** How does a user find a specific prompt quickly?
2. **Assignment axis.** How does a user assign the right prompts to a role, board, or column quickly without selecting them one by one?

Tags partially address the navigation axis (filter-by-tag collapses the list). They do not address the assignment axis at all. Groups address the assignment axis (attach a group instead of individual prompts) but only if the group is pre-organized. Neither tags nor groups address the problem of a library that has grown beyond the user's ability to remember what exists.

---

## Options

### Option A: Tags only (already shipped)

Filter the sidebar by tag. No structural changes.

### Option B: Workspaces / Spaces (shipped in v0.3)

Separate prompt sets per space. Each space is an independent library. Scales by partitioning, not by organizing.

### Option C: Categories (taxonomy)

A fixed or user-defined classification hierarchy: "Architecture," "Coding Standards," "Review," "Persona," etc. Each prompt belongs to exactly one category. The sidebar groups prompts under category headings.

### Option D: Folders / Hierarchical Groups

Extend the existing prompt groups concept to support nested groups (folder > subfolder > prompt). The sidebar renders a tree.

### Option E: AI-Suggested Groupings

An agent analyzes prompt content and short descriptions, then suggests group assignments. The user approves or rejects. No new UI structure required; results land in the existing groups system.

### Option F: Smart Collections (saved tag queries)

A user saves a tag filter as a named "collection" (e.g., "All #typescript prompts"). Collections appear in the sidebar as virtual groups. No structural DB change; just a saved-query layer.

---

## Trade-off Matrix

| Criterion | A (tags) | B (spaces) | C (categories) | D (folders) | E (AI groupings) | F (smart collections) |
|---|---|---|---|---|---|---|
| Solves navigation for 30+ prompts | Partial | No (partitions, not organizes) | Yes | Yes | Yes | Yes |
| Solves assignment axis | No | No | Partial | Yes | Partial | Partial |
| Implementation cost | 0 (done) | 0 (done) | Low | Medium | High | Low |
| Conceptual complexity for user | Low | Medium | Low | Medium | Low | Low |
| Works with existing groups system | Yes | Yes | Needs migration | Extends groups | Yes | Yes |
| Risk of over-engineering | None | None | Low | Medium | High | Low |
| Handles 100+ prompts | No | Partial | Yes | Yes | Yes | Yes |
| Handles 300+ prompts | No | Partial | Partial | Yes | Yes | Partial |
| Works today without new DB schema | Yes | Yes | No | No | No | Yes |

---

## What Tags Do Not Solve

Tags answer "show me all prompts tagged #typescript." They do not answer:

- "Show me the prompts I would typically assign to a new React project board" (assembly problem).
- "I added 5 new prompts last week — are they covered by my existing groups?" (gap detection).
- "I want to apply my standard 'code review' setup to this new column" (template problem).

Groups partially solve these, but only if the user maintains them. AI-suggested groupings (Option E) could automate group maintenance, but introduces an LLM dependency at the point of library management — a significant architectural decision for a local-first tool.

---

## Recommendation: Option F (Smart Collections) now; Option C (Categories) in v0.5

**Immediate: Smart Collections (Option F)**

Saved tag queries require no schema change — just a `collections` table with `(id, name, tag_query: string[])` and a sidebar section rendering them. A user defines "React stack" as `#react AND #typescript AND #performance`, and that collection appears as a named sidebar item. Clicking it filters the prompt list. This solves the navigation axis for 30-60 prompts with minimal implementation effort.

What it explicitly does not solve: the assignment axis. A user still selects prompts individually when attaching to a role or board, unless the collection is made attachable (that is a v0.5 feature).

**v0.5: Categories**

A flat category system (user-defined, not fixed) with prompts belonging to exactly one category. The sidebar renders category headings with collapse/expand. Categories differ from groups in two ways: (1) many-to-one (a prompt belongs to exactly one category), and (2) they are navigation-only — attaching a category to a board or role is not the intended use case.

This requires a `category_id` column on the `prompts` table and a `categories` table. Migration is additive (nullable column, default null = "Uncategorized").

**What this roadmap explicitly defers:**

- Nested folders (Option D): adds two-level complexity before the simpler solutions have been proven inadequate.
- AI-suggested groupings (Option E): requires an LLM call from within a local-first tool, which adds a dependency and a privacy consideration. Defer until an offline embedding model is viable.

---

## Acceptance Criteria

**Smart Collections (v0.4):**
1. A user can create a named collection with 1-N tag filters.
2. Collections appear in the sidebar Prompts section as named entries.
3. Clicking a collection filters the prompt list identically to applying those tags manually.
4. Collections persist across sessions (stored in DB).
5. Collections do not appear in the role/board/column prompt picker (they are navigation-only at this stage).

**Categories (v0.5):**
1. A category can be created, renamed, and deleted.
2. Each prompt belongs to at most one category (null = uncategorized).
3. Sidebar groups prompts under category headings with a count badge.
4. Uncategorized prompts appear under a collapsible "Uncategorized" section.
5. Deleting a category sets `category_id = null` on its prompts (soft orphan, not cascade delete).

---

## Open Questions

1. Should smart collections support AND/OR logic, or just AND? AND is simpler to implement and covers the most common use case.
2. Can a collection also be a default "attachment" when creating a new board? If yes, this bridges the navigation and assignment axes earlier than v0.5.
3. Is "Uncategorized" acceptable as a default category for all 30+ existing prompts, or should the first version of categories ship with an import-time bulk-categorize wizard?

---

## Risks

| Risk | Mitigation |
|---|---|
| Smart collections are underused if users don't think in terms of tag queries | Provide 3-5 default collections (e.g., "All Coding Standards", "All Personas") on first run |
| Categories schema change requires a migration that must not break existing groups | Categories are a separate table; groups are unchanged; migration adds a nullable FK only |
| 300+ prompt scale is not solved by categories alone | Folders remain on the backlog; the categories decision does not foreclose them |
