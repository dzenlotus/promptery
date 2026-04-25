/**
 * Shared types for the inheritance resolver.
 *
 * A task's effective context pulls from up to 6 layers. The specificity
 * ladder is used to deduplicate when the same prompt appears in more than
 * one layer — only the most-specific origin is kept in the resolved list.
 *
 *   direct        — attached to the task itself         (most specific)
 *   role          — from the task's active role
 *   column        — attached to the task's column
 *   column-role   — from the role assigned to the column
 *   board         — attached to the board
 *   board-role    — from the role assigned to the board (least specific)
 */

export type PromptOrigin =
  | "direct"
  | "role"
  | "column"
  | "column-role"
  | "board"
  | "board-role";

export const ORIGIN_SPECIFICITY: Record<PromptOrigin, number> = {
  direct: 6,
  role: 5,
  column: 4,
  "column-role": 3,
  board: 2,
  "board-role": 1,
};

export interface ResolvedPromptSource {
  type: "role" | "column" | "column-role" | "board" | "board-role";
  id: string;
  name: string;
}

export interface ResolvedPrompt {
  id: string;
  name: string;
  content: string;
  color: string | null;
  short_description?: string | null;
  origin: PromptOrigin;
  /** Non-null for every origin except "direct". Surfaces the carrier's name
   * so the UI can show "inherited from Backend Engineer role" tooltips. */
  source?: ResolvedPromptSource;
}

export interface ResolvedRole {
  id: string;
  name: string;
  content: string;
  color: string | null;
  /** Which layer contributed the role. The resolver walks task → column → board
   * and stops at the first layer that has one set. */
  source: "task" | "column" | "board";
}

export interface ResolvedTaskContext {
  task_id: string;
  role: ResolvedRole | null;
  prompts: ResolvedPrompt[];
}
