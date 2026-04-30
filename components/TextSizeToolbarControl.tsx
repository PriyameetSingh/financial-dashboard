"use client";

import { FONT_SCALE_OPTIONS, useFontScale } from "@/components/FontScaleProvider";

type TextSizeToolbarControlProps = {
  compact?: boolean;
  /** Use on pale backgrounds (e.g. login page) instead of dark chrome */
  lightBackground?: boolean;
};

export default function TextSizeToolbarControl({
  compact = false,
  lightBackground = false,
}: TextSizeToolbarControlProps) {
  const { fontScale, setFontScale } = useFontScale();

  const labelClass = lightBackground
    ? "text-xs font-semibold uppercase tracking-[0.18em] text-slate-600"
    : "text-xs font-semibold uppercase tracking-[0.18em] text-(--text-on-dark-subtle)";

  return (
    <div className="flex items-center gap-2">
      <span className={labelClass}>Text size</span>
      <div
        className={[
          "inline-flex items-center rounded-full border p-1",
          lightBackground
            ? "border-slate-200 bg-white shadow-sm"
            : "border-(--border) bg-(--bg-card)",
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
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                compact ? "min-w-[40px]" : "min-w-[74px]",
                active
                  ? lightBackground
                    ? "bg-slate-800 text-white"
                    : "bg-(--sidebar-active-bg) text-(--sidebar-text-primary)"
                  : lightBackground
                    ? "text-slate-600 hover:bg-slate-100"
                    : "text-(--text-secondary) hover:bg-(--bg-content-surface)",
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
