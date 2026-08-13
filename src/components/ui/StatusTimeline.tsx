import { ActionItemStatus, ActionItemUpdate } from "@/types";
import StatusBadge from "./StatusBadge";
import { tenantLocale } from "@/lib/tenant-config/format";

const DOT_COLORS: Record<ActionItemStatus, string> = {
  OPEN: "var(--text-muted)",
  IN_PROGRESS: "var(--alert-warning)",
  PROOF_UPLOADED: "var(--alert-warning)",
  UNDER_REVIEW: "var(--alert-warning)",
  COMPLETED: "var(--alert-success)",
  OVERDUE: "var(--alert-critical)",
};

interface StatusTimelineProps {
  updates: ActionItemUpdate[];
  className?: string;
}

function formatDate(timestamp: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleString(tenantLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function StatusTimeline({ updates, className }: StatusTimelineProps) {
  const sorted = [...updates].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className={className}>
      {sorted.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          No updates yet.
        </div>
      )}
      <div className="space-y-4">
        {sorted.map((update, index) => (
          <div key={`${update.timestamp}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: DOT_COLORS[update.status] ?? "var(--text-muted)" }}
              />
              {index < sorted.length - 1 && <span className="mt-1 h-full w-px bg-[var(--border)]" />}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={update.status} />
                <span className="text-xs text-[var(--text-muted)]">{formatDate(update.timestamp)}</span>
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{update.note}</p>
              <p className="text-xs text-[var(--text-muted)]">Updated by {update.actor}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
