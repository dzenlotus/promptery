import type { ReactNode } from "react";

/**
 * No animation on tab switch — the crossfade kept producing a perceptible flicker
 * in real-world conditions (React remount + data refetch overlapping the exit
 * animation). Instant swap is what the user asked for; if we want to reintroduce
 * motion later, it should be scoped to data, not the whole view.
 *
 * Content capped at 1280px and centered within the main area.
 */
export function MainContent({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="main-content"
      className="relative h-full overflow-hidden rounded-2xl"
    >
      <div className="h-full mx-auto w-full max-w-[1280px]">{children}</div>
    </div>
  );
}
