import Link from "next/link";
import clsx from "clsx";
import { UserRole } from "@/types";
import PendingBadge from "./PendingBadge";
import RoleBadge from "./RoleBadge";

interface ApprovalOwner {
  name: string;
  designation: string;
  role: UserRole;
}

interface ApprovalCardProps {
  title: string;
  description?: string;
  count: number;
  href?: string;
  owner?: ApprovalOwner;
  className?: string;
}

export default function ApprovalCard({ title, description, count, href, owner, className }: ApprovalCardProps) {
  const content = (
    <div
      className={clsx(
        "rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5 shadow-sm transition hover:border-[var(--ax-divider-strong)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ax-muted)]">Approval Queue</p>
          <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
        </div>
        <PendingBadge count={count} />
      </div>
      {description && <p className="mt-2 text-sm text-[var(--ax-muted)]">{description}</p>}
      {owner && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{owner.name}</p>
            <p className="text-xs text-[var(--ax-muted)]">{owner.designation}</p>
          </div>
          <RoleBadge role={owner.role} />
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
