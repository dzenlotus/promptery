import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api.js";
import { qk } from "../lib/query.js";
import {
  SETTINGS_DEFAULTS,
  type SettingKey,
} from "../lib/settingsDefaults.js";

type SettingValue<K extends SettingKey> = (typeof SETTINGS_DEFAULTS)[K];

export function useSetting<K extends SettingKey>(key: K) {
  const qc = useQueryClient();

  const query = useQuery<SettingValue<K>>({
    queryKey: qk.setting(key),
    queryFn: async () => {
      try {
        const res = await api.settings.get(key);
        return res.value as SettingValue<K>;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return SETTINGS_DEFAULTS[key];
        }
        throw err;
      }
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: SettingValue<K>) => {
      const res = await api.settings.set(key, value);
      return res.value as SettingValue<K>;
    },
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey: qk.setting(key) });
      const previous = qc.getQueryData<SettingValue<K>>(qk.setting(key));
      qc.setQueryData(qk.setting(key), value);
      return { previous };
    },
    onError: (_err, _value, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(qk.setting(key), context.previous);
      }
    },
    onSuccess: (serverValue) => {
      // Write the server's authoritative response into the cache instead of
      // invalidating — avoids the needless GET-after-PUT round trip. The WS
      // `setting.changed` broadcast also fans this out to every other tab.
      qc.setQueryData(qk.setting(key), serverValue);
    },
  });

  return {
    value: (query.data ?? SETTINGS_DEFAULTS[key]) as SettingValue<K>,
    isLoading: query.isLoading,
    setValue: mutation.mutate,
    isPending: mutation.isPending,
  };
}

/**
 * Bulk-mutation helper for forms that touch many keys at once. Applies the
 * new values optimistically so dependent UI (preset grid, background layer)
 * flips in the same tick the user clicked, then rolls back on error.
 */
export function useSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: Record<string, unknown>) => api.settings.setBulk(entries),
    onMutate: async (entries) => {
      const keys = Object.keys(entries);
      await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: qk.setting(k) })));
      const previous = new Map<string, unknown>();
      for (const k of keys) {
        previous.set(k, qc.getQueryData(qk.setting(k)));
        qc.setQueryData(qk.setting(k), entries[k]);
      }
      return { previous };
    },
    onError: (_err, _entries, context) => {
      if (!context) return;
      for (const [k, v] of context.previous.entries()) {
        qc.setQueryData(qk.setting(k), v);
      }
    },
    onSuccess: (results) => {
      for (const r of results) {
        qc.setQueryData(qk.setting(r.key), r.value);
      }
    },
  });
}
