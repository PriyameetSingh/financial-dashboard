"use client";

import { FONT_SCALE_OPTIONS, useFontScale } from "@/components/FontScaleProvider";

/**
 * `lightBackground` is gone.
 *
 * It existed because the login page was pale while the app chrome was dark, so
 * the control needed two hand-picked palettes. On Nocturne both are themed
 * surfaces and the control reads the same tokens on either, which is one of the
 * small simplifications the reskin buys: the caller no longer has to know what
 * it is being rendered on top of.
 */
type TextSizeToolbarControlProps = {
  compact?: boolean;
  vertical?: boolean;
};

export default function TextSizeToolbarControl({
  compact = false,
  vertical = false,
}: TextSizeToolbarControlProps) {
  const { fontScale, setFontScale } = useFontScale();

  const labelClass = "text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ax-muted)]";

  return (
    <div className={`flex ${vertical ? "flex-col items-stretch" : "items-center"} gap-2`}>
      <span className={labelClass}>Text size</span>
      <div
        className={[
          vertical ? "flex w-full" : "inline-flex",
          "items-center rounded-full border p-1",
          "border-[var(--color-divider)] bg-[var(--color-surface)]",
        ].join(" ")}
        role="group"
        aria-label="Set text size"
      >
        {FONT_SCALE_OPTIONS.map((option) => {
          const active = option.value === fontScale;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFontScale(option.value)}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition-colors text-center",
                vertical
                  ? "flex-1"
                  : compact
                    ? "min-w-[40px]"
                    : "min-w-[74px]",
                active
                  ? "bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)] text-[var(--color-text)]"
                  : "text-[var(--ax-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]",
              ].join(" ")}
            >
              {compact ? option.shortLabel : option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
