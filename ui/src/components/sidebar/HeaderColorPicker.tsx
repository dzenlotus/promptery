import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { ColorDot } from "./ColorDot.js";
import { ColorSwatchGrid } from "./ColorSwatchGrid.js";

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export function HeaderColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change color"
          title="Change color"
          data-testid="entity-editor-color-trigger"
          className="inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-[var(--hover-overlay)] transition-colors shrink-0"
        >
          <ColorDot color={value} size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1 min-w-0 w-auto">
        <ColorSwatchGrid
          value={value}
          onPick={(c) => {
            onChange(c);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
