import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import * as RadixScrollArea from "@radix-ui/react-scroll-area";
import { cn } from "../../lib/cn.js";

type RootProps = ComponentPropsWithoutRef<typeof RadixScrollArea.Root>;

interface ScrollAreaProps {
  children: ReactNode;
  /** Applied to the outer Root element. */
  className?: string;
  /** Applied to the Viewport — usually where sizing/padding goes. */
  viewportClassName?: string;
  /** Forwarded to the Viewport. Pass this when a hook needs the scrolling
   *  element (e.g. dnd-kit's `useDroppable({ ... }).setNodeRef`). */
  viewportRef?: React.Ref<HTMLDivElement>;
  orientation?: "vertical" | "horizontal" | "both";
  /** Radix auto-hide mode. Defaults to `hover` — show on hover + while
   *  scrolling, hide otherwise. */
  type?: RootProps["type"];
  /** Milliseconds after scroll activity before the bar fades out. */
  scrollHideDelay?: number;
  "data-testid"?: string;
}

/**
 * Custom scrollbar that stays narrow by default, grows on hover, and
 * auto-hides after a short idle window. Uses native scroll under the hood
 * via `@radix-ui/react-scroll-area` — keyboard, wheel, trackpad, and iOS
 * momentum behave exactly like the browser's own scrollbar. Because native
 * scroll stays in charge, it plays nicely with `@dnd-kit` auto-scroll.
 *
 * Apply this only where a polished look matters (the list in
 * bug #26: kanban board/column, sidebar sections, prompt editor,
 * prompt-group view). Elsewhere, leaving the browser default is fine.
 */
export function ScrollArea({
  children,
  className,
  viewportClassName,
  viewportRef,
  orientation = "vertical",
  type = "hover",
  scrollHideDelay = 900,
  "data-testid": testId,
}: ScrollAreaProps) {
  return (
    <RadixScrollArea.Root
      type={type}
      scrollHideDelay={scrollHideDelay}
      data-testid={testId}
      // `h-full` default — every consumer in this repo wants the scroll area
      // to fill its parent. Without it, Radix Root collapses to content
      // height because `overflow: hidden` + no explicit height suppresses
      // the grid `align-self: stretch` fallback in some layouts, which then
      // propagates down to the Viewport and kills the scroll. Callers that
      // want a fixed size pass `h-[240px]` etc. via className and it wins.
      className={cn("relative h-full overflow-hidden", className)}
    >
      <RadixScrollArea.Viewport
        ref={viewportRef}
        // `h-full w-full` lets the viewport fill whatever the parent sizes;
        // scroll distance comes from inner content being larger than this box.
        //
        // Radix wraps children in a sizer div with `display: table;
        // min-width: 100%` that breaks flex/grid descendants and percentage
        // heights. That sizer is forced to `display: block` globally in
        // `globals.css` (see the `[data-radix-scroll-area-viewport] > div`
        // rule). For horizontal scroll we still need the sizer to have an
        // explicit height so `h-full` chains cascade into columns that
        // depend on knowing their container's height.
        className={cn(
          "h-full w-full",
          (orientation === "horizontal" || orientation === "both") &&
            "[&>div]:!h-full",
          viewportClassName
        )}
      >
        {children}
      </RadixScrollArea.Viewport>

      {(orientation === "vertical" || orientation === "both") && (
        <ScrollBar orientation="vertical" />
      )}
      {(orientation === "horizontal" || orientation === "both") && (
        <ScrollBar orientation="horizontal" />
      )}
      {orientation === "both" && <RadixScrollArea.Corner />}
    </RadixScrollArea.Root>
  );
}

interface ScrollBarProps {
  orientation: "vertical" | "horizontal";
}

/**
 * The visible bar + thumb. Width/height grow on hover via CSS transitions
 * so the idle state stays unobtrusive (6px) and the active state is
 * comfortable to grab (12px).
 */
const ScrollBar = forwardRef<HTMLDivElement, ScrollBarProps>(
  function ScrollBar({ orientation }, ref) {
    return (
      <RadixScrollArea.Scrollbar
        ref={ref}
        orientation={orientation}
        // `touch-none select-none` — Radix recommends this for the bar area.
        // Idle state: a 3px hairline; hover state: 10px with a subtle
        // background so the grow-on-hover affordance reads.
        //
        className={cn(
          "flex touch-none select-none transition-[width,height,background-color] duration-150 ease-out",
          "data-[state=hidden]:opacity-0",
          "bg-transparent hover:bg-[var(--hover-overlay)]",
          orientation === "vertical" && "h-full w-[3px] hover:w-[10px]",
          orientation === "horizontal" && "w-full h-[3px] hover:h-[10px] flex-col"
        )}
      >
        <RadixScrollArea.Thumb
          className={cn(
            "relative flex-1 rounded-full transition-colors duration-150",
            "bg-[var(--color-scrollbar-thumb)] hover:bg-[var(--color-scrollbar-thumb-hover)]",
            // Invisible ≥44×44 hit target so the 3px bar is still easy to
            // grab — Radix recommends this pattern for thin scrollbars.
            "before:content-[''] before:absolute before:top-1/2 before:left-1/2",
            "before:h-full before:min-h-[44px] before:w-full before:min-w-[44px]",
            "before:-translate-x-1/2 before:-translate-y-1/2"
          )}
        />
      </RadixScrollArea.Scrollbar>
    );
  }
);
