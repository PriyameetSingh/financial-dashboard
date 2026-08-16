import clsx from "clsx";

interface PendingBadgeProps {
  count: number;
  label?: string;
  className?: string;
}

export default function PendingBadge({ count, label = "Pending", className }: PendingBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-[var(--color-divider)] bg-[var(--ax-hover)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--color-text)]",
        className,
      )}
    >
      <span className="text-[11px] font-bold text-[var(--color-text)]">{count}</span>
      {label}
    </span>
  );
}
