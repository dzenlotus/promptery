import { useTags } from "../../hooks/useTags.js";
import type { TagKind } from "../../lib/types.js";
import { SidebarSection } from "../../layout/SidebarSection.js";

interface Props {
  kind: TagKind;
  label: string;
}

export function TagsList({ kind, label }: Props) {
  const { data: tags = [], isLoading } = useTags(kind);

  return (
    <SidebarSection label={label}>
      {isLoading ? (
        <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">Loading…</div>
      ) : tags.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
          No {label.toLowerCase()} yet.
        </div>
      ) : (
        tags.map((t, i) => (
          <div
            key={t.id}
            className="grid grid-cols-[24px_1fr] items-center gap-2 h-9 px-3 rounded-md hover:bg-[var(--hover-overlay)] transition-colors"
          >
            <span className="text-[12px] tabular-nums text-[var(--color-text-subtle)]">
              #{i + 1}
            </span>
            <span className="truncate text-[13px] tracking-tight">{t.name}</span>
          </div>
        ))
      )}
    </SidebarSection>
  );
}
