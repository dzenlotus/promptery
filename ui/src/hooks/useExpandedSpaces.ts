import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "promptery.spaces.expanded";

type Map = Record<string, boolean>;

/**
 * Persists per-space expand/collapse state in localStorage so the
 * sidebar's space tree stays the way the user left it across reloads
 * and route changes.
 *
 * Default behaviour: a space the user has never interacted with reads
 * as `expanded = true` (calling `isExpanded(spaceId)` on a missing key
 * returns true). Once the user toggles it, the choice is persisted.
 *
 * Cross-tab sync: a `storage` event listener picks up changes from
 * other tabs of the same origin so multiple windows stay in sync.
 */
export function useExpandedSpaces() {
  const [map, setMap] = useState<Map>(() => readMap());

  // Cross-tab + cross-window: any other tab updating the key flips this
  // tab's view immediately, no manual refresh needed.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setMap(readMap());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isExpanded = useCallback(
    (spaceId: string): boolean => {
      // Missing key reads as expanded — first-time users see their spaces
      // open by default, then any toggle is sticky.
      return map[spaceId] !== false;
    },
    [map]
  );

  const toggle = useCallback((spaceId: string) => {
    setMap((prev) => {
      const next = { ...prev, [spaceId]: prev[spaceId] === false ? true : false };
      writeMap(next);
      return next;
    });
  }, []);

  const setExpanded = useCallback((spaceId: string, expanded: boolean) => {
    setMap((prev) => {
      if ((prev[spaceId] !== false) === expanded) return prev;
      const next = { ...prev, [spaceId]: expanded };
      writeMap(next);
      return next;
    });
  }, []);

  return { isExpanded, toggle, setExpanded };
}

function readMap(): Map {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Map;
    }
    return {};
  } catch {
    // Any parse / quota error → treat as a fresh slate. Don't let a corrupt
    // value brick the sidebar.
    return {};
  }
}

function writeMap(map: Map): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage may be full or disabled (private mode in some browsers).
    // The runtime state still works for the lifetime of the tab — losing
    // persistence is acceptable.
  }
}
