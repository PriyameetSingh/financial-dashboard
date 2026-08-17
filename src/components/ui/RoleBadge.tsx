import clsx from "clsx";
import { UserRole } from "@/types";

/**
 * A role is a KIND, not a status — no role is better or worse than another — so
 * these read the categorical palette rather than a status tone.
 *
 * The five entries used to carry `#1f3a93`, `#5b4fcf`, `#1abc9c` (twice) and
 * `#2ecc71` with 15% tints. Two problems, beyond the obvious one that none of
 * them followed the tenant's palette: FA and TASU were given the SAME colour, so
 * the encoding was never five-way in the first place; and the teal measured
 * 2.01:1 on the light theme, which the audit caught on the user directory.
 *
 * They are five distinct categorical chips now. The label is spelled out in full
 * beside the tint in every case, so the colour has never been the thing carrying
 * the role — which is why giving two roles one colour went unnoticed for so long.
 */
const ROLE_CHIP: Record<UserRole, string> = {
  [UserRole.ACS]: "ax-chip-cat-4",
  [UserRole.VERTICAL_HEAD]: "ax-chip-cat-1",
  [UserRole.FA]: "ax-chip-cat-2",
  [UserRole.TASU]: "ax-chip-cat-3",
  [UserRole.NODAL_OFFICER]: "ax-chip-cat-6",
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
  return (
    <span
      className={clsx(
        "ax-chip",
        ROLE_CHIP[role],
        "uppercase tracking-[0.3em] font-semibold",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {formatRole(role)}
    </span>
  );
}
