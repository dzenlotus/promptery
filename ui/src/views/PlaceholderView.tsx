import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function PlaceholderView({ icon: Icon, title, description }: Props) {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center max-w-[360px]">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
          <Icon size={20} className="text-[var(--color-text-muted)]" />
        </div>
        <h2 className="text-[18px] font-semibold tracking-tight mb-1.5">{title}</h2>
        <p className="text-[13px] text-[var(--color-text-muted)]">
          {description ?? "Coming in v1."}
        </p>
      </div>
    </div>
  );
}
