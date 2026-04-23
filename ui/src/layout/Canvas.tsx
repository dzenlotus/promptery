import type { ReactNode } from "react";

export function Canvas({ children }: { children: ReactNode }) {
  // Transparent grid — the solid/gradient/animated BackgroundLayer renders
  // behind this and shows through the 12px gutters between panels and the
  // whole MainContent area (which carries no fill of its own). No explicit
  // z-index here: body's portal children (Radix popovers, dialogs) use
  // z-40+, and adding a stacking context on this element was shadowing them.
  return (
    <div
      data-testid="app-canvas"
      className="h-screen w-screen grid grid-cols-[360px_1fr] gap-3 p-3 overflow-hidden"
    >
      {children}
    </div>
  );
}
