"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { SessionUser } from "@/types";

interface SearchableUserSelectorProps {
  users: SessionUser[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  /** Used to show the current selection label when the selected user is not in `users` (e.g. edge cases). */
  catalog?: SessionUser[];
  placeholder?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
}

const formatRole = (role: string) => role.replace(/_/g, " ");

function matchesQuery(user: SessionUser, q: string) {
  if (!q.trim()) return true;
  const n = q.toLowerCase();
  return (
    user.name.toLowerCase().includes(n) ||
    user.email.toLowerCase().includes(n) ||
    formatRole(user.role).toLowerCase().includes(n) ||
    user.id.toLowerCase().includes(n)
  );
}

export default function SearchableUserSelector({
  users,
  value,
  onChange,
  label = "Assignee",
  className,
  catalog,
  placeholder,
  showAllOption = false,
  allOptionLabel = "All",
}: SearchableUserSelectorProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const lookup = catalog ?? users;
  const selected = lookup.find((u) => u.id === value);

  const filtered = useMemo(() => users.filter((u) => matchesQuery(u, query)), [users, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const displayHint = selected ? `${selected.name} — ${formatRole(selected.role)}` : "";

  return (
    <div ref={rootRef} className={clsx("relative flex flex-col text-sm text-[var(--text-muted)]", className)}>
      {label && <span className="mb-2 text-xs uppercase tracking-[0.3em]">{label}</span>}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={open ? "Search by name, email, or role…" : placeholder || "Search by name, email, or role…"}
          value={open ? query : query || displayHint}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
              inputRef.current?.blur();
            }
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/25"
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-lg"
          >
            {showAllOption && !query.trim() && (
              <li role="option" aria-selected={value === "all"}>
                <button
                  type="button"
                  className={clsx(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition hover:bg-[var(--bg-hover)]",
                    value === "all" && "bg-[var(--bg-hover)]",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange("all");
                    setOpen(false);
                    setQuery("");
                    inputRef.current?.blur();
                  }}
                >
                  <span className="font-medium text-[var(--text-primary)]">{allOptionLabel}</span>
                </button>
              </li>
            )}
            {filtered.length === 0 && (!showAllOption || query.trim() !== "") && (
              <li className="px-3 py-2 text-sm text-[var(--text-muted)]">No users match your search.</li>
            )}
            {filtered.map((user) => (
              <li key={user.id} role="option" aria-selected={user.id === value}>
                <button
                  type="button"
                  className={clsx(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition hover:bg-[var(--bg-hover)]",
                    user.id === value && "bg-[var(--bg-hover)]",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(user.id);
                    setOpen(false);
                    setQuery("");
                    inputRef.current?.blur();
                  }}
                >
                  <span className="font-medium text-[var(--text-primary)]">{user.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatRole(user.role)} · {user.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
