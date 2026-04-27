import { ChevronDown, ChevronRight, Folder, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import {
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from "../ui/DropdownMenu.js";
import { IconButton } from "../ui/IconButton.js";
import { usePromptGroups } from "../../hooks/usePromptGroups.js";
import { useLocalStorage } from "../../hooks/useLocalStorage.js";
import { useTokenBadgeConfig } from "../../hooks/useTokenBadge.js";
import { TokenBadge } from "../common/TokenBadge.js";
import { cn } from "../../lib/cn.js";
import type { PromptGroup } from "../../lib/types.js";

// Show the first 4 groups by default so the section never takes more than
// about 120px of sidebar height. Everything else collapses behind a "show
// more" toggle.
const GROUPS_VISIBLE_DEFAULT = 4;

interface Props {
  onCreate: () => void;
  onEdit: (group: PromptGroup) => void;
  onDelete: (group: PromptGroup) => void;
}

export function PromptGroupsList({ onCreate, onEdit, onDelete }: Props) {
  const { data: groups = [], isLoading } = usePromptGroups();
  const [expanded, setExpanded] = useLocalStorage("sidebar.groups.expanded", false);
  const [location, setLocation] = useLocation();

  if (isLoading && groups.length === 0) {
    return (
      <div className="px-3 py-2 text-[12px] text-[var(--color-text-subtle)]">
        Loading groups…
      </div>
    );
  }

  const visibleGroups =
    expanded || groups.length <= GROUPS_VISIBLE_DEFAULT
      ? groups
      : groups.slice(0, GROUPS_VISIBLE_DEFAULT);
  const hiddenCount = groups.length - visibleGroups.length;

  return (
    <div className="grid gap-0.5">
      {visibleGroups.map((group) => {
        const active = location === `/prompts/groups/${group.id}`;
        return (
          <PromptGroupRow
            key={group.id}
            group={group}
            active={active}
            onSelect={() => setLocation(`/prompts/groups/${group.id}`)}
            onEdit={() => onEdit(group)}
            onDelete={() => onDelete(group)}
          />
        );
      })}

      {hiddenCount > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="px-3 py-1 text-left text-[11px] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] flex items-center gap-1"
        >
          <ChevronDown size={11} />
          Show {hiddenCount} more
        </button>
      )}
      {expanded && groups.length > GROUPS_VISIBLE_DEFAULT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="px-3 py-1 text-left text-[11px] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] flex items-center gap-1"
        >
          <ChevronRight size={11} className="rotate-90" />
          Collapse
        </button>
      )}

      <button
        type="button"
        onClick={onCreate}
        data-testid="prompt-group-create-trigger"
        className={cn(
          "mt-0.5 flex items-center gap-2 h-8 px-3 rounded-md text-[13px]",
          "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
          "hover:bg-[var(--hover-overlay)] transition-colors"
        )}
      >
        <FolderPlus size={14} />
        New group
      </button>
    </div>
  );
}

interface RowProps {
  group: PromptGroup;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function PromptGroupRow({ group, active, onSelect, onEdit, onDelete }: RowProps) {
  const color = group.color || "#7a746a";
  const tokenCfg = useTokenBadgeConfig();
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`prompt-group-row-${group.id}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        // Extra column for the optional token badge — slot collapses to
        // zero when tokens are disabled so layout doesn't shift.
        "group grid grid-cols-[16px_1fr_auto_auto_24px] items-center gap-2 h-8 px-3 rounded-md cursor-pointer",
        "transition-colors duration-150",
        active
          ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
          : "hover:bg-[var(--hover-overlay)] text-[var(--color-text)]"
      )}
    >
      <Folder size={13} style={{ color }} />
      <span className="truncate text-[13px] tracking-tight">{group.name}</span>
      <span className="text-[11px] tabular-nums text-[var(--color-text-subtle)]">
        {group.prompt_count}
      </span>
      {tokenCfg.enabled ? (
        <TokenBadge
          count={group.token_count ?? 0}
          thresholds={tokenCfg.thresholds}
          size="xs"
          testId={`prompt-group-token-badge-${group.id}`}
        />
      ) : (
        <span aria-hidden />
      )}
      <div className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownTrigger asChild>
            <IconButton
              label="Group actions"
              size="sm"
              onClick={(e) => e.stopPropagation()}
              data-testid={`prompt-group-actions-${group.id}`}
            >
              <PencilDots />
            </IconButton>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={onEdit}>
              <Pencil size={14} />
              Edit group
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={onDelete} danger>
              <Trash2 size={14} />
              Delete group
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * Compact three-dot affordance that matches the MoreHorizontal icon already
 * used elsewhere in the sidebar without pulling the icon in just for one
 * call site. Kept inline to stay close to its only consumer.
 */
function PencilDots() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
