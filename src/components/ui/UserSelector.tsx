"use client";

import clsx from "clsx";
import type { SessionUser } from "@/types";

interface UserSelectorProps {
  users: SessionUser[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

const formatRole = (role: string) => role.replace(/_/g, " ");

export default function UserSelector({ users, value, onChange, label = "Assignee", className }: UserSelectorProps) {
  return (
    <label className={clsx("flex flex-col gap-2 text-sm text-[var(--text-muted)]", className)}>
      <span className="text-xs uppercase tracking-[0.3em]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
      >
        {users.length === 0 && (
          <option value="" disabled>
            Loading officers…
          </option>
        )}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
            {user.designationName?.trim() ? ` — ${user.designationName}` : ` — ${formatRole(user.role)}`}
          </option>
        ))}
      </select>
    </label>
  );
}
