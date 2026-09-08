"use client";

import {
  BRAND_SWATCHES,
  FileDrop,
  InlineAlert,
  Tag,
  contrastRatio,
  formatContrastRatio,
  themeGround,
} from "@/components/nocturne";
import type { StepProps } from "../types";

/**
 * Step 2 — the tenant's identity.
 *
 * The brand colour is checked against the ground as it is picked, and the
 * verdict is shown as a number and a word, never as a colour. A contrast
 * warning that is itself signalled by red text would be an unusually direct
 * self-contradiction. It is provisioned for real: `configFromDraft` writes it
 * to `themeOverrides.dark["--color-accent"]`, so the colour chosen here is
 * the colour the workspace launches with.
 *
 * 3:1 is the floor because the accent carries chrome, lines, marks and large
 * text — the same threshold `THEME_ROLES` applies in the design system, read
 * from one place so the wizard and the configurator cannot disagree.
 *
 * STATED PLAINLY: the logo is not. `FileDrop` below captures a file name for
 * the review screen and nothing else — there is no upload pipeline to carry
 * the bytes anywhere, onboarding or otherwise. Rather than accept a file and
 * quietly forget it, this step says so once a name is chosen, and the launch
 * screen says it again — the same honesty the starter-data and people steps
 * already practice for their own not-yet-built parts.
 */
/**
 * The platform's dark ground — what the accent is read against. Taken from the
 * token layer rather than restated, so it cannot drift from what actually
 * renders.
 */
const GROUND = themeGround("dark");

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

      {draft.logoFileName ? (
        <InlineAlert assertive={false}>
          The file name is recorded, not the file. Uploading a logo is not built yet — your
          onboarding lead applies it to the workspace after launch.
        </InlineAlert>
      ) : null}

      <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend className="text-muted" style={{ fontSize: 12, padding: 0, marginBottom: 8 }}>
          Brand colour
        </legend>
        <div className="ax-wz-swatches">
          {BRAND_SWATCHES.map(({ name, value: hex }) => (
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
