/**
 * The chart palette, as token references.
 *
 * WHY THESE ARE STRINGS AND NOT HEX. Recharts takes colours as props and puts
 * them on SVG elements as presentation attributes. Presentation attributes are
 * mapped into the CSS cascade, so `var()` resolves in them exactly as it does in
 * a stylesheet — which means a chart drawn from these follows the theme and the
 * tenant's own palette with no JavaScript reading computed styles and no
 * re-render on a theme change. (Verified in the browser this project audits in,
 * for attribute, class and inline-style forms alike.)
 *
 * WHY ONE MODULE. Before this, four screens each declared their own chart
 * colours — `#0d9488` in two of them, `#8884d8` (the Recharts demo purple) in a
 * third, `#2ecc71` and `#e74c3c` scattered through the entry forms. Every one of
 * those was invisible to the tenant theming and none of them had been checked
 * against the other series they were drawn beside. One module means the
 * colour-blind separation measured in `tests/nocturne-dataviz.test.ts` is a
 * property of the product rather than of whichever screen happened to be
 * written by someone who cared.
 *
 * PICK IN ORDER. `CATEGORICAL[0]` is the tenant accent, so a single-series chart
 * comes out in the tenant's own colour. Series after that are the tuned set, in
 * an order whose adjacent pairs are the furthest apart — take them from the
 * front rather than choosing "a nice green" from the middle.
 */

/** Distinct series with no inherent order: plan types, verticals, heads. */
export const CATEGORICAL = [
  "var(--dv-cat-1)",
  "var(--dv-cat-2)",
  "var(--dv-cat-3)",
  "var(--dv-cat-4)",
  "var(--dv-cat-5)",
  "var(--dv-cat-6)",
] as const;

/** Low → high on one hue. Reads in greyscale, which is the point of it. */
export const SEQUENTIAL = [
  "var(--dv-seq-1)",
  "var(--dv-seq-2)",
  "var(--dv-seq-3)",
  "var(--dv-seq-4)",
  "var(--dv-seq-5)",
] as const;

/** Deficit → neutral → surplus. Never the only signal: pair it with the figure. */
export const DIVERGING = {
  negative: "var(--dv-div-neg)",
  neutral: "var(--dv-div-mid)",
  positive: "var(--dv-div-pos)",
} as const;

/** Chart furniture: the parts that are not data. */
export const CHART_GRID = "var(--color-divider)";
export const CHART_AXIS = "var(--ax-muted)";
export const CHART_REFERENCE_LINE = "var(--ax-muted)";

/**
 * Tooltip chrome. An HTML box rather than SVG, so it takes the surface tokens
 * and the elevation the rest of the product uses — a tooltip that keeps a fixed
 * light background is the single most obvious way a themed chart gives itself
 * away on a dark page.
 */
export const CHART_TOOLTIP_STYLE = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  color: "var(--color-text)",
  fontSize: 12,
} as const;

export const CHART_TOOLTIP_LABEL_STYLE = { color: "var(--ax-muted)" } as const;

/**
 * The tone a signed change is drawn in.
 *
 * A helper rather than the same ternary at each call site, and it reproduces the
 * existing rule EXACTLY — `>= 0` is the positive tone, so a zero delta stays
 * green as it does today. Treating zero as neutral would read better, and is
 * deliberately not done here: that is a change to what the screen means, not to
 * how it looks, and this phase does not make those. Noted for product triage
 * alongside the fixed-red utilisation figure.
 */
export function deltaToneClass(value: number): string {
  return value >= 0 ? "ax-tone-ok" : "ax-tone-critical";
}
