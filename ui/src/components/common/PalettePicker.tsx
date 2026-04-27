import { cn } from "../../lib/cn.js";
import { ENTITY_PALETTE } from "../../lib/palette.js";

interface Props {
  /** Currently selected color (hex). */
  value: string;
  /** Called with the new hex string whenever the user picks a color. */
  onPick: (color: string) => void;
  /** Optional class applied to the wrapper element. */
  className?: string;
}

/**
 * Color picker that combines the curated ENTITY_PALETTE swatches with a
 * native `<input type="color">` fallback for full-freedom overrides.
 *
 * The palette swatches let users pick one of the 12 deterministic colors
 * quickly; the color input below lets them choose any hex value when the
 * palette isn't enough.
 */
export function PalettePicker({ value, onPick, className }: Props) {
  const normalised = value.toLowerCase();

  return (
    <div className={cn("grid gap-2", className)}>
      {/* Swatch grid — 12 palette colors, 6 per row */}
      <div
        role="group"
        aria-label="Color palette"
        className="grid grid-cols-6 gap-1 p-1"
      >
        {ENTITY_PALETTE.map((c) => {
          const active = c.toLowerCase() === normalised;
          return (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={active}
              onClick={() => onPick(c)}
              className={cn(
                "h-7 w-7 rounded-full grid place-items-center",
                "hover:bg-[var(--hover-overlay)] transition-colors"
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-full transition-transform",
                  active && "ring-2 ring-white/40 scale-110"
                )}
                style={{
                  backgroundColor: c,
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Custom color input */}
      <div className="flex items-center gap-2 px-1 pb-1">
        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-[var(--color-text-muted)] w-full">
          <span
            className="h-5 w-5 rounded-full shrink-0 border border-[var(--color-border)]"
            style={{
              backgroundColor: value,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
            }}
            aria-hidden="true"
          />
          <span>Custom</span>
          <input
            type="color"
            value={value.startsWith("#") ? value : "#888888"}
            onChange={(e) => onPick(e.target.value)}
            className="sr-only"
            aria-label="Custom color"
          />
          <span className="ml-auto font-mono text-[var(--color-text-subtle)]">
            {value}
          </span>
        </label>
      </div>
    </div>
  );
}
