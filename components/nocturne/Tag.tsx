import type { ReactNode } from "react";

/**
 * A small label tinted from the ramps.
 *
 * The `status` tones exist because this product's tags mostly carry status, and
 * status in a mono palette must never be hue alone — the design system is one
 * accent and a neutral, so "green means fine" is not available even in
 * principle. Every status tone therefore pairs its tint with a glyph, and the
 * component supplies the glyph rather than trusting each call site to remember:
 *
 *   ok      ✓  a filled neutral tint
 *   risk    △  a filled accent tint
 *   breach  !  an accent outline, the loudest of the three
 *
 * That also makes them legible in greyscale and to anyone with a colour vision
 * deficiency, which is the actual requirement behind WCAG 1.4.1.
 */
export type TagTone = "accent" | "accent-2" | "neutral" | "outline";
export type StatusTone = "ok" | "risk" | "breach";

const TONE_CLASS: Record<TagTone, string> = {
  accent: "tag tag-accent",
  "accent-2": "tag tag-accent-2",
  neutral: "tag tag-neutral",
  outline: "tag tag-outline",
};

const STATUS: Record<StatusTone, { glyph: string; tone: TagTone }> = {
  ok: { glyph: "✓", tone: "neutral" },
  risk: { glyph: "△", tone: "accent" },
  breach: { glyph: "!", tone: "outline" },
};

export type TagProps = {
  tone?: TagTone;
  className?: string;
  children: ReactNode;
};

export default function Tag({ tone = "neutral", className, children }: TagProps) {
  return <span className={[TONE_CLASS[tone], className].filter(Boolean).join(" ")}>{children}</span>;
}

export type StatusTagProps = {
  status: StatusTone;
  className?: string;
  children: ReactNode;
};

export function StatusTag({ status, className, children }: StatusTagProps) {
  const { glyph, tone } = STATUS[status];
  return (
    <Tag tone={tone} className={className}>
      {/* The glyph is decoration on top of the text, which already says what
          the status is — announcing "black up-pointing triangle" before the
          word "At risk" helps nobody. */}
      <span aria-hidden="true" style={{ marginInlineEnd: 4 }}>
        {glyph}
      </span>
      {children}
    </Tag>
  );
}
