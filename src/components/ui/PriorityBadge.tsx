import clsx from "clsx";
import { ActionItemPriority } from "@/types";

type Tone = "critical" | "warning" | "neutral";

const PRIORITY_CONFIG: Record<ActionItemPriority, { label: string; tone: Tone }> = {
  Critical: { label: "Critical", tone: "critical" },
  High: { label: "High", tone: "warning" },
  Medium: { label: "Medium", tone: "neutral" },
  Low: { label: "Low", tone: "neutral" },
};

const TONE_STYLES: Record<Tone, { color: string; background: string; border: string }> = {
  critical: {
    color: "var(--alert-critical)",
    background: "rgba(255, 59, 59, 0.12)",
    border: "rgba(255, 59, 59, 0.4)",
  },
  warning: {
    color: "var(--alert-warning)",
    background: "rgba(255, 184, 0, 0.12)",
    border: "rgba(255, 184, 0, 0.4)",
  },
  neutral: {
    color: "var(--text-muted)",
    background: "rgba(136, 136, 136, 0.16)",
    border: "rgba(136, 136, 136, 0.32)",
  },
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
  const tone = TONE_STYLES[config.tone];
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center rounded-full border uppercase tracking-[0.3em] font-semibold",
        SIZE_CLASSES[size],
        className,
      )}
      style={{ color: tone.color, backgroundColor: tone.background, borderColor: tone.border }}
    >
      {config.label}
    </span>
  );
}
