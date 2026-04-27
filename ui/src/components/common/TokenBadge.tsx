import { cn } from "../../lib/cn.js";

/**
 * Compact monospace badge that surfaces a token count, color-coded by size
 * (green / yellow / orange / red) against the user-configurable thresholds
 * surfaced via the `tokens.threshold_*` settings.
 *
 * Defaults match `src/shared/settingsDefaults.ts` so the badge can be
 * rendered without wiring settings everywhere — pages that care about user
 * thresholds pass them in explicitly via `useSetting()`.
 */
export const TOKEN_THRESHOLD_DEFAULTS = {
  yellow: 5000,
  orange: 15000,
  red: 30000,
} as const;

export interface TokenThresholds {
  yellow: number;
  orange: number;
  red: number;
}

interface Props {
  count: number;
  thresholds?: TokenThresholds;
  /** Tailwind size knob — 'xs' for sidebars, 'sm' for editor headers. */
  size?: "xs" | "sm";
  /** Optional tooltip to override the default ("N tokens"). */
  title?: string;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  testId?: string;
}

/**
 * Pretty-print a count: 1234 → "1.2k", 0 → "0", 999 → "999".
 *
 * The "k" cutoff is 1000 rather than the loose 10000 some apps use because
 * 5-digit literal counts are too wide for sidebar rows in our typography.
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  // One decimal under 10k, none after — keeps "1.2k" / "12k" / "150k" all
  // about the same visual width.
  if (count < 10_000) {
    const v = count / 1000;
    return `${v.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${Math.round(count / 1000)}k`;
}

type Severity = "neutral" | "yellow" | "orange" | "red";

function severityFor(count: number, t: TokenThresholds): Severity {
  if (count >= t.red) return "red";
  if (count >= t.orange) return "orange";
  if (count >= t.yellow) return "yellow";
  return "neutral";
}

const SEVERITY_CLASS: Record<Severity, string> = {
  // Neutral leans on the existing text-subtle palette so a bare prompt row
  // doesn't shout "I have a count!" — the badge reads as metadata.
  neutral:
    "text-[var(--color-text-subtle)] bg-[var(--hover-overlay)] border-[var(--color-border)]",
  // Saturated tints below pick from the broadly-supported amber/orange/red
  // tailwind palette rather than CSS custom properties. The whole point of
  // the badge is a quick at-a-glance read on token spend, so we want the
  // colour to land regardless of the user's theme tweaks.
  yellow:
    "text-amber-700 bg-amber-100 border-amber-300 dark:text-amber-200 dark:bg-amber-900/40 dark:border-amber-800/60",
  orange:
    "text-orange-700 bg-orange-100 border-orange-300 dark:text-orange-200 dark:bg-orange-900/40 dark:border-orange-800/60",
  red:
    "text-red-700 bg-red-100 border-red-300 dark:text-red-200 dark:bg-red-900/40 dark:border-red-800/60",
};

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  xs: "h-4 px-1 text-[10px]",
  sm: "h-5 px-1.5 text-[11px]",
};

export function TokenBadge({
  count,
  thresholds = TOKEN_THRESHOLD_DEFAULTS,
  size = "xs",
  title,
  className,
  onClick,
  testId,
}: Props) {
  const severity = severityFor(count, thresholds);
  const formatted = formatTokenCount(count);
  const tooltip = title ?? `${count.toLocaleString()} tokens`;

  return (
    <span
      data-testid={testId}
      data-severity={severity}
      onClick={onClick}
      title={tooltip}
      className={cn(
        "inline-flex items-center justify-center rounded border font-mono tabular-nums tracking-tight select-none",
        SIZE_CLASS[size],
        SEVERITY_CLASS[severity],
        onClick && "cursor-pointer hover:brightness-110",
        className
      )}
    >
      {formatted}
    </span>
  );
}
