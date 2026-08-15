"use client";

import { FileDrop, Tag, contrastRatio, formatContrastRatio } from "@/components/nocturne";
import type { StepProps } from "../types";

/**
 * Step 2 — the tenant's identity.
 *
 * The brand colour is checked against the ground as it is picked, and the
 * verdict is shown as a number and a word, never as a colour. A contrast
 * warning that is itself signalled by red text would be an unusually direct
 * self-contradiction.
 *
 * 3:1 is the floor because the accent carries chrome, lines, marks and large
 * text — the same threshold `THEME_ROLES` applies in the design system, read
 * from one place so the wizard and the configurator cannot disagree.
 */
const SWATCHES: readonly (readonly [string, string])[] = [
  ["Nocturne blurple", "#9184d9"],
  ["River teal", "#5fa8a0"],
  ["Laterite", "#c2925c"],
  ["Slate blue", "#7f9cc9"],
  ["Rosewood", "#c07f92"],
  ["Graphite", "#9397ab"],
];

/** The platform's dark ground. What the accent is read against. */
const GROUND = "#161826";

export default function StepBranding({ draft, update }: StepProps) {
  const ratio = contrastRatio(draft.brandColor, GROUND);
  const passes = ratio !== null && ratio >= 3;

  return (
    <div className="ax-wz-fields">
      <FileDrop
        id="wz-logo"
        label={draft.logoFileName || "Drop your logo here, or choose a file"}
        hint="SVG or PNG · 2 MB max"
        accept="image/svg+xml,image/png"
        onFiles={(files) => update({ logoFileName: files[0]?.name ?? "" })}
      />

      <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend className="text-muted" style={{ fontSize: 12, padding: 0, marginBottom: 8 }}>
          Brand colour
        </legend>
        <div className="ax-wz-swatches">
          {SWATCHES.map(([name, hex]) => (
            <button
              key={hex}
              type="button"
              className="ax-wz-swatch"
              style={{ background: hex }}
              aria-pressed={draft.brandColor === hex}
              aria-label={name}
              onClick={() => update({ brandColor: hex })}
            />
          ))}
        </div>
      </fieldset>

      <div className="ax-row">
        <label htmlFor="wz-brand-custom" style={{ fontSize: 12 }}>
          Or pick your own
        </label>
        <input
          id="wz-brand-custom"
          type="color"
          value={draft.brandColor}
          onChange={(event) => update({ brandColor: event.target.value })}
          style={{ width: 40, height: 30, padding: 0, border: 0, background: "transparent" }}
        />
        {/* Announced as a status so the verdict reaches a screen reader when the
            colour changes, rather than only being visible. */}
        <span role="status">
          {ratio === null ? (
            <Tag tone="outline">Not measurable</Tag>
          ) : (
            <Tag tone={passes ? "neutral" : "outline"}>
              {passes ? "✓ Legible · " : "! Too faint · "}
              {formatContrastRatio(ratio)}
            </Tag>
          )}
        </span>
      </div>

      <p className="ax-wz-hint" style={{ fontSize: 13 }}>
        {passes
          ? "This colour is legible against the dark ground for lines, marks and buttons."
          : "This colour is too close to the page ground to read as an accent. Pick something with more contrast, or it will be hard to see for anyone with low vision."}
      </p>
    </div>
  );
}
