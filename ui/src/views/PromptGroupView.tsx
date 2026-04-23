import { useParams, useLocation } from "wouter";
import { Folder } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { PromptsSidebarList } from "../components/prompts/PromptsSidebarList.js";
import { usePromptGroup } from "../hooks/usePromptGroups.js";
import { usePrompts } from "../hooks/usePrompts.js";
import { useMemo } from "react";

/**
 * Group detail — left sidebar reuses the standard Prompts list (groups +
 * all prompts) so the user can jump between groups and individual prompts
 * without leaving the page. Main area shows the group's members with their
 * content previews; clicking a prompt navigates to the prompt editor.
 */
export function PromptGroupView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: group, isLoading, isError } = usePromptGroup(id ?? null);
  const { data: allPrompts = [] } = usePrompts();

  // The sidebar list is purely navigational in this view — the "select"
  // and rename callbacks route to the prompt editor rather than mutating
  // state here.
  const prompts = useMemo(
    () =>
      [...allPrompts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [allPrompts]
  );

  const sidebar = (
    <PromptsSidebarList
      prompts={prompts}
      isLoading={false}
      selectedId={null}
      showDraft={false}
      draftIsSelected={false}
      renamingId={null}
      onSelect={(pid) => setLocation(`/prompts#${pid}`)}
      onSelectDraft={() => setLocation("/prompts")}
      onCreateDraft={() => setLocation("/prompts")}
      onRequestRename={() => setLocation("/prompts")}
      onCommitRename={() => {}}
      onCancelRename={() => {}}
      onColorPick={() => {}}
      onDuplicate={() => setLocation("/prompts")}
      onDelete={() => setLocation("/prompts")}
    />
  );

  const main = (() => {
    if (isLoading) {
      return (
        <div
          data-testid="prompt-group-view"
          data-state="loading"
          className="h-full grid place-items-center text-[var(--color-text-subtle)] text-[13px]"
        >
          Loading…
        </div>
      );
    }
    if (isError || !group) {
      return (
        <div
          data-testid="prompt-group-view"
          data-state="not-found"
          className="h-full grid place-items-center text-[var(--color-text-subtle)] text-[13px]"
        >
          Group not found
        </div>
      );
    }
    const color = group.color || "#7a746a";
    return (
      <div
        data-testid="prompt-group-view"
        data-group-id={group.id}
        className="h-full overflow-y-auto p-8 max-w-[960px] mx-auto"
      >
        <header className="flex items-center gap-3 mb-6">
          <div
            className="h-9 w-9 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]"
            style={{ color }}
          >
            <Folder size={16} />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{group.name}</h1>
            <p className="text-[12px] text-[var(--color-text-muted)]">
              {group.prompts.length} prompt{group.prompts.length === 1 ? "" : "s"}
            </p>
          </div>
        </header>

        {group.prompts.length === 0 ? (
          <div className="text-[13px] text-[var(--color-text-muted)]">
            This group is empty. Use the group's ⋯ menu in the sidebar to add prompts.
          </div>
        ) : (
          <ul className="grid gap-2">
            {group.prompts.map((p) => (
              <li
                key={p.id}
                data-testid={`prompt-group-entry-${p.id}`}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--hover-overlay)] px-4 py-3 hover:border-[var(--color-border-strong)] transition-colors cursor-pointer"
                onClick={() => setLocation(`/prompts#${p.id}`)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: p.color || "#7a746a" }}
                  />
                  <h3 className="text-[14px] font-medium truncate">{p.name}</h3>
                </div>
                {p.content.trim().length > 0 && (
                  <p className="text-[12px] text-[var(--color-text-muted)] line-clamp-2 whitespace-pre-wrap">
                    {p.content}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  })();

  return <PageLayout sidebarContent={sidebar} mainContent={main} />;
}
