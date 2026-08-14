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

## ⚠️ Incomplete — the Nocturne base stylesheet is missing

Every mockup opens with:

```html
<link rel="stylesheet" href="_ds/nocturne-6494dc40-8145-4703-99ea-8d6c8e984993/styles.css">
<script src="_ds/nocturne-6494dc40-8145-4703-99ea-8d6c8e984993/_ds_bundle.js"></script>
```

Neither file was exported, and `support.js` does not inline them. `tokens.css`
says so itself in its first line: *"layered over the Nocturne base stylesheet."*

**What is therefore undefined here:**

- **The default (dark) colour roles.** `tokens.css` defines `--color-bg`,
  `--color-surface`, `--color-text`, `--color-accent`, `--color-divider` and
  `--shadow-*` **only inside `[data-theme="light"]`**. Dark is the default
  theme — those values live in the missing stylesheet.
- **20 custom properties**: `--color-accent-{200,300,400,600,700,900}`,
  `--color-neutral-{400,500,600,700,900}`, `--color-section`, `--font-body`,
  `--font-heading`, `--radius-{sm,md,lg}`, `--space-{2,3,6,8}`.
- **~30 component classes** the markup renders through: `btn` (+`primary`,
  `secondary`, `ghost`, `icon`, `block`), `tag` (+`accent`, `neutral`,
  `outline`), `input`, `field`, `seg`, `seg-opt`, `radio`, `dot`, `table`,
  `card` (+`body`, `title`, `kicker`, `meta`), `dialog` (+`title`, `body`,
  `actions`), `elev-{sm,md,lg}`, `text-muted`.

Until `_ds/nocturne-…/styles.css` is exported, building S0 would mean inventing
the base scale — which is reconstructing the design, not implementing it.
