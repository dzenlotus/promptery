import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover.js";
import { Chip } from "../ui/Chip.js";
import type { Role } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

interface Props {
  selectedRoleId: string | null;
  onChange: (roleId: string | null) => void;
  roles: Role[];
}

/**
 * Single-select picker for task roles. Creating roles isn't supported here —
 * that lives on the dedicated Roles page (when built).
 */
export function RoleSelector({ selectedRoleId, onChange, roles }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

  const onSelect = (roleId: string) => {
    onChange(roleId);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="role-selector"
          className={cn(
            "w-full min-h-9 rounded-md bg-[var(--color-surface-raised)]",
            "border border-[var(--color-border)] px-2 py-1.5 text-left",
            "flex items-center gap-1 outline-none"
          )}
        >
          {selected ? (
            <Chip
              name={selected.name}
              color={selected.color}
              size="sm"
              onRemove={() => onChange(null)}
              data-testid={`role-chip-${selected.id}`}
            />
          ) : (
            <span className="text-[13px] text-[var(--color-text-subtle)]">Select role…</span>
          )}
          <ChevronDown
            size={14}
            className="ml-auto text-[var(--color-text-subtle)] shrink-0"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={true} loop>
          <div className="border-b border-[var(--color-border)] px-2">
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search roles…"
              className="w-full h-9 bg-transparent outline-none text-[13px] placeholder:text-[var(--color-text-subtle)]"
            />
          </div>
          <Command.List className="max-h-[280px] overflow-y-auto scroll-thin py-1">
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
              Roles
            </div>
            <Command.Empty className="px-3 py-3 text-[12px] text-[var(--color-text-subtle)]">
              {roles.length === 0 ? "No roles yet. Create one in the Roles view." : "No matches"}
            </Command.Empty>
            <div className="flex flex-wrap gap-1.5 px-2 pb-2">
              {roles.map((r) => (
                // Feedback lives on the chip itself, not on a halo behind it:
                // a halo on `Command.Item` didn't align with the chip's
                // rounded-pill silhouette and leaked out around the edges
                // (visible as a bronze outline on hover / keyboard focus).
                // `rounded-full` on the wrapper keeps the click target snug
                // to the chip so the focus ring cmdk doesn't render its own.
                <Command.Item
                  key={r.id}
                  value={r.name}
                  onSelect={() => onSelect(r.id)}
                  className={cn(
                    "rounded-full outline-none cursor-pointer",
                    // cmdk writes data-selected="true" on the highlighted item.
                    // Darken the inner chip pill instead of wrapping it — the
                    // wrapper halo didn't match Chip's rounded-pill silhouette
                    // and leaked out the edges.
                    // Chip sets borderColor via inline style so we can only
                    // reach bg here; that's enough signal.
                    "[&[data-selected=true]>span]:bg-[var(--active-overlay)]",
                    // Currently-selected role: accent-tinted pill so you can
                    // see which one is active at a glance.
                    selectedRoleId === r.id && "[&>span]:bg-[var(--color-accent-soft)]"
                  )}
                >
                  <Chip name={r.name} color={r.color} size="sm" />
                </Command.Item>
              ))}
            </div>
            {selectedRoleId ? (
              <Command.Item
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "mx-1 mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer",
                  "border-t border-[var(--color-border)]",
                  "text-[13px] text-[var(--color-text-muted)]",
                  "data-[selected=true]:bg-[var(--hover-overlay)]"
                )}
              >
                <X size={14} />
                Clear selection
              </Command.Item>
            ) : null}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
