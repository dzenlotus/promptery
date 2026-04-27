import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Search } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { Input } from "../components/ui/Input.js";
import { Button } from "../components/ui/Button.js";
import { useReportSearch } from "../hooks/useAgentReports.js";
import { relativeTime } from "../lib/time.js";
import type { ReportKind, ReportSearchHit } from "../lib/types.js";

const KIND_LABEL: Record<ReportKind, string> = {
  investigation: "Investigation",
  analysis: "Analysis",
  plan: "Plan",
  summary: "Summary",
  review: "Review",
  memo: "Memo",
};

/**
 * Workspace-wide report search at /reports/search?q=…. Useful when the user
 * remembers something an agent wrote but not which task it landed on. The
 * route is read-only — clicking a hit deep-links into the originating
 * board so the user can open the task and read the full report inline.
 */
export function ReportsSearchView() {
  const search = useSearch();
  const [, setLocation] = useLocation();

  const initial = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("q") ?? "";
  }, [search]);

  const [input, setInput] = useState(initial);
  const [activeQuery, setActiveQuery] = useState(initial);

  // Keep the input in sync if the URL changes externally (e.g. browser back).
  useEffect(() => {
    setInput(initial);
    setActiveQuery(initial);
  }, [initial]);

  const { data: hits = [], isLoading, isError, error } = useReportSearch(activeQuery);

  const submit = () => {
    const trimmed = input.trim();
    setActiveQuery(trimmed);
    const next = trimmed.length > 0 ? `/reports/search?q=${encodeURIComponent(trimmed)}` : "/reports/search";
    setLocation(next);
  };

  return (
    <PageLayout
      mainContent={
        <div className="grid gap-4 p-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-[var(--color-text-muted)]" />
            <h1 className="text-[16px] font-medium text-[var(--color-text)]">
              Search reports
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="Search across every agent report (title + content)…"
              autoFocus
              data-testid="reports-search-input"
            />
            <Button variant="primary" onClick={submit}>
              Search
            </Button>
          </div>

          {activeQuery.length === 0 ? (
            <div className="text-[13px] text-[var(--color-text-subtle)]">
              Type a query and hit Enter. Reports are matched via SQLite FTS5
              over title and body.
            </div>
          ) : isLoading ? (
            <div className="text-[13px] text-[var(--color-text-subtle)]">
              Searching…
            </div>
          ) : isError ? (
            <div className="text-[13px] text-[var(--color-danger)]">
              {error instanceof Error ? error.message : "Search failed"}
            </div>
          ) : hits.length === 0 ? (
            <div className="text-[13px] text-[var(--color-text-subtle)]">
              No matches for {JSON.stringify(activeQuery)}.
            </div>
          ) : (
            <ul className="grid gap-2" data-testid="reports-search-results">
              {hits.map((hit) => (
                <ResultRow key={hit.report.id} hit={hit} />
              ))}
            </ul>
          )}
        </div>
      }
    />
  );
}

function ResultRow({ hit }: { hit: ReportSearchHit }) {
  const [, setLocation] = useLocation();
  const open = () => {
    // Navigate to the originating board; TaskDialog discoverability lives on
    // the board view, so a hash anchor lets us scroll/highlight later.
    setLocation(`/board/${hit.task.board_id}#report-${hit.report.id}`);
  };

  return (
    <li>
      <button
        type="button"
        onClick={open}
        className="w-full text-left rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/50 px-3 py-2 hover:bg-[var(--hover-overlay)]/40 transition-colors"
        data-testid="reports-search-result"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
            {KIND_LABEL[hit.report.kind]}
          </span>
          <span className="flex-1 text-[14px] font-medium text-[var(--color-text)] truncate">
            {hit.report.title}
          </span>
          <span className="text-[11px] text-[var(--color-text-subtle)] whitespace-nowrap">
            {relativeTime(hit.report.created_at)}
          </span>
        </div>
        <div className="mt-1 text-[12px] text-[var(--color-text-muted)] line-clamp-2">
          {hit.report.content}
        </div>
        <div className="mt-1.5 text-[11px] text-[var(--color-text-subtle)]">
          on task {JSON.stringify(hit.task.title)}
        </div>
      </button>
    </li>
  );
}
