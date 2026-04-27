/**
 * Default values for all settings. Used when a setting is not yet set in DB.
 * Keys must be kept in sync with setSetting call sites across the codebase.
 *
 * This module is duplicated at ui/src/lib/settingsDefaults.ts because the
 * UI build (vite) cannot reach outside its own rootDir. When changing this
 * file, update the UI copy as well.
 */

// Numeric defaults are widened to `number` so settings consumers get a
// `(value: number) => void` setter rather than being pinned to a literal
// like `100`. String defaults keep their narrow literal unions.
export const SETTINGS_DEFAULTS = {
  "appearance.theme": "dark" as "dark" | "light" | "system",

  "appearance.background.type": "solid" as "solid" | "gradient" | "animated",
  "appearance.background.preset": "default" as string,
  "appearance.background.brightness": 100 as number,
  "appearance.background.contrast": 100 as number,
  "appearance.background.blur": 0 as number,
  "appearance.background.speed": 50 as number,
  "appearance.background.tint": "#000000" as string,

  "behavior.language": "en" as "en" | "ru",

  "data.backups.autoKeepDays": 30 as number,

  // Token-count badge controls (task #20). When `enabled` is false, every
  // TokenBadge call site is a no-op so power users who don't care about
  // token spend can hide them entirely. The three thresholds drive the
  // badge's green→yellow→orange→red colour ladder.
  "tokens.enabled": true as boolean,
  "tokens.threshold_yellow": 5000 as number,
  "tokens.threshold_orange": 15000 as number,
  "tokens.threshold_red": 30000 as number,
  "tokens.tokenizer": "cl100k_base" as "cl100k_base",
} as const;

export type SettingKey = keyof typeof SETTINGS_DEFAULTS;

export function getDefault<K extends SettingKey>(key: K): (typeof SETTINGS_DEFAULTS)[K] {
  return SETTINGS_DEFAULTS[key];
}
