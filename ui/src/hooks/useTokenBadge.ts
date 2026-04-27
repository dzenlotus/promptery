import { useSetting } from "./useSettings.js";
import type { TokenThresholds } from "../components/common/TokenBadge.js";

/**
 * Single hook that pulls the four `tokens.*` settings into one object so
 * call sites can render a `TokenBadge` without wiring four `useSetting`
 * calls. Returns `enabled: false` to short-circuit consumers that prefer
 * to skip badge rendering entirely when the user disabled them.
 */
export function useTokenBadgeConfig(): {
  enabled: boolean;
  thresholds: TokenThresholds;
} {
  const { value: enabled } = useSetting("tokens.enabled");
  const { value: yellow } = useSetting("tokens.threshold_yellow");
  const { value: orange } = useSetting("tokens.threshold_orange");
  const { value: red } = useSetting("tokens.threshold_red");

  return {
    enabled,
    thresholds: { yellow, orange, red },
  };
}
