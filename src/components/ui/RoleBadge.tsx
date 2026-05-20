import clsx from "clsx";
import { UserRole } from "@/types";

const ROLE_STYLES: Record<UserRole, { color: string; background: string; border: string }> = {
  [UserRole.ACS]: {
    color: "#1f3a93",
    background: "rgba(31, 58, 147, 0.15)",
    border: "rgba(31, 58, 147, 0.4)",
  },
  [UserRole.VERTICAL_HEAD]: {
    color: "#5b4fcf",
    background: "rgba(91, 79, 207, 0.15)",
    border: "rgba(91, 79, 207, 0.4)",
  },
  [UserRole.FA]: {
    color: "#1abc9c",
    background: "rgba(26, 188, 156, 0.15)",
    border: "rgba(26, 188, 156, 0.4)",
  },
  [UserRole.TASU]: {
    color: "#1abc9c",
    background: "rgba(26, 188, 156, 0.15)",
    border: "rgba(26, 188, 156, 0.4)",
  },
  [UserRole.NODAL_OFFICER]: {
    color: "#2ecc71",
    background: "rgba(46, 204, 113, 0.15)",
    border: "rgba(46, 204, 113, 0.4)",
  },
};

const SIZE_CLASSES = {
  sm: "text-[9px] px-2 py-0.5",
  md: "text-[10px] px-2.5 py-1",
} as const;

type BadgeSize = keyof typeof SIZE_CLASSES;

interface RoleBadgeProps {
  role: UserRole;
  size?: BadgeSize;
  className?: string;
}

const formatRole = (role: UserRole) =>
  role === UserRole.VERTICAL_HEAD ? "Vertical Head" : role.replace(/_/g, " ");

export default function RoleBadge({ role, size = "sm", className }: RoleBadgeProps) {
  const style = ROLE_STYLES[role];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border uppercase tracking-[0.3em] font-semibold",
        SIZE_CLASSES[size],
        className,
      )}
      style={{ color: style.color, backgroundColor: style.background, borderColor: style.border }}
    >
      {formatRole(role)}
    </span>
  );
}
