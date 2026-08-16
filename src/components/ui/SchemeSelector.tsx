"use client";

import clsx from "clsx";

interface SchemeSelectorProps {
  schemes: string[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export default function SchemeSelector({ schemes, value, onChange, label = "Scheme", className }: SchemeSelectorProps) {
  return (
    <label className={clsx("flex flex-col gap-2 text-sm text-[var(--ax-muted)]", className)}>
      <span className="text-xs uppercase tracking-[0.3em]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none"
      >
        <option value="">Select a scheme</option>
        {schemes.map((scheme) => (
          <option key={scheme} value={scheme}>
            {scheme}
          </option>
        ))}
      </select>
    </label>
  );
}
