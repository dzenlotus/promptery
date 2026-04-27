import { Hash } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { SettingsSidebar } from "../components/settings/SettingsSidebar.js";
import { useSetting } from "../hooks/useSettings.js";
import { TokenBadge } from "../components/common/TokenBadge.js";
import { cn } from "../lib/cn.js";

/**
 * Settings page for the token-count badge feature.
 *
 * Three knobs the user can tune live:
 *  1. Master enable/disable — flips every TokenBadge call site to a no-op.
 *  2. Three thresholds (yellow / orange / red) — drive the colour ladder.
 *  3. Tokenizer — locked to cl100k_base today (we ship js-tiktoken with that
 *     encoding only); the field is wired so a future model picker doesn't
 *     need a settings migration.
 */
export function SettingsTokensView() {
  return (
    <PageLayout
      sidebarContent={<SettingsSidebar />}
      mainContent={
        <div
          data-testid="settings-tokens-view"
          className="h-full overflow-y-auto p-8 max-w-3xl"
        >
          <header className="mb-6 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full grid place-items-center bg-[var(--hover-overlay)] border border-[var(--color-border)]">
              <Hash size={16} className="text-[var(--color-text-muted)]" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Tokens</h1>
              <p className="text-[13px] text-[var(--color-text-muted)]">
                Configure how prompt token counts are surfaced across the app.
              </p>
            </div>
          </header>

          <div className="space-y-10">
            <EnableSection />
            <ThresholdsSection />
            <TokenizerSection />
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

function EnableSection() {
  const { value, setValue } = useSetting("tokens.enabled");
  return (
    <section>
      <SectionTitle
        title="Show token badges"
        hint="Hide every badge in sidebars, role detail and the task dialog when off."
      />
      <button
        type="button"
        data-testid="tokens-enabled-toggle"
        aria-pressed={value}
        onClick={() => setValue(!value)}
        className={cn(
          "inline-flex items-center gap-3 px-4 h-10 rounded-lg border transition-colors duration-150 text-[13px]",
          value
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]"
            : "border-[var(--color-border)] bg-[var(--hover-overlay)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative h-4 w-7 rounded-full transition-colors duration-150",
            value
              ? "bg-[var(--color-accent)]"
              : "bg-[var(--color-border-strong)]"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-150",
              value ? "translate-x-3.5" : "translate-x-0.5"
            )}
          />
        </span>
        <span>{value ? "Token badges enabled" : "Token badges disabled"}</span>
      </button>
    </section>
  );
}

function ThresholdsSection() {
  const { value: yellow, setValue: setYellow } = useSetting("tokens.threshold_yellow");
  const { value: orange, setValue: setOrange } = useSetting("tokens.threshold_orange");
  const { value: red, setValue: setRed } = useSetting("tokens.threshold_red");

  return (
    <section>
      <SectionTitle
        title="Color thresholds"
        hint="Below the yellow threshold a count reads as neutral; each subsequent threshold steps the badge through yellow → orange → red."
      />
      <div className="grid gap-4">
        <NumberInput
          label="Yellow (warning) at"
          value={yellow}
          onChange={(v) => setYellow(v)}
          testId="tokens-threshold-yellow"
        />
        <NumberInput
          label="Orange (caution) at"
          value={orange}
          onChange={(v) => setOrange(v)}
          testId="tokens-threshold-orange"
        />
        <NumberInput
          label="Red (limit) at"
          value={red}
          onChange={(v) => setRed(v)}
          testId="tokens-threshold-red"
        />
      </div>

      <div className="mt-5">
        <SectionTitle title="Preview" />
        <div className="flex items-center gap-3 flex-wrap">
          {[
            Math.max(0, Math.floor(yellow / 2)),
            yellow,
            orange,
            red,
            red * 2,
          ].map((count, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1">
              <TokenBadge
                count={count}
                thresholds={{ yellow, orange, red }}
                size="sm"
                testId={`tokens-preview-${idx}`}
              />
              <span className="text-[10px] text-[var(--color-text-subtle)] tabular-nums">
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-3">
      <span className="text-[13px] text-[var(--color-text)]">{label}</span>
      <input
        type="number"
        min={0}
        step={1000}
        data-testid={testId}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next >= 0) onChange(Math.floor(next));
        }}
        className={cn(
          "w-32 h-9 px-3 rounded-md border bg-transparent text-right tabular-nums",
          "border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]",
          "text-[13px] text-[var(--color-text)]"
        )}
      />
    </label>
  );
}

function TokenizerSection() {
  const { value } = useSetting("tokens.tokenizer");
  return (
    <section>
      <SectionTitle
        title="Tokenizer"
        hint="Today only cl100k_base (GPT-4 / Claude family) is bundled — additional encoders will land here without a settings migration."
      />
      <div className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-[var(--color-border)] bg-[var(--hover-overlay)] text-[13px]">
        <code className="font-mono text-[12px] text-[var(--color-text)]">
          {value}
        </code>
        <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
          locked
        </span>
      </div>
    </section>
  );
}
