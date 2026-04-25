import { useCallback, useState } from "react";

/**
 * useState backed by localStorage. Reads the stored value on first render and
 * writes back on every change. Falls back to `defaultValue` when the key is
 * absent or the stored JSON is corrupt.
 *
 * Intentionally minimal — no cross-tab sync, no serialisation beyond
 * JSON.parse/stringify. For cross-device persistence use useSetting() instead.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setStateRaw] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStateRaw((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage quota exceeded or private browsing — degrade gracefully.
        }
        return next;
      });
    },
    [key]
  );

  return [state, setState];
}
