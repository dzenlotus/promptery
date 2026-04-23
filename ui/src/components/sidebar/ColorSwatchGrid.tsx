import { cn } from "../../lib/cn.js";
import { ENTITY_COLORS } from "./colors.js";

interface Props {
  value: string;
  onPick: (color: string) => void;
}

export function ColorSwatchGrid({ value, onPick }: Props) {
  return (
    <div className="grid grid-cols-4 gap-1 p-1">
      {ENTITY_COLORS.map((c) => {
        const active = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
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
  );
}
