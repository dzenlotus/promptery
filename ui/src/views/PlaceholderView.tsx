import { Settings } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";

export function PlaceholderView() {
  return (
    <PageLayout
      mainContent={
        <div
          data-testid="placeholder-view-settings"
          className="h-full grid place-items-center"
        >
          <div className="text-center max-w-[360px]">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
              <Settings size={20} className="text-[var(--color-text-muted)]" />
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight mb-1.5">Settings</h2>
            <p className="text-[13px] text-[var(--color-text-muted)]">Coming soon.</p>
          </div>
        </div>
      }
    />
  );
}
