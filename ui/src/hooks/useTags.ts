import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { qk } from "../lib/query.js";
import type { Tag } from "../lib/types.js";

/** All tags (global). Sorted alphabetically by the backend. */
export function useTags() {
  return useQuery({
    queryKey: qk.tags,
    queryFn: () => api.tags.list(),
  });
}

/** Single tag (with its prompts). */
export function useTag(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.tag(id ?? ""),
    queryFn: () => api.tags.get(id!),
    enabled: Boolean(id),
  });
}

/**
 * Per-prompt tag chip data, keyed by `prompt_id`. Returns a Map so
 * sidebar-row renders can do a single lookup per prompt with no fallback
 * scan over `tags`. Prompts with zero tags appear as empty arrays — the
 * lookup returns `[]`, never `undefined` for known prompts.
 */
export function usePromptTagsMap(): {
  tagsByPrompt: Map<string, Tag[]>;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: qk.tagsByPrompt,
    queryFn: () => api.tags.byPrompt(),
  });

  const tagsByPrompt = useMemo(() => {
    const m = new Map<string, Tag[]>();
    if (data) {
      for (const row of data) m.set(row.prompt_id, row.tags);
    }
    return m;
  }, [data]);

  return { tagsByPrompt, isLoading };
}

/**
 * Convenience accessor for the current tag set of a single prompt. Falls
 * back to an empty array — the caller doesn't have to distinguish "not
 * loaded yet" from "no tags".
 */
export function usePromptTags(promptId: string | null | undefined): Tag[] {
  const { tagsByPrompt } = usePromptTagsMap();
  return useMemo(
    () => (promptId ? tagsByPrompt.get(promptId) ?? [] : []),
    [tagsByPrompt, promptId]
  );
}
