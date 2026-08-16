import clsx from "clsx";
import { ActionItemPriority } from "@/types";

/**
 * An action item's priority, encoded by SHAPE as well as colour.
 *
 * This is the borrowed map-marker rule applied to the thing this product
 * actually has. The badge used to be a tinted pill in one of three colours, and
 * the colours were `rgba()` literals tuned for a white page — on the dark theme
 * they measured around 3.5:1, and on any tenant's palette they stayed the
 * platform's red and amber.
 *
 * Two things change and one deliberately does not:
 *
 *   The tint and foreground come from the chip tones, which are measured against
 *   the composited chip background in both themes rather than against the page.
 *
 *   Each level carries a mark whose SHAPE identifies it: triangle, star, rounded
 *   rectangle, circle, in descending urgency. That matters here more than
 *   anywhere else in the product, because the scale has FOUR levels and the tone
 *   mapping below only has three — Medium and Low have always shared the neutral
 *   tone, so before this the two were not distinguishable by colour at all, for
 *   any reader. The shape is what tells them apart now.
 *
 *   The tone mapping itself is unchanged: Critical is critical, High is warning,
 *   Medium and Low are neutral. Whether High deserves its own tone is a product
 *   question, and the reskin does not answer product questions.
 */

type Tone = "critical" | "warning" | "neutral";

const PRIORITY_CONFIG: Record<
  ActionItemPriority,
  { label: string; tone: Tone; shape: "critical" | "high" | "medium" | "low" }
> = {
  Critical: { label: "Critical", tone: "critical", shape: "critical" },
  High: { label: "High", tone: "warning", shape: "high" },
  Medium: { label: "Medium", tone: "neutral", shape: "medium" },
  Low: { label: "Low", tone: "neutral", shape: "low" },
};

const TONE_CHIP: Record<Tone, string> = {
  critical: "ax-chip-critical",
  warning: "ax-chip-warning",
  neutral: "",
};

const SIZE_CLASSES = {
  sm: "text-[9px] px-2 py-0.5",
  md: "text-[10px] px-2.5 py-1",
} as const;

type BadgeSize = keyof typeof SIZE_CLASSES;

interface PriorityBadgeProps {
  priority: ActionItemPriority;
  size?: BadgeSize;
  className?: string;
  title?: string;
}

export default function PriorityBadge({ priority, size = "sm", className, title }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <span
      title={title}
      className={clsx(
        "ax-chip ax-priority",
        `ax-priority-${config.shape}`,
        TONE_CHIP[config.tone],
        "uppercase tracking-[0.3em] font-semibold",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {/* Decorative: the label beside it already says the level, so announcing
          the mark as well would read the priority twice. */}
      <span className="ax-priority-mark" aria-hidden />
      {config.label}
    </span>
  );
}
