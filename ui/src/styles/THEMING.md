# Theming in Promptery

All color decisions come from CSS custom properties defined in `globals.css`.
The dark theme is the default (`:root`). The light theme overrides every token
inside `[data-theme="light"]`. There are no colour rules scattered in component
files — every component reads exclusively from the token ladder described below.

## Token reference

### Surface ladder (`--color-bg`, `--color-surface`, `--color-surface-raised`)

Three depth levels, warm near-black in dark / near-white in light.

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--color-bg` | `#17140f` | `#f4f1ec` | Page/canvas background |
| `--color-surface` | `#1f1c17` | `#ffffff` | Cards, sidebar panels |
| `--color-surface-raised` | `#28241e` | `#faf7f2` | Inputs, elevated sub-panels |

### Border ladder (`--color-border`, `--color-border-strong`)

White/black alpha so borders disappear on dark backgrounds naturally.

| Token | Dark | Light |
|---|---|---|
| `--color-border` | `rgba(255,255,255,0.08)` | `rgba(15,15,15,0.08)` |
| `--color-border-strong` | `rgba(255,255,255,0.14)` | `rgba(15,15,15,0.16)` |

### Text ladder (`--color-text`, `--color-text-muted`, `--color-text-subtle`)

Three-step hierarchy, all passing WCAG AA on their respective surface levels.

| Token | Dark | Light | Contrast use |
|---|---|---|---|
| `--color-text` | `#ece8e2` | `#1a1714` | Headings, primary labels |
| `--color-text-muted` | `#7a746a` | `#5d554c` | Secondary labels, placeholders |
| `--color-text-subtle` | `#544e46` | `#625b53` | Tertiary / decorative only |

### Accent family

Warm gold for all primary interactive surfaces (buttons, links, active rings).

| Token | Dark | Light |
|---|---|---|
| `--color-accent` | `#cd9b58` | `#a66a1f` |
| `--color-accent-hover` | `#dcaf73` | `#b87925` |
| `--color-accent-active` | `#b48241` | `#925618` |
| `--color-accent-soft` | `rgba(205,155,88,0.14)` | `rgba(166,106,31,0.14)` |
| `--color-accent-ring` | `rgba(205,155,88,0.32)` | `rgba(166,106,31,0.32)` |

### Semantic colours

| Token | Dark | Light |
|---|---|---|
| `--color-danger` | `#ff453a` | `#c23a30` |
| `--color-danger-hover` | `#ff6a61` | `#d3483e` |
| `--color-danger-soft` | `rgba(255,69,58,0.12)` | `rgba(194,58,48,0.10)` |
| `--color-success` | `#32d74b` | `#1f8e43` |

### State overlays (`--hover-overlay`, `--active-overlay`)

Uniform tint applied across every interactive element (ghost buttons, rows,
menu items). Using the same token everywhere ensures the hover and active feel
cohesive regardless of background.

| Token | Dark | Light |
|---|---|---|
| `--hover-overlay` | `rgba(255,255,255,0.05)` | `rgba(15,15,15,0.05)` |
| `--active-overlay` | `rgba(255,255,255,0.09)` | `rgba(15,15,15,0.09)` |

### Utility tokens

| Token | Purpose | Dark | Light |
|---|---|---|---|
| `--color-scrim` | Dialog/modal backdrop tint | `rgba(0,0,0,0.22)` | `rgba(0,0,0,0.14)` |
| `--color-scrollbar-thumb` | Scrollbar thumb resting | `rgba(255,255,255,0.15)` | `rgba(15,15,15,0.15)` |
| `--color-scrollbar-thumb-hover` | Scrollbar thumb hovered | `rgba(255,255,255,0.30)` | `rgba(15,15,15,0.30)` |
| `--color-on-accent` | Text on filled accent surface | `#ffffff` | `#ffffff` |
| `--color-on-warning` | Text on warning-coloured badges | `#000000` | `#000000` |
| `--color-preview-caption-bg` | Caption bar over preview tiles | `rgba(0,0,0,0.60)` | `rgba(0,0,0,0.55)` |
| `--color-preview-caption-text` | Text in preview caption bar | `#ffffff` | `#ffffff` |
| `--color-preview-badge-bg` | "Animated" badge background | `rgba(0,0,0,0.50)` | `rgba(0,0,0,0.45)` |
| `--color-preview-badge-text` | "Animated" badge text | `#ffffff` | `#ffffff` |

### Shadows

| Token | Dark | Light |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.35)` | `0 1px 2px rgba(15,15,15,0.06)` |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.40)` | `0 4px 16px rgba(15,15,15,0.08)` |
| `--shadow-lg` | `0 20px 40px rgba(0,0,0,0.50)` | `0 20px 40px rgba(15,15,15,0.12)` |

## How to add a new theme

1. Add a `[data-theme="your-theme"]` block in `globals.css` after the light-theme block.
2. Override every token listed in the tables above. Tokens not overridden inherit from `:root` (dark defaults).
3. Set `color-scheme: light` or `color-scheme: dark` to inform the browser which native controls to render.
4. Apply the attribute to `<html>` via `ThemeProvider.tsx`.

## Rules for new components

- Never use `text-white`, `bg-white`, `text-black`, `bg-black`, or hard-coded alpha utilities like `bg-white/10`.
- Choose the appropriate token from the ladders above.
- If no existing token fits, add a new one to both `:root` and `[data-theme="light"]` in `globals.css` and document it here.
- Exception: SVG icon `fill`/`stroke` literals (`fill-white`) are acceptable when the icon sits on a known filled surface (e.g. `fill-white` inside a solid accent button is fine).
