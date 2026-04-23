import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { SettingsSidebar } from "../components/settings/SettingsSidebar.js";
import { useSetting, useSettingsMutation } from "../hooks/useSettings.js";
import { cn } from "../lib/cn.js";
import {
  ANIMATED_PRESETS,
  GRADIENT_PRESETS,
  SOLID_PRESETS,
  type AnimatedPreset,
  type GradientPreset,
  type SolidPreset,
} from "../background/presets.js";

type BackgroundType = "solid" | "gradient" | "animated";
type Theme = "dark" | "light" | "system";

export function SettingsAppearanceView() {
  return (
    <PageLayout
      sidebarContent={<SettingsSidebar />}
      mainContent={
        <div
          data-testid="settings-appearance-view"
          className="h-full overflow-y-auto p-8 max-w-3xl"
        >
          <header className="mb-6 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
              <Palette size={16} className="text-[var(--color-text-muted)]" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Appearance</h1>
              <p className="text-[13px] text-[var(--color-text-muted)]">
                Customise theme and background. Changes apply instantly.
              </p>
            </div>
          </header>

          <div className="space-y-10">
            <ThemeSection />
            <BackgroundSection />
            <AdjustmentsSection />
          </div>
        </div>
      }
    />
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
        {title}
      </h2>
      {hint && (
        <p className="text-[12px] text-[var(--color-text-subtle)] mt-1">{hint}</p>
      )}
    </div>
  );
}

function ThemeSection() {
  const { value: theme, setValue: setTheme } = useSetting("appearance.theme");
  const options: { id: Theme; label: string; icon: typeof Moon }[] = [
    { id: "dark", label: "Dark", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <section>
      <SectionTitle title="Theme" />
      <div className="grid grid-cols-3 gap-3">
        {options.map(({ id, label, icon: Icon }) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              data-testid={`theme-option-${id}`}
              aria-pressed={active}
              className={cn(
                "overflow-hidden flex flex-col items-center justify-center gap-2 h-[84px] rounded-lg border transition-colors duration-150 px-2",
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                  : "border-[var(--color-border)] bg-[var(--hover-overlay)] hover:bg-[var(--active-overlay)]"
              )}
            >
              <Icon
                size={18}
                className={active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}
              />
              <span className="text-[13px] tracking-tight truncate max-w-full">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function firstPresetOf(type: BackgroundType): string {
  if (type === "solid") return SOLID_PRESETS[0]!.id;
  if (type === "gradient") return GRADIENT_PRESETS[0]!.id;
  return ANIMATED_PRESETS[0]!.id;
}

function BackgroundSection() {
  const { value: type } = useSetting("appearance.background.type");
  const { value: preset, setValue: setPreset } = useSetting("appearance.background.preset");
  const bulk = useSettingsMutation();

  const tabs: { id: BackgroundType; label: string }[] = [
    { id: "solid", label: "Solid" },
    { id: "gradient", label: "Gradient" },
    { id: "animated", label: "Animated" },
  ];

  const switchType = (next: BackgroundType) => {
    if (next === type) return;
    // Preset ids are scoped to each type — picking a new type also picks a
    // fresh, type-valid preset in the same request so we never render a
    // mismatched pair for a frame.
    bulk.mutate({
      "appearance.background.type": next,
      "appearance.background.preset": firstPresetOf(next),
    });
  };

  return (
    <section>
      <SectionTitle title="Background" />

      <div
        role="tablist"
        className="inline-flex rounded-lg p-1 gap-1 bg-[var(--hover-overlay)] border border-[var(--color-border)] mb-5"
      >
        {tabs.map((t) => {
          const active = type === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              data-testid={`bg-type-${t.id}`}
              onClick={() => switchType(t.id)}
              className={cn(
                "px-3 h-8 rounded-md text-[12px] transition-colors duration-150",
                active
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {type === "solid" && (
        <PresetGrid
          type="solid"
          items={SOLID_PRESETS}
          activeId={preset}
          onSelect={setPreset}
        />
      )}
      {type === "gradient" && (
        <PresetGrid
          type="gradient"
          items={GRADIENT_PRESETS}
          activeId={preset}
          onSelect={setPreset}
        />
      )}
      {type === "animated" && (
        <PresetGrid
          type="animated"
          items={ANIMATED_PRESETS}
          activeId={preset}
          onSelect={setPreset}
        />
      )}
    </section>
  );
}

type PresetGridProps =
  | {
      type: "solid";
      items: SolidPreset[];
      activeId: string;
      onSelect: (id: string) => void;
    }
  | {
      type: "gradient";
      items: GradientPreset[];
      activeId: string;
      onSelect: (id: string) => void;
    }
  | {
      type: "animated";
      items: AnimatedPreset[];
      activeId: string;
      onSelect: (id: string) => void;
    };

function PresetGrid(props: PresetGridProps) {
  const { type, items, activeId, onSelect } = props;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {items.map((p) => {
        const active = activeId === p.id;
        const style =
          type === "solid"
            ? { backgroundColor: (p as SolidPreset).darkColor ?? (p as SolidPreset).color }
            : type === "gradient"
              ? { background: (p as GradientPreset).darkGradient ?? (p as GradientPreset).gradient }
              : { background: (p as AnimatedPreset).previewGradient };

        return (
          <button
            key={p.id}
            type="button"
            data-testid={`bg-preset-${p.id}`}
            aria-pressed={active}
            onClick={() => onSelect(p.id)}
            className={cn(
              // ring-inset keeps the accent outline inside the tile so it
              // never bleeds into the grid gap or neighbouring cards.
              "group relative h-[84px] rounded-lg overflow-hidden transition-all duration-150",
              active
                ? "ring-2 ring-inset ring-[var(--color-accent)]"
                : "ring-1 ring-inset ring-[var(--color-border)] hover:ring-[var(--color-border-strong)]"
            )}
          >
            <div className="absolute inset-0" style={style} />
            <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-black/60">
              <span className="block truncate text-[11px] text-white font-medium tracking-tight">
                {p.name}
              </span>
            </div>
            {type === "animated" && (
              <span className="absolute top-1.5 right-1.5 text-[9px] tracking-[0.1em] bg-black/50 text-white px-1.5 py-0.5 rounded backdrop-blur-sm uppercase font-medium">
                Animated
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function AdjustmentsSection() {
  const { value: type } = useSetting("appearance.background.type");
  const { value: brightness, setValue: setBrightness } = useSetting(
    "appearance.background.brightness"
  );
  const { value: contrast, setValue: setContrast } = useSetting(
    "appearance.background.contrast"
  );
  const { value: blur, setValue: setBlur } = useSetting("appearance.background.blur");
  const { value: speed, setValue: setSpeed } = useSetting("appearance.background.speed");
  const { value: tint, setValue: setTint } = useSetting("appearance.background.tint");

  const isAnimated = type === "animated";

  return (
    <section>
      <SectionTitle title="Adjustments" />

      <div className="space-y-5">
        <Slider
          testId="adj-brightness"
          label="Brightness"
          value={brightness}
          onChange={setBrightness}
          min={30}
          max={150}
          unit="%"
        />
        <Slider
          testId="adj-contrast"
          label="Contrast"
          value={contrast}
          onChange={setContrast}
          min={50}
          max={150}
          unit="%"
        />
        {/* Blur is a no-op on flat colour and static gradients — there's
             nothing to blur — so the control is hidden for those types
             instead of sitting there as dead weight. */}
        {isAnimated && (
          <Slider
            testId="adj-blur"
            label="Blur"
            value={blur}
            onChange={setBlur}
            min={0}
            max={30}
            unit="px"
          />
        )}
        {isAnimated && (
          <Slider
            testId="adj-speed"
            label="Animation speed"
            value={speed}
            onChange={setSpeed}
            min={10}
            max={150}
            unit="%"
          />
        )}
        {isAnimated && <TintRow tint={tint} setTint={setTint} />}
      </div>
    </section>
  );
}

/**
 * Slider with commit-on-release semantics. The handle shows the in-progress
 * value instantly so drag feedback stays smooth, but `onChange` (which maps
 * to a network PUT) only fires when the user lets go, presses a key, or
 * blurs the control. External changes (e.g. WS broadcast from another tab)
 * are allowed to overwrite the local draft only while the user isn't
 * actively editing.
 */
function Slider({
  label,
  value,
  onChange,
  min,
  max,
  unit,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit: string;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setDraft(value);
  }, [value]);

  const commit = () => {
    editingRef.current = false;
    if (draft !== value) onChange(draft);
  };

  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] text-[var(--color-text)]">{label}</label>
        <span className="text-[11px] text-[var(--color-text-subtle)] font-mono tabular-nums">
          {draft}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={draft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          editingRef.current = true;
          setDraft(Number(e.target.value));
        }}
        onPointerUp={commit}
        onPointerCancel={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-full accent-[var(--color-accent)] cursor-pointer"
      />
    </div>
  );
}

/**
 * Saturated tints that look good under the animated canvas's `mix-blend-mode:
 * overlay` at 22% — high chroma, mid lightness. One click wins over trying to
 * dial a hex value by eye for the common case.
 */
const TINT_PRESETS: { color: string; label: string }[] = [
  { color: "#ff6b35", label: "Warm orange" },
  { color: "#ffb700", label: "Gold" },
  { color: "#ff4d8d", label: "Rose" },
  { color: "#9d4edd", label: "Violet" },
  { color: "#3a86ff", label: "Blue" },
  { color: "#00b4a0", label: "Teal" },
  { color: "#50c878", label: "Emerald" },
];

const NONE_TINT = "#000000";

function TintRow({ tint, setTint }: { tint: string; setTint: (v: string) => void }) {
  const normalized = tint.toLowerCase();
  const isNone = normalized === NONE_TINT;
  const displayTint = isNone ? "none" : tint.toUpperCase();

  return (
    <div data-testid="adj-tint">
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="adj-tint-input" className="text-[13px] text-[var(--color-text)]">
          Tint color
        </label>
        <span className="text-[11px] text-[var(--color-text-subtle)] font-mono uppercase tabular-nums">
          {displayTint}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Custom picker — the circle IS the control. The real <input type="color">
            lives inside the label at opacity 0 so browsers still open the native
            picker when the circle is clicked. */}
        <label
          htmlFor="adj-tint-input"
          title={isNone ? "Add a custom colour" : `Custom: ${tint.toUpperCase()}`}
          className={cn(
            "relative h-8 w-8 rounded-full cursor-pointer border transition-colors duration-150 grid place-items-center",
            isNone
              ? "border-dashed border-[var(--color-border-strong)] bg-[var(--hover-overlay)] hover:bg-[var(--active-overlay)]"
              : "border-transparent shadow-[inset_0_0_0_1px_var(--color-border)]"
          )}
          style={isNone ? undefined : { backgroundColor: tint }}
        >
          {isNone && (
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="h-3.5 w-3.5 text-[var(--color-text-muted)]"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}
          <input
            id="adj-tint-input"
            data-testid="adj-tint-input"
            type="color"
            value={isNone ? "#808080" : tint}
            onChange={(e) => setTint(e.target.value)}
            aria-label="Custom tint colour"
            className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
          />
        </label>

        <span aria-hidden className="block h-5 w-px bg-[var(--color-border)] mx-0.5" />

        {/* "None" chip — explicit way to clear the tint back to unaffected. */}
        <button
          type="button"
          onClick={() => setTint(NONE_TINT)}
          title="No tint"
          aria-pressed={isNone}
          className={cn(
            "relative h-7 w-7 rounded-full border transition-colors duration-150 grid place-items-center",
            isNone
              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
              : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] bg-[var(--hover-overlay)]"
          )}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3 text-[var(--color-text-muted)]">
            <line
              x1="5"
              y1="19"
              x2="19"
              y2="5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {TINT_PRESETS.map((p) => {
          const active = normalized === p.color.toLowerCase();
          return (
            <button
              key={p.color}
              type="button"
              onClick={() => setTint(p.color)}
              title={p.label}
              aria-pressed={active}
              aria-label={p.label}
              style={{ backgroundColor: p.color }}
              className={cn(
                "h-7 w-7 rounded-full transition-all duration-150",
                active
                  ? "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-bg)] scale-110"
                  : "ring-1 ring-inset ring-black/10 hover:scale-110"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
