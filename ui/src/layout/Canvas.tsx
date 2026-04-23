import type { ReactNode } from "react";

export function Canvas({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="app-canvas"
      className="h-screen w-screen bg-[var(--color-bg)] grid grid-cols-[360px_1fr] gap-3 p-3 overflow-hidden"
    >
      {children}
    </div>
  );
}
