import { cn } from "../../lib/cn.js";

interface Props {
  color: string;
  size?: number;
  className?: string;
}

export function ColorDot({ color, size = 8, className }: Props) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block rounded-full shrink-0", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
      }}
    />
  );
}
