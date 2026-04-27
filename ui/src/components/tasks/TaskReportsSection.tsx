import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/Button.js";
import { Input } from "../ui/Input.js";
import { cn } from "../../lib/cn.js";
import { relativeTime } from "../../lib/time.js";
import {
  useCreateReport,
  useDeleteReport,
  useReportsForTask,
} from "../../hooks/useAgentReports.js";
import { REPORT_KINDS, type AgentReport, type ReportKind } from "../../lib/types.js";

const KIND_LABELS: Record<ReportKind, string> = {
  investigation: "Investigation",
  analysis: "Analysis",
  plan: "Plan",
  summary: "Summary",
  review: "Review",
  memo: "Memo",
};

/**
 * Per-kind tints — kept separate from the existing tag/role palette so
 * reports stay visually distinct from primitives. Values reuse the same
 * CSS-variable system the rest of the app does.
 */
const KIND_BADGE: Record<ReportKind, string> = {
  investigation: "bg-blue-500/15 text-blue-400",
  analysis: "bg-purple-500/15 text-purple-400",
  plan: "bg-emerald-500/15 text-emerald-400",
  summary: "bg-amber-500/15 text-amber-400",
  review: "bg-rose-500/15 text-rose-400",
  memo: "bg-slate-500/20 text-slate-300",
};

interface Props {
  taskId: string;
}

export function TaskReportsSection({ taskId }: Props) {
  const { data: reports = [], isLoading } = useReportsForTask(taskId);
  // Default-expanded when reports already exist so users see existing
  // material immediately; collapsed otherwise to keep the dialog compact.
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const isExpanded = expanded ?? reports.length > 0;

  const [composing, setComposing] = useState(false);
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  const reportCount = reports.length;

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setExpanded(!isExpanded)}
        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--color-text-subtle)] hover:text-[var(--color-text)] transition-colors w-fit"
        data-testid="task-reports-toggle"
      >
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Reports
        {reportCount > 0 ? (
          <span className="text-[var(--color-text-muted)] normal-case tracking-normal">
            ({reportCount})
          </span>
        ) : null}
      </button>

      {isExpanded ? (
        <div className="grid gap-2">
          {isLoading && reports.length === 0 ? (
            <div className="text-[12px] text-[var(--color-text-subtle)]">
              Loading reports…
            </div>
          ) : null}

          {reports.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              taskId={taskId}
              expanded={openReportId === r.id}
              onToggle={() =>
                setOpenReportId((prev) => (prev === r.id ? null : r.id))
              }
            />
          ))}

          {composing ? (
            <ReportComposer
              taskId={taskId}
              onClose={() => setComposing(false)}
            />
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setComposing(true)}
              data-testid="task-reports-add"
            >
              <Plus size={14} />
              Add report
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ReportRow({
  report,
  taskId,
  expanded,
  onToggle,
}: {
  report: AgentReport;
  taskId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const del = useDeleteReport(taskId);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete report "${report.title}"?`)) return;
    try {
      await del.mutateAsync(report.id);
      toast.success("Report deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete report");
    }
  };

  return (
    <div
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/50"
      data-testid="task-report-row"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-[var(--hover-overlay)]/40 transition-colors rounded-md"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
            KIND_BADGE[report.kind]
          )}
        >
          {KIND_LABELS[report.kind]}
        </span>
        <span className="flex-1 text-[13px] truncate text-[var(--color-text)]">
          {report.title}
        </span>
        <span className="text-[11px] text-[var(--color-text-subtle)] whitespace-nowrap">
          {report.author ? `${report.author} · ` : ""}
          {relativeTime(report.created_at)}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete report"
          className="p-1 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--hover-overlay)]"
          data-testid="task-report-delete"
        >
          <Trash2 size={13} />
        </button>
      </button>
      {expanded ? (
        <div
          className="px-3 pb-3 pt-1 text-[12.5px] whitespace-pre-wrap font-mono leading-relaxed text-[var(--color-text-muted)]"
          data-testid="task-report-body"
        >
          {report.content}
        </div>
      ) : null}
    </div>
  );
}

function ReportComposer({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ReportKind>("memo");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const create = useCreateReport(taskId);

  const canSave = useMemo(
    () => title.trim().length > 0 && content.trim().length > 0,
    [title, content]
  );

  const submit = async () => {
    if (!canSave) return;
    try {
      await create.mutateAsync({
        kind,
        title: title.trim(),
        content,
      });
      toast.success("Report saved");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save report");
    }
  };

  return (
    <div
      className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-2.5"
      data-testid="task-report-composer"
    >
      <div className="flex items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ReportKind)}
          className="h-8 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-2 text-[12px] text-[var(--color-text)]"
          data-testid="task-report-kind"
        >
          {REPORT_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="flex-1"
          data-testid="task-report-title"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="p-1 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-[var(--hover-overlay)]"
        >
          <X size={14} />
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="Markdown report body — investigation results, analysis, plan, summary, review, or memo."
        className="rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] p-2 text-[12.5px] font-mono leading-relaxed text-[var(--color-text)] resize-y min-h-[100px]"
        data-testid="task-report-content"
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={!canSave || create.isPending}
        >
          {create.isPending ? "Saving…" : "Save report"}
        </Button>
      </div>
    </div>
  );
}
