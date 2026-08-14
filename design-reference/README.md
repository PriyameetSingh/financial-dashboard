# Design reference — source of truth for the net-new UI surfaces

Exported from the Claude Design project
`60ff9dd4-b5c8-48ae-b73e-f42b4474806a` on 2026-08-14.

These files are the **spec**. Build surfaces from them, not from prose
descriptions of them.

| File | Covers |
|---|---|
| `Airawat Platform.dc.html` | S1 landing page (`#top`, `#platform`, `#modules`, `#trust`, `#plans`) + demo workspace + the design-system configurator |
| `Onboarding.dc.html` | S2 wizard — 8 steps, save/resume via `localStorage` |
| `Menu Card.dc.html` | S3 menu-card configurator — capability catalogue, presets, build summary |
| `Component Gallery.dc.html` | S0 primitives, colour roles, data-viz palette, density + theme switch |
| `Control Plane.dc.html` | S4 — **out of scope** for this phase, kept for context |
| `tokens.css` | The token layer this repo must adopt |
| `support.js` | The `.dc.html` preview harness (not shipped) |

## Status: export complete

The design system lives under
`_ds/nocturne-6494dc40-8145-4703-99ea-8d6c8e984993/`:

| File | What it is |
|---|---|
| `styles.css` | **The stylesheet** — 294 lines: the `:root` token sheet, the base type layer and the full component layer |
| `readme.md` | The system's normative written guide (component inventory, interaction states, do/don't) |
| `_ds_manifest.json` | Machine-readable record of all 51 tokens with exact values, plus the card/template inventory |
| `_ds_bundle.js` | The component bundle — empty for this system (no scripted components) |
| `ds-eslint.json` | The system's ESLint config; usefully bans raw hex/px literals in consuming code |

The uploads arrived in two rounds and the second round's four files were
**rotated by one relative to their filenames** (the file named
`_ds_manifest.json` held the bundle, the one named `readme.md` held the
manifest, the one named `styles.css` held the readme). They are filed here under
names matching their actual contents. `styles.css` itself arrived in a third
round.

### Verification performed against `styles.css`

- **Custom properties**: 57 referenced across the five `.dc.html` mockups and
  `tokens.css`; 71 defined in `styles.css`. Every referenced property resolves —
  no dangling `var()`.
- **Component classes**: 32 used, 35 defined. The three apparent gaps are not
  gaps — `.dot` is defined as `.radio .dot` / `.radio input:checked + .dot`, and
  `.noct-nav` / `.noct-tab` are mockup-local classes declared in the mockups'
  own `<style>` blocks.
- **Normative rules present as written CSS**, not just as prose:
  `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`
  (line 121, plus three component-specific focus rules),
  `.btn:disabled { opacity: 0.45; cursor: not-allowed }` (line 148), and
  `.btn-primary` as `color` + `border-color` only — an outline, never a fill
  (line 149).

Nothing in this reference needs to be reconstructed from prose. Build the
surfaces from these files.

### The tokens (authoritative — mirrored from `_ds_manifest.json`)

| Token | Value | Kind |
|---|---|---|
| `--color-bg` | `#161826` | color |
| `--color-surface` | `#232532` | color |
| `--color-text` | `#e9e9ed` | font |
| `--color-accent` | `#9184d9` | color |
| `--color-accent-2` | `#a7a1db` | color |
| `--color-divider` | `color-mix(in srgb, #e9e9ed 16%, transparent)` | color |
| `--color-neutral-100` | `#f3f5fe` | color |
| `--color-neutral-200` | `#e4e7f5` | color |
| `--color-neutral-300` | `#cfd3e5` | color |
| `--color-neutral-400` | `#b2b6ca` | color |
| `--color-neutral-500` | `#9397ab` | color |
| `--color-neutral-600` | `#75798c` | color |
| `--color-neutral-700` | `#595d6c` | color |
| `--color-neutral-800` | `#3f424d` | color |
| `--color-neutral-900` | `#292b31` | color |
| `--color-accent-100` | `#f5f4ff` | color |
| `--color-accent-200` | `#e7e5fe` | color |
| `--color-accent-300` | `#d2cefd` | color |
| `--color-accent-400` | `#b5abfc` | color |
| `--color-accent-500` | `#968ae0` | color |
| `--color-accent-600` | `#796cbf` | color |
| `--color-accent-700` | `#5d5294` | color |
| `--color-accent-800` | `#423a6a` | color |
| `--color-accent-900` | `#2b2741` | color |
| `--color-accent-2-100` | `#f5f4ff` | color |
| `--color-accent-2-200` | `#e7e5fe` | color |
| `--color-accent-2-300` | `#d2cefd` | color |
| `--color-accent-2-400` | `#b5afe8` | color |
| `--color-accent-2-500` | `#9690c9` | color |
| `--color-accent-2-600` | `#7972a9` | color |
| `--color-accent-2-700` | `#5c5783` | color |
| `--color-accent-2-800` | `#423e5d` | color |
| `--color-accent-2-900` | `#2b293a` | color |
| `--color-section` | `#262a60` | color |
| `--color-section-glow` | `#353b80` | color |
| `--color-section-ghost` | `#4c5397` | color |
| `--font-heading` | `"Inter", system-ui, sans-serif` | font |
| `--font-heading-weight` | `500` | font |
| `--font-body` | `"Inter", system-ui, sans-serif` | font |
| `--space-1` | `2.8px` | spacing |
| `--space-2` | `5.6px` | spacing |
| `--space-3` | `8.4px` | spacing |
| `--space-4` | `11.2px` | spacing |
| `--space-6` | `16.8px` | spacing |
| `--space-8` | `22.4px` | spacing |
| `--radius-sm` | `4px` | radius |
| `--radius-md` | `8px` | radius |
| `--radius-lg` | `14px` | radius |
| `--shadow-sm` | `0 0 0 1px #3f424d` | shadow |
| `--shadow-md` | `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)` | shadow |
| `--shadow-lg` | `0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,0.65)` | shadow |

Density is 0.70× (hence the 2.8/5.6/8.4… spacing scale) and the base radius is
8px, both already baked into the values above.

### Normative rules the consuming token layer and primitives must preserve

- Primary buttons are an **accent outline on transparent, never a fill**.
- Keyboard focus is `outline: 2px solid var(--color-accent); outline-offset: 2px`
  on `:focus-visible` — never the browser default.
- Disabled controls drop to **45% opacity**.
- Hover/pressed tints come from the accent ramp (`-600` on light, `-400` on dark).
- Rules fade to transparent at their ends over 48px; short accent marks stay solid.
- Headings never exceed weight 500 — hierarchy is size and space.
- No pure black or white; no accent floods except `--color-section` grounds.
- Accent-to-ground is tuned to ~3:1 — fine for chrome and large text, **not for
  body copy**, which must use `--color-accent-300` on the dark ground.
