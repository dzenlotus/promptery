import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AgentReport, ReportKind } from "../lib/types.js";

/**
 * React Query keys for agent-report data. Centralised so route handlers and
 * the WebSocket dispatcher can invalidate the same buckets without digging
 * through string literals at the call site.
 */
export const reportsQk = {
  forTask: (taskId: string) => ["reports", "task", taskId] as const,
  one: (id: string) => ["report", id] as const,
  search: (query: string, limit: number) => ["reports", "search", query, limit] as const,
};

export function useReportsForTask(taskId: string | null | undefined) {
  return useQuery({
    queryKey: reportsQk.forTask(taskId ?? ""),
    queryFn: () => api.reports.listForTask(taskId as string),
    enabled: Boolean(taskId),
  });
}

export function useReport(id: string | null | undefined) {
  return useQuery({
    queryKey: reportsQk.one(id ?? ""),
    queryFn: () => api.reports.get(id as string),
    enabled: Boolean(id),
  });
}

interface CreateInput {
  kind: ReportKind;
  title: string;
  content: string;
  author?: string | null;
}

export function useCreateReport(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInput) => api.reports.create(taskId, input),
    onSuccess: (created: AgentReport) => {
      // Update list cache eagerly — WS will re-confirm but eager update keeps
      // the dialog responsive when the socket lags.
      qc.setQueryData<AgentReport[]>(reportsQk.forTask(taskId), (old) =>
        old ? [created, ...old] : [created]
      );
    },
  });
}

export function useUpdateReport(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { kind?: ReportKind; title?: string; content?: string };
    }) => api.reports.update(id, patch),
    onSuccess: (updated: AgentReport) => {
      qc.setQueryData(reportsQk.one(updated.id), updated);
      qc.setQueryData<AgentReport[]>(reportsQk.forTask(taskId), (old) =>
        old?.map((r) => (r.id === updated.id ? updated : r)) ?? []
      );
    },
  });
}

export function useDeleteReport(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.reports.delete(id),
    onSuccess: (_res, id) => {
      qc.setQueryData<AgentReport[]>(reportsQk.forTask(taskId), (old) =>
        old?.filter((r) => r.id !== id) ?? []
      );
    },
  });
}

export function useReportSearch(query: string, limit = 20, enabled = true) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: reportsQk.search(trimmed, limit),
    queryFn: () => api.reports.search(trimmed, limit),
    enabled: enabled && trimmed.length > 0,
  });
}
