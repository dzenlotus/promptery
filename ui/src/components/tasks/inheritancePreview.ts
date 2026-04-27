import type { Prompt, Role, RoleWithRelations } from "../../lib/types.js";

export type LayerId = "board" | "column" | "task";

export interface LayerPromptEntry {
  promptId: string;
  /** "direct" — attached directly to the layer; "role" — inherited from
   *  the layer's role (if any). */
  origin: "direct" | "role";
  /** Role carrier for role-origin entries. Always set when origin === "role". */
  role?: { id: string; name: string; color: string | null };
  /** True when the prompt actually flows into the resolved context. False
   *  means it's being shadowed by a stronger layer's variant or — in the
   *  per-task override case — the user explicitly disabled it for this
   *  task. Prompts otherwise union across layers, so most rows read true.
   */
  applied: boolean;
  /** True when the user toggled this prompt off for the current task via
   *  the per-task override. Distinct from `!applied` — the latter also
   *  covers shadowing — so the UI can render a "disabled by user" badge
   *  separately from "shadowed". */
  disabledByOverride?: boolean;
}

export interface PreparedLayer {
  layerId: LayerId;
  /** Role assigned at this specific layer (null when none). */
  layerRole: Role | null;
  /** True when this layer's role is the *active* role (wins over the
   *  weaker layers). For the active-role layer, applied = true. */
  roleApplied: boolean;
  /** Prompts contributed by this layer, with live "applied" markers. */
  entries: LayerPromptEntry[];
}

interface Input {
  /** Staged local task role id (comes from TaskDialog draft state). */
  localRoleId: string | null;
  /** Staged local direct-prompt ids on the task. */
  localDirectIds: string[];
  /** Staged local set of prompts disabled via per-task overrides. The
   *  matching entries get `applied=false` + `disabledByOverride=true`. */
  localDisabledIds?: string[];
  /** Details already loaded for the active role — the role whose id is
   *  `localRoleId` (fetched via useRole by the caller). */
  taskRoleDetail?: RoleWithRelations | null;
  /** Column's direct prompts + role pointer + (fetched) role detail. */
  column: { role: Role | null; prompts: Prompt[]; roleDetail?: RoleWithRelations | null };
  /** Board's direct prompts + role pointer + (fetched) role detail. */
  board: { role: Role | null; prompts: Prompt[]; roleDetail?: RoleWithRelations | null };
}

/**
 * Pure-logic builder for the three-layer inheritance breakdown shown
 * inside TaskDialog. Given the staged local state (role + direct prompts)
 * and the already-loaded board / column / role details, produces one
 * `PreparedLayer` per level with live "applied vs shadowed" markers.
 *
 * Strength order, strongest first: task > column > board.
 *
 * Rules:
 *  - Active role wins at the strongest layer where a role is present.
 *    Weaker-layer roles are shown but marked as shadowed.
 *  - Prompts are unioned across every layer — a prompt that lives on
 *    the board AND the task truly appears in both places' context
 *    contributions, so it reads as applied (✓) in each layer it lists.
 *  - Dedup within a single layer: a prompt that appears both as direct
 *    and via the layer's role is shown once (direct wins).
 *
 * Keeping this a plain function makes it unit-testable without JSDOM /
 * react-query — the UI just wires inputs and renders the output.
 */
export function buildLayeredInheritance(input: Input): PreparedLayer[] {
  const layers: PreparedLayer[] = [];

  // ---- Build raw entries per layer -------------------------------------
  const boardEntries = composeLayerEntries({
    directPromptIds: (input.board.prompts ?? []).map((p) => p.id),
    role: input.board.role,
    roleDetail: input.board.roleDetail ?? null,
  });
  const columnEntries = composeLayerEntries({
    directPromptIds: (input.column.prompts ?? []).map((p) => p.id),
    role: input.column.role,
    roleDetail: input.column.roleDetail ?? null,
  });
  const taskEntries = composeLayerEntries({
    directPromptIds: input.localDirectIds,
    role: input.taskRoleDetail
      ? {
          id: input.taskRoleDetail.id,
          name: input.taskRoleDetail.name,
          content: input.taskRoleDetail.content,
          color: input.taskRoleDetail.color,
          created_at: input.taskRoleDetail.created_at,
          updated_at: input.taskRoleDetail.updated_at,
        }
      : input.localRoleId
        ? // The id is known but the detail hasn't arrived yet — show the
          // role section only once we can name it.
          null
        : null,
    roleDetail: input.taskRoleDetail ?? null,
  });

  // ---- Active role resolution: task > column > board -------------------
  // The backend's resolver (src/db/inheritance/resolveTaskContext.ts)
  // picks exactly ONE role, walking task → column → board and returning
  // the first one present. Mirror that here — but compare by role id, not
  // by layer. When a weaker layer points to the SAME role as the active
  // one (e.g. both column and task carry "backend-dev"), nothing is
  // actually being overridden — the effective role is still backend-dev —
  // so both rows read as applied. Only a DIFFERENT role at a weaker
  // layer is truly shadowed.
  //
  // Prompts, in contrast, are unioned across every layer at the backend
  // (dedup by id, but origin-tagged to the most specific layer). So a
  // prompt listed at board/column/task reads as applied at each one —
  // every layer genuinely contributes it.
  const activeRoleId: string | null =
    input.localRoleId ??
    input.column.role?.id ??
    input.board.role?.id ??
    null;

  const disabledIds = new Set(input.localDisabledIds ?? []);
  // Per-task override marks the prompt as suppressed in the resolved context
  // even though every layer that lists it still *contributes* it — the
  // override is applied as a final filter step, not a layer-level edit.
  const markEntries = (
    raw: ReturnType<typeof composeLayerEntries>
  ): LayerPromptEntry[] =>
    raw.map((e) => {
      const isDisabled = disabledIds.has(e.promptId);
      return {
        ...e,
        applied: !isDisabled,
        disabledByOverride: isDisabled,
      };
    });

  const taskLayerRole: Role | null = input.taskRoleDetail
    ? {
        id: input.taskRoleDetail.id,
        name: input.taskRoleDetail.name,
        content: input.taskRoleDetail.content,
        color: input.taskRoleDetail.color,
        created_at: input.taskRoleDetail.created_at,
        updated_at: input.taskRoleDetail.updated_at,
      }
    : null;

  layers.push({
    layerId: "board",
    layerRole: input.board.role,
    roleApplied: input.board.role ? input.board.role.id === activeRoleId : false,
    entries: markEntries(boardEntries),
  });
  layers.push({
    layerId: "column",
    layerRole: input.column.role,
    roleApplied:
      input.column.role ? input.column.role.id === activeRoleId : false,
    entries: markEntries(columnEntries),
  });
  layers.push({
    layerId: "task",
    layerRole: taskLayerRole,
    roleApplied: taskLayerRole ? taskLayerRole.id === activeRoleId : false,
    entries: markEntries(taskEntries),
  });

  return layers;
}

interface ComposeInput {
  directPromptIds: string[];
  role: Role | null;
  roleDetail: RoleWithRelations | null;
}

/**
 * Merge direct prompts and role prompts for a single layer, preferring
 * direct-origin on duplicate ids. Returned entries still need the
 * `applied` flag computed against the strictly-stronger layers.
 */
function composeLayerEntries(input: ComposeInput): Omit<LayerPromptEntry, "applied">[] {
  const seen = new Map<string, Omit<LayerPromptEntry, "applied">>();

  for (const id of input.directPromptIds) {
    if (!seen.has(id)) seen.set(id, { promptId: id, origin: "direct" });
  }

  if (input.role && input.roleDetail) {
    const roleRef = {
      id: input.roleDetail.id,
      name: input.roleDetail.name,
      color: input.roleDetail.color,
    };
    for (const p of input.roleDetail.prompts) {
      if (!seen.has(p.id)) {
        seen.set(p.id, { promptId: p.id, origin: "role", role: roleRef });
      }
    }
  }

  return Array.from(seen.values());
}
