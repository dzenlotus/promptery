/**
 * Default values for all settings. Used when a setting is not yet set in DB.
 *
 * Mirror of src/shared/settingsDefaults.ts. The UI build (vite) cannot reach
 * outside ui/src, so this file is duplicated by design. Keep the two in sync.
 */

// Numeric defaults are widened to `number` so `useSetting(...)` hands callers
// a `(value: number) => void` setter rather than pinning them to a literal
// type like `100`. String defaults keep their narrow literal unions so the
// compiler still rejects unknown theme/type values.
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
} as const;

export type SettingKey = keyof typeof SETTINGS_DEFAULTS;

export function getDefault<K extends SettingKey>(key: K): (typeof SETTINGS_DEFAULTS)[K] {
  return SETTINGS_DEFAULTS[key];
}
