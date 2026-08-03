"use client";

import clsx from "clsx";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  /** Optional helper text rendered next to the switch. */
  hint?: string;
  className?: string;
}

export default function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
  hint,
  className,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "group inline-flex items-center gap-2 text-left disabled:cursor-wait disabled:opacity-60",
        className,
      )}
    >
      <span
        className={clsx(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
          checked
            ? "border-[var(--text-primary)] bg-[var(--text-primary)]"
            : "border-[var(--border)] bg-transparent",
        )}
      >
        <span
          className={clsx(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
            !checked && "bg-[var(--text-muted)]",
          )}
        />
      </span>
      {hint && (
        <span
          className={clsx(
            "text-[11px] font-medium",
            checked ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]",
          )}
        >
          {hint}
        </span>
      )}
    </button>
  );
}
