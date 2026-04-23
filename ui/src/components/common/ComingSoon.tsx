import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  testId?: string;
}

export function ComingSoon({ icon: Icon, title, description, testId }: Props) {
  return (
    <div
      data-testid={testId ?? "coming-soon"}
      className="h-full grid place-items-center p-8"
    >
      <div className="text-center max-w-[440px]">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
          <Icon size={22} className="text-[var(--color-text-muted)]" />
        </div>
        <h2 className="text-[22px] font-semibold tracking-tight mb-2">{title}</h2>
        <p className="text-[13px] text-[var(--color-text-muted)] leading-[1.55] mb-5">
          {description}
        </p>
        <div className="inline-flex px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--hover-overlay)] text-[12px] text-[var(--color-text-subtle)]">
          Coming in a future update
        </div>
      </div>
    </div>
  );
}
