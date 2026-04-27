import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { File as FileIcon, Trash2, Upload, X } from "lucide-react";
import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { api, ApiError } from "../../lib/api.js";
import { qk } from "../../lib/query.js";
import { cn } from "../../lib/cn.js";
import type { TaskAttachment } from "../../lib/types.js";

interface Props {
  taskId: string;
}

const MAX_BYTES = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function TaskAttachments({ taskId }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<TaskAttachment | null>(null);

  const { data: attachments = [] } = useQuery({
    queryKey: qk.taskAttachments(taskId),
    queryFn: () => api.taskAttachments.list(taskId),
    enabled: Boolean(taskId),
  });

  const uploadOne = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        toast.error(`"${file.name}" is larger than 25 MB and was skipped.`);
        return;
      }
      try {
        await api.taskAttachments.upload(taskId, file);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.status === 413
              ? `"${file.name}" exceeds the 25 MB limit.`
              : err.message
            : err instanceof Error
              ? err.message
              : "Upload failed";
        toast.error(msg);
      }
    },
    [taskId]
  );

  const uploadMany = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      try {
        // Sequential uploads keep the on-disk filename collision counter
        // deterministic: dropping a.png + a.png yields a.png and a-2.png
        // rather than a-2.png racing past a.png.
        for (const f of Array.from(files)) {
          await uploadOne(f);
        }
        await qc.invalidateQueries({ queryKey: qk.taskAttachments(taskId) });
      } finally {
        setUploading(false);
      }
    },
    [qc, taskId, uploadOne]
  );

  const onPickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      await uploadMany(files);
      // Reset so the same file can be re-uploaded later.
      e.target.value = "";
    },
    [uploadMany]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        await uploadMany(files);
      }
    },
    [uploadMany]
  );

  const onDelete = useCallback(
    async (att: TaskAttachment) => {
      try {
        await api.taskAttachments.delete(taskId, att.id);
        await qc.invalidateQueries({ queryKey: qk.taskAttachments(taskId) });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [qc, taskId]
  );

  return (
    <div className="grid gap-2" data-testid="task-attachments">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-md border border-dashed px-3 py-3",
          "transition-colors duration-150",
          dragOver
            ? "border-[var(--color-accent)] bg-[var(--hover-overlay)]"
            : "border-[var(--color-border)]"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-[var(--color-text-subtle)]">
            Drop files here, or
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onPickFiles}
            disabled={uploading}
            data-testid="task-attachments-upload-button"
          >
            <Upload size={13} />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={onInputChange}
          data-testid="task-attachments-input"
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-[12px] text-[var(--color-text-subtle)]">
          No attachments yet.
        </p>
      ) : (
        <ul className="grid gap-1.5" data-testid="task-attachments-list">
          {attachments.map((att) => (
            <AttachmentRow
              key={att.id}
              attachment={att}
              taskId={taskId}
              onDelete={() => onDelete(att)}
              onOpenLightbox={() => setLightbox(att)}
            />
          ))}
        </ul>
      )}

      {lightbox ? (
        <Lightbox
          attachment={lightbox}
          taskId={taskId}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function AttachmentRow({
  attachment,
  taskId,
  onDelete,
  onOpenLightbox,
}: {
  attachment: TaskAttachment;
  taskId: string;
  onDelete: () => void;
  onOpenLightbox: () => void;
}) {
  const downloadUrl = api.taskAttachments.downloadUrl(taskId, attachment.id);
  const isImage = isImageMime(attachment.mime_type);

  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md",
        "border border-[var(--color-border)] px-2 py-1.5",
        "bg-[var(--surface-1)]"
      )}
      data-testid="task-attachment-row"
    >
      {isImage ? (
        <button
          type="button"
          onClick={onOpenLightbox}
          aria-label={`Preview ${attachment.filename}`}
          className="block h-9 w-9 overflow-hidden rounded-md bg-[var(--hover-overlay)]"
        >
          <img
            src={downloadUrl}
            alt={attachment.filename}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </button>
      ) : (
        <div
          className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--hover-overlay)] text-[var(--color-text-subtle)]"
          aria-hidden="true"
        >
          <FileIcon size={16} />
        </div>
      )}

      <div className="min-w-0">
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[13px] text-[var(--color-text)] hover:underline"
          title={attachment.filename}
        >
          {attachment.filename}
        </a>
        <div className="text-[11px] text-[var(--color-text-subtle)]">
          {formatSize(attachment.size_bytes)} · {attachment.mime_type}
        </div>
      </div>

      <IconButton
        label="Delete attachment"
        tone="danger"
        size="sm"
        onClick={onDelete}
        data-testid="task-attachment-delete"
      >
        <Trash2 size={14} />
      </IconButton>
    </li>
  );
}

function Lightbox({
  attachment,
  taskId,
  onClose,
}: {
  attachment: TaskAttachment;
  taskId: string;
  onClose: () => void;
}) {
  const url = api.taskAttachments.downloadUrl(taskId, attachment.id);
  const isImage = isImageMime(attachment.mime_type);
  if (!isImage) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${attachment.filename}`}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      data-testid="task-attachment-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X size={18} />
      </button>
      <img
        src={url}
        alt={attachment.filename}
        className="max-h-full max-w-full rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

