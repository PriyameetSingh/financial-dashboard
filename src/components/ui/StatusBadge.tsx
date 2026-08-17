import clsx from "clsx";
import { ActionItemStatus, FinancialEntryStatus, KPIStatus } from "@/types";

type StatusValue = ActionItemStatus | FinancialEntryStatus | KPIStatus;

type Tone = "critical" | "warning" | "success" | "neutral";

const STATUS_CONFIG: Record<StatusValue, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "neutral" },
  IN_PROGRESS: { label: "In Progress", tone: "warning" },
  PROOF_UPLOADED: { label: "Proof Uploaded", tone: "warning" },
  UNDER_REVIEW: { label: "Under Review", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "critical" },
  not_submitted: { label: "Not Submitted", tone: "neutral" },
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "warning" },
  submitted_pending: { label: "Pending Review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  submitted_this_week: { label: "Submitted This Week", tone: "success" },
  overdue: { label: "Overdue", tone: "critical" },
  not_started: { label: "Not Started", tone: "neutral" },
};

/**
 * The borrowed chip treatment, one class per tone.
 *
 * These were `rgba()` literals — a fixed red, amber, green and grey, tuned for a
 * white page and measuring around 3.5:1 on the dark theme. The chip tones read
 * the status tokens and a foreground measured against the tint itself, so both
 * themes hold and a tenant swap cannot strand them.
 *
 * `neutral` is the bare `ax-chip`: a tint of the page's own text colour. That is
 * the design system's answer to "no status", and it is deliberately not a grey
 * literal — a fixed grey is wrong on one of the two grounds by construction.
 */
const TONE_CHIP: Record<Tone, string> = {
  critical: "ax-chip-critical",
  warning: "ax-chip-warning",
  success: "ax-chip-ok",
  neutral: "",
};

const SIZE_CLASSES = {
  sm: "text-[9px] px-2 py-0.5",
  md: "text-[10px] px-2.5 py-1",
} as const;

type BadgeSize = keyof typeof SIZE_CLASSES;

interface StatusBadgeProps {
  status: StatusValue;
  size?: BadgeSize;
  className?: string;
}

export default function StatusBadge({ status, size = "sm", className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={clsx(
        "ax-chip",
        TONE_CHIP[config.tone],
        "uppercase tracking-[0.3em] font-semibold",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {config.label}
    </span>
  );
}
