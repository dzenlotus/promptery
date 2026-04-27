import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Database,
  Download,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { SettingsSidebar } from "../components/settings/SettingsSidebar.js";
import { Button } from "../components/ui/Button.js";
import { Dialog } from "../components/ui/Dialog.js";
import { api, ApiError } from "../lib/api.js";
import { qk } from "../lib/query.js";
import type { BackupInfo, ImportPreview } from "../lib/types.js";
import { cn } from "../lib/cn.js";

export function SettingsDataView() {
  return (
    <PageLayout
      sidebarContent={<SettingsSidebar />}
      mainContent={
        <div
          data-testid="settings-data-view"
          className="h-full overflow-y-auto p-8 max-w-3xl"
        >
          <header className="mb-6 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
              <Database size={16} className="text-[var(--color-text-muted)]" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Data</h1>
              <p className="text-[13px] text-[var(--color-text-muted)]">
                Export, import, and manage backups of your Promptery data.
              </p>
            </div>
          </header>

          <div className="space-y-10">
            <ExportSection />
            <ImportSection />
            <BackupsSection />
          </div>
        </div>
      }
    />
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Database;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)] mb-2 flex items-center gap-2">
        <Icon size={12} />
        {title}
      </h2>
      <p className="text-[13px] text-[var(--color-text-muted)]">{subtitle}</p>
    </div>
  );
}

function OptionRow({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-[var(--color-text)] cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
        className="h-4 w-4 rounded border border-[var(--color-border)] bg-[var(--hover-overlay)] accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}

function ExportSection() {
  const [includeBoards, setIncludeBoards] = useState(true);
  const [includeRoles, setIncludeRoles] = useState(true);
  const [includePrompts, setIncludePrompts] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const bundle = await api.data.exportBundle({
        includeBoards,
        includeRoles,
        includePrompts,
        includeSettings,
      });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `promptery-export-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section data-testid="data-export-section">
      <SectionHeader
        icon={Download}
        title="Export"
        subtitle="Download your data as JSON. Useful for backups or transferring between machines."
      />

      <div className="space-y-2 mb-4 mt-4">
        <OptionRow
          checked={includeBoards}
          onChange={setIncludeBoards}
          label="Boards, columns, tasks"
          testId="export-opt-boards"
        />
        <OptionRow
          checked={includeRoles}
          onChange={setIncludeRoles}
          label="Roles"
          testId="export-opt-roles"
        />
        <OptionRow
          checked={includePrompts}
          onChange={setIncludePrompts}
          label="Prompts, skills, MCP tools"
          testId="export-opt-prompts"
        />
        <OptionRow
          checked={includeSettings}
          onChange={setIncludeSettings}
          label="Settings (theme, preferences)"
          testId="export-opt-settings"
        />
      </div>

      <Button
        variant="primary"
        onClick={handleExport}
        disabled={isExporting}
        data-testid="export-button"
      >
        <Download size={14} />
        {isExporting ? "Exporting…" : "Download export"}
      </Button>
    </section>
  );
}

function ImportSection() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<"skip" | "rename">("rename");
  const [isApplying, setIsApplying] = useState(false);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setPreview(null);
    if (!f) {
      setFile(null);
      return;
    }
    setFile(f);
    try {
      const bundle = JSON.parse(await f.text());
      const next = await api.data.importPreview(bundle, strategy);
      setPreview(next);
      if (!next.format_ok) {
        toast.error(next.errors[0] ?? "Unsupported format");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? `Failed to parse file: ${err.message}` : "Failed to parse file"
      );
      setFile(null);
    }
  };

  const refreshPreview = async (nextStrategy: "skip" | "rename") => {
    setStrategy(nextStrategy);
    if (!file) return;
    try {
      const bundle = JSON.parse(await file.text());
      setPreview(await api.data.importPreview(bundle, nextStrategy));
    } catch {
      /* toast already raised above in the initial load path */
    }
  };

  const handleApply = async () => {
    if (!file) return;
    setIsApplying(true);
    try {
      const bundle = JSON.parse(await file.text());
      const result = await api.data.importApply(bundle, strategy);
      const summary = summariseImport(result);
      toast.success(`Imported: ${summary}`);
      setFile(null);
      setPreview(null);
      // Everything downstream reads from queries — blunt invalidation is fine.
      qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsApplying(false);
    }
  };

  const conflictCount = preview
    ? preview.counts.boards.conflicts +
      preview.counts.roles.conflicts +
      preview.counts.prompts.conflicts +
      preview.counts.skills.conflicts +
      preview.counts.mcp_tools.conflicts
    : 0;

  return (
    <section data-testid="data-import-section">
      <SectionHeader
        icon={Upload}
        title="Import"
        subtitle="Load a Promptery export file. Conflicts can be skipped or renamed."
      />

      <div className="mt-4 mb-4">
        <input
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          data-testid="import-file-input"
          className={cn(
            "text-[12px] text-[var(--color-text-muted)]",
            "file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0",
            "file:text-[12px] file:font-medium",
            "file:bg-[var(--hover-overlay)] file:text-[var(--color-text)]",
            "file:hover:bg-[var(--active-overlay)] file:cursor-pointer cursor-pointer"
          )}
        />
      </div>

      {preview && (
        <div
          data-testid="import-preview"
          className="mb-4 p-4 rounded-md bg-[var(--hover-overlay)] border border-[var(--color-border)]"
        >
          {!preview.format_ok ? (
            <div className="text-[13px] text-[var(--color-danger)]">
              {preview.errors.join("\n")}
            </div>
          ) : (
            <>
              <ul className="text-[13px] text-[var(--color-text)] space-y-1">
                <PreviewRow label="Boards" c={preview.counts.boards} />
                <PreviewRow label="Roles" c={preview.counts.roles} />
                <PreviewRow label="Prompts" c={preview.counts.prompts} />
                <PreviewRow label="Skills" c={preview.counts.skills} />
                <PreviewRow label="MCP tools" c={preview.counts.mcp_tools} />
                {preview.counts.settings.total > 0 && (
                  <li className="text-[var(--color-text-muted)]">
                    Settings: {preview.counts.settings.total} key
                    {preview.counts.settings.total === 1 ? "" : "s"} (upsert)
                  </li>
                )}
              </ul>

              {conflictCount > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)] mb-1.5">
                    Conflict resolution
                  </div>
                  <div className="inline-flex rounded-md border border-[var(--color-border)] overflow-hidden">
                    {(["skip", "rename"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        data-testid={`import-strategy-${s}`}
                        onClick={() => refreshPreview(s)}
                        className={cn(
                          "px-3 py-1 text-[12px] transition-colors",
                          strategy === s
                            ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                            : "text-[var(--color-text-muted)] hover:bg-[var(--active-overlay)]"
                        )}
                      >
                        {s === "skip" ? "Skip existing" : "Rename (keep both)"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {preview?.format_ok && (
        <Button
          variant="primary"
          onClick={handleApply}
          disabled={isApplying}
          data-testid="import-apply-button"
        >
          <Upload size={14} />
          {isApplying ? "Importing…" : "Apply import"}
        </Button>
      )}
    </section>
  );
}

function PreviewRow({
  label,
  c,
}: {
  label: string;
  c: { total: number; new: number; conflicts: number };
}) {
  if (c.total === 0) return null;
  return (
    <li>
      <span className="text-[var(--color-text)]">{label}:</span>{" "}
      <span className="text-[var(--color-text-muted)]">
        {c.new} new, {c.conflicts} conflict{c.conflicts === 1 ? "" : "s"}
      </span>
    </li>
  );
}

function summariseImport(result: {
  counts: {
    boards: { added: number; renamed: number };
    roles: { added: number; renamed: number };
    prompts: { added: number; renamed: number };
    skills: { added: number; renamed: number };
    mcp_tools: { added: number; renamed: number };
  };
}): string {
  const parts: string[] = [];
  const push = (label: string, added: number, renamed: number) => {
    if (added) parts.push(`${added} ${label}`);
    if (renamed) parts.push(`${renamed} ${label} renamed`);
  };
  push("boards", result.counts.boards.added, result.counts.boards.renamed);
  push("roles", result.counts.roles.added, result.counts.roles.renamed);
  push("prompts", result.counts.prompts.added, result.counts.prompts.renamed);
  push("skills", result.counts.skills.added, result.counts.skills.renamed);
  push(
    "MCP tools",
    result.counts.mcp_tools.added,
    result.counts.mcp_tools.renamed
  );
  return parts.length > 0 ? parts.join(", ") : "nothing new";
}

function BackupsSection() {
  const qc = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);

  const { data: backups = [], isLoading } = useQuery<BackupInfo[]>({
    queryKey: qk.backups,
    queryFn: () => api.data.listBackups(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.data.createBackup(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.backups });
      toast.success("Backup created");
    },
    onError: (err: Error) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "Backup failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => api.data.deleteBackup(filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.backups });
      toast.success("Backup deleted");
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  const restoreMutation = useMutation({
    mutationFn: (filename: string) => api.data.restoreBackup(filename),
    onSuccess: () => {
      setRestoreTarget(null);
      qc.invalidateQueries();
      toast.success("Restored — reloading…");
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    },
    onError: (err: Error) => {
      setRestoreTarget(null);
      toast.error(err instanceof ApiError ? err.message : err.message || "Restore failed");
    },
  });

  const sortedBackups = [...backups].sort((a, b) => b.created_at - a.created_at);

  return (
    <section data-testid="data-backups-section">
      <SectionHeader
        icon={Database}
        title="Backups"
        subtitle="Automatic backups are created daily when Promptery starts. Create manual backups anytime."
      />

      <div className="mb-4 mt-4">
        <Button
          variant="secondary"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          data-testid="create-backup-button"
        >
          <Plus size={14} />
          {createMutation.isPending ? "Creating…" : "Create backup now"}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-[13px] text-[var(--color-text-subtle)]">
          Loading backups…
        </div>
      ) : sortedBackups.length === 0 ? (
        <div className="text-[13px] text-[var(--color-text-subtle)]">
          No backups yet.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="backups-list">
          {sortedBackups.map((b) => (
            <li
              key={b.filename}
              data-testid={`backup-row-${b.filename}`}
              className="flex items-center justify-between gap-3 p-3 rounded-md bg-[var(--hover-overlay)] border border-[var(--color-border)]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-mono text-[var(--color-text)] truncate">
                  {b.filename}
                </div>
                <div className="text-[11px] text-[var(--color-text-subtle)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{formatAge(b.created_at)}</span>
                  <span aria-hidden>·</span>
                  <span>{formatBytes(b.size_bytes)}</span>
                  <span aria-hidden>·</span>
                  <span
                    className={cn(
                      "uppercase tracking-[0.08em] px-1.5 py-0.5 rounded text-[10px] font-medium",
                      b.reason === "manual" && "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
                      b.reason === "auto" && "bg-[var(--hover-overlay)] text-[var(--color-text-subtle)]",
                      b.reason === "pre-migration" && "bg-[var(--color-warning-soft,var(--hover-overlay))] text-[var(--color-text-muted)]",
                      b.reason === "pre-restore" && "bg-[var(--hover-overlay)] text-[var(--color-text-muted)]"
                    )}
                  >
                    {b.reason}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title="Restore from this backup"
                  onClick={() => setRestoreTarget(b)}
                  disabled={restoreMutation.isPending || deleteMutation.isPending}
                  data-testid={`restore-backup-button-${b.filename}`}
                  className="h-7 px-2 inline-flex items-center gap-1.5 rounded-md text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--hover-overlay)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={13} />
                  Restore
                </button>
                <button
                  type="button"
                  title="Delete backup"
                  onClick={() => deleteMutation.mutate(b.filename)}
                  disabled={deleteMutation.isPending || restoreMutation.isPending}
                  data-testid={`delete-backup-button-${b.filename}`}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open && !restoreMutation.isPending) setRestoreTarget(null);
        }}
        title="Restore backup?"
        description={
          restoreTarget
            ? `Restore from "${restoreTarget.filename}" (${formatAge(restoreTarget.created_at)}, ${formatBytes(restoreTarget.size_bytes)})`
            : undefined
        }
        size="sm"
        data-testid="restore-confirm-dialog"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRestoreTarget(null)}
              disabled={restoreMutation.isPending}
              data-testid="restore-cancel-button"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (restoreTarget) restoreMutation.mutate(restoreTarget.filename);
              }}
              disabled={restoreMutation.isPending}
              data-testid="restore-confirm-button"
            >
              <RotateCcw size={13} />
              {restoreMutation.isPending ? "Restoring…" : "Yes, restore"}
            </Button>
          </>
        }
      >
        <div className="py-2 text-[13px] text-[var(--color-text-muted)] space-y-2">
          <p>
            This will replace your current data with the selected backup. Your current state will be automatically snapshotted as a <strong className="text-[var(--color-text)] font-medium">pre-restore</strong> backup before the restore takes effect.
          </p>
          <p>The page will reload automatically once the restore is complete.</p>
        </div>
      </Dialog>
    </section>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatAge(createdAt: number): string {
  const diffMs = Date.now() - createdAt;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMon = Math.floor(diffDay / 30);
  if (diffMon < 12) return `${diffMon}mo ago`;
  return `${Math.floor(diffMon / 12)}y ago`;
}
