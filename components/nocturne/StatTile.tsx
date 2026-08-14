import type { ReactNode } from "react";

/**
 * A KPI stat tile — kicker, value, and either a progress meter or a footnote.
 *
 * Two accessibility decisions worth keeping:
 *
 *   - The meter is a real `role="progressbar"` with its `aria-valuenow`, not a
 *     pair of decorative divs. The bar is often the only place the proportion
 *     appears; drawn as decoration it is invisible to a screen reader.
 *   - `flagged` draws an accent edge AND expects the caller to pass a status
 *     tag. The edge alone would signal "at risk" by colour only.
 *
 * The percentage is clamped rather than trusted: a utilisation figure over 100
 * is a real thing in this product's data, and an unclamped bar would render
 * wider than its track.
 */
export type StatTileProps = {
  kicker: ReactNode;
  value: ReactNode;
  /** 0-100. Renders the progress meter when present. */
  percent?: number;
  /** Accessible description of what the meter measures. */
  meterLabel?: string;
  /** Small print under the value — a threshold, a denominator. */
  footnote?: ReactNode;
  /** Trailing content beside the value, normally a status tag. */
  badge?: ReactNode;
  /** Draws the accent edge that marks a tile needing attention. */
  flagged?: boolean;
  className?: string;
};

export default function StatTile({
  kicker,
  value,
  percent,
  meterLabel,
  footnote,
  badge,
  flagged = false,
  className,
}: StatTileProps) {
  const clamped = percent === undefined ? undefined : Math.max(0, Math.min(100, percent));

  return (
    <div className={["ax-stat", flagged ? "ax-stat-flagged" : null, className].filter(Boolean).join(" ")}>
      <div className="ax-stat-kicker">{kicker}</div>
      {badge ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="ax-stat-value">{value}</span>
          {badge}
        </div>
      ) : (
        <div className="ax-stat-value">{value}</div>
      )}
      {clamped !== undefined ? (
        <div
          className="ax-meter"
          role="progressbar"
          aria-valuenow={Math.round(clamped)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={meterLabel}
        >
          <span style={{ ["--ax-meter-fill" as string]: `${clamped}%` }} />
        </div>
      ) : null}
      {footnote ? <div className="ax-stat-foot">{footnote}</div> : null}
    </div>
  );
}
