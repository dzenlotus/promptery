import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Boxes, Trash2 } from "lucide-react";
import { useBoards } from "../hooks/useBoards.js";
import {
  useSpace,
  useSpaces,
  useUpdateSpace,
  useDeleteSpace,
  useMoveBoardToSpace,
} from "../hooks/useSpaces.js";
import { ApiError } from "../lib/api.js";
import { ROUTES } from "../lib/routes.js";
import { PageLayout } from "../layout/PageLayout.js";
import { SpacesList } from "../components/spaces/SpacesList.js";
import { Input } from "../components/ui/Input.js";
import { Button } from "../components/ui/Button.js";
import {
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "../components/ui/DropdownMenu.js";

const PREFIX_PATTERN = /^[a-z0-9-]{1,10}$/;

export function SpaceSettingsView() {
  return (
    <PageLayout
      sidebarContent={<SpacesList />}
      mainContent={<SpaceSettingsBody />}
    />
  );
}

function SpaceSettingsBody() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: detail, isLoading } = useSpace(id);
  const { data: allSpaces = [] } = useSpaces();
  const { data: allBoards = [] } = useBoards();
  const update = useUpdateSpace();
  const remove = useDeleteSpace();
  const moveBoard = useMoveBoardToSpace();

  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [description, setDescription] = useState("");

  // Sync local form state with the loaded space — re-runs when the user
  // navigates between two different /s/:id pages without unmounting.
  useEffect(() => {
    if (!detail) return;
    setName(detail.name);
    setPrefix(detail.prefix);
    setDescription(detail.description ?? "");
  }, [detail?.id, detail?.name, detail?.prefix, detail?.description, detail]);

  const trimmedName = name.trim();
  const trimmedPrefix = prefix.trim();
  const prefixValid = PREFIX_PATTERN.test(trimmedPrefix);
  const dirty =
    detail !== undefined &&
    (trimmedName !== detail.name ||
      trimmedPrefix !== detail.prefix ||
      description.trim() !== (detail.description ?? ""));
  const canSave =
    detail !== undefined &&
    trimmedName.length > 0 &&
    prefixValid &&
    dirty &&
    !update.isPending;

  const boardsInSpace = useMemo(
    () => (detail ? allBoards.filter((b) => b.space_id === detail.id) : []),
    [allBoards, detail]
  );
  const otherSpaces = useMemo(
    () => (detail ? allSpaces.filter((s) => s.id !== detail.id) : []),
    [allSpaces, detail]
  );

  if (isLoading || !detail) {
    return (
      <div
        data-testid="space-settings-view"
        className="h-full grid place-items-center text-[var(--color-text-subtle)] text-[13px]"
      >
        {isLoading ? "Loading…" : "Space not found"}
      </div>
    );
  }

  const onSave = () => {
    if (!canSave) return;
    const patch: Parameters<typeof update.mutate>[0]["patch"] = {};
    if (trimmedName !== detail.name) patch.name = trimmedName;
    if (trimmedPrefix !== detail.prefix) patch.prefix = trimmedPrefix;
    const newDesc = description.trim();
    if (newDesc !== (detail.description ?? "")) {
      patch.description = newDesc.length > 0 ? newDesc : null;
    }
    update.mutate(
      { id: detail.id, patch },
      {
        onSuccess: () => toast.success("Space updated"),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            toast.error(`Prefix "${trimmedPrefix}" is already in use`);
          } else {
            toast.error(err instanceof Error ? err.message : "Failed to save");
          }
        },
      }
    );
  };

  const onReset = () => {
    setName(detail.name);
    setPrefix(detail.prefix);
    setDescription(detail.description ?? "");
  };

  const onDelete = () => {
    if (detail.is_default) return;
    if (boardsInSpace.length > 0) {
      toast.error(
        `This space contains ${boardsInSpace.length} board(s). Move them first.`
      );
      return;
    }
    if (!window.confirm(`Delete space "${detail.name}"?`)) return;
    remove.mutate(detail.id, {
      onSuccess: () => {
        toast.success("Space deleted");
        setLocation(ROUTES.home, { replace: true });
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Failed to delete"),
    });
  };

  const onMoveBoard = (boardId: string, destSpaceId: string) => {
    moveBoard.mutate(
      { boardId, spaceId: destSpaceId },
      {
        onSuccess: (res) => {
          toast.success(
            res.reslugged_count > 0
              ? `Moved board — re-slugged ${res.reslugged_count} task(s)`
              : "Moved board"
          );
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to move board"),
      }
    );
  };

  return (
    <div
      data-testid="space-settings-view"
      data-space-id={detail.id}
      className="h-full overflow-y-auto p-8 max-w-3xl"
    >
      <header className="mb-6 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
          <Boxes size={16} className="text-[var(--color-text-muted)]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] truncate">
            {detail.name}
          </h1>
          <p className="text-[13px] text-[var(--color-text-muted)]">
            {detail.is_default
              ? "Default space — system-managed"
              : `Slug prefix: ${detail.prefix}`}
          </p>
        </div>
      </header>

      <section className="space-y-6">
        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="space-settings-name"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] text-[var(--color-text-muted)]">
              Prefix
            </label>
            <span className="text-[10px] text-[var(--color-text-subtle)]">
              renaming does not re-slug existing tasks
            </span>
          </div>
          <Input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toLowerCase())}
            disabled={detail.is_default}
            data-testid="space-settings-prefix"
            aria-invalid={!prefixValid ? true : undefined}
          />
          {detail.is_default && (
            <span className="text-[11px] text-[var(--color-text-subtle)]">
              The default space's prefix is fixed at <code>task</code>.
            </span>
          )}
          {!detail.is_default && !prefixValid && (
            <span className="text-[11px] text-[var(--color-danger)]">
              1–10 chars, lowercase letters, digits, or hyphens.
            </span>
          )}
        </div>

        <div className="grid gap-1.5">
          <label className="text-[12px] text-[var(--color-text-muted)]">
            Description
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What lives in this space?"
            data-testid="space-settings-description"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onSave} disabled={!canSave}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button variant="ghost" onClick={onReset} disabled={!dirty || update.isPending}>
            Reset
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[15px] font-semibold tracking-tight mb-3">
          Boards in this space
        </h2>
        {boardsInSpace.length === 0 ? (
          <p className="text-[13px] text-[var(--color-text-subtle)]">
            No boards yet.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {boardsInSpace.map((b) => (
              <li
                key={b.id}
                data-testid={`space-settings-board-${b.id}`}
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 rounded-md bg-[var(--hover-overlay)]"
              >
                <button
                  className="text-left truncate text-[13px] tracking-tight"
                  onClick={() => setLocation(ROUTES.board(b.id))}
                >
                  {b.name}
                </button>
                {otherSpaces.length > 0 && (
                  <DropdownMenu>
                    <DropdownTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={moveBoard.isPending}>
                        Move to…
                      </Button>
                    </DropdownTrigger>
                    <DropdownContent align="end">
                      {otherSpaces.map((s) => (
                        <DropdownItem
                          key={s.id}
                          onSelect={() => onMoveBoard(b.id, s.id)}
                        >
                          {s.name}
                          <span className="ml-2 text-[10px] tabular-nums text-[var(--color-text-subtle)]">
                            {s.prefix}
                          </span>
                        </DropdownItem>
                      ))}
                    </DropdownContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!detail.is_default && (
        <section className="mt-10 pt-6 border-t border-[var(--color-border)]">
          <h2 className="text-[15px] font-semibold tracking-tight mb-2">
            Danger zone
          </h2>
          <p className="text-[12px] text-[var(--color-text-subtle)] mb-3">
            Delete this space. Refused while it still contains boards.
          </p>
          <Button
            variant="danger"
            onClick={onDelete}
            disabled={remove.isPending || boardsInSpace.length > 0}
          >
            <Trash2 size={14} />
            Delete space
          </Button>
        </section>
      )}
    </div>
  );
}
