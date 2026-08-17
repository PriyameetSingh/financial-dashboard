"use client";

import clsx from "clsx";

/**
 * `label` is REQUIRED, and that is the whole fix.
 *
 * It used to be optional and fed `aria-label`, so a switch with no label and no
 * hint had no accessible name at all — a bare `role="switch"` announced as
 * "switch, on". Twelve of them shipped that way on the notifications admin
 * screen, which is what the Gate F sweep found. Making it required moves the
 * problem from "someone must remember" to "it does not compile", and the
 * compiler then names every call site that needs fixing.
 *
 * Same reasoning as `TableScroll`'s label: the version of a component that lets
 * you skip the name is the version that ships without one.
 */
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** What this switch controls, e.g. "Email alerts for overdue action items". */
  label: string;
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
            ? "border-[var(--color-text)] bg-[var(--color-text)]"
            : "border-[var(--color-divider)] bg-transparent",
        )}
      >
        <span
          className={clsx(
            "inline-block h-3.5 w-3.5 transform rounded-full ax-fill-surface shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
            !checked && "bg-[var(--ax-muted)]",
          )}
        />
      </span>
      {hint && (
        <span
          className={clsx(
            "text-[11px] font-medium",
            checked ? "text-[var(--color-text)]" : "text-[var(--ax-muted)]",
          )}
        >
          {hint}
        </span>
      )}
    </button>
  );
}
