import type { ReactNode } from "react";

/**
 * A module row with a switch — the shape S3's menu-card configurator is built
 * from, and the reason it lives in the shared layer rather than in that page.
 *
 * `role="switch"` with `aria-checked` on a real `<button>`: announced as "on"
 * or "off", operable with Space and Enter, focusable, and disable-able. The
 * mockup draws it as a styled `span`, which is a picture of a switch.
 *
 * The `locked` variant is for a module above the tenant's tier. It renders the
 * row with an action (an upgrade affordance) instead of a switch rather than
 * rendering a disabled switch, because a disabled switch says "this is off and
 * you may not change it" when what is true is "this is not part of your plan".
 * That distinction is exactly the one this product's tiering has to make
 * legible.
 */
export type ModuleToggleProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export default function ModuleToggle({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  className,
}: ModuleToggleProps) {
  const labelId = `${id}-label`;
  return (
    <div className={["ax-toggle-row", className].filter(Boolean).join(" ")}>
      <span className="ax-toggle-label" id={labelId}>
        {label}
        {hint ? <span className="ax-toggle-hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        id={id}
        className="ax-switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={onChange ? () => onChange(!checked) : undefined}
      />
    </div>
  );
}

export type LockedModuleRowProps = {
  label: ReactNode;
  hint?: ReactNode;
  /** The upgrade affordance — a link or button the caller supplies. */
  action: ReactNode;
  className?: string;
};

export function LockedModuleRow({ label, hint, action, className }: LockedModuleRowProps) {
  return (
    <div className={["ax-toggle-row", "ax-toggle-row-locked", className].filter(Boolean).join(" ")}>
      <span className="ax-toggle-label">
        {label}
        {hint ? <span className="ax-toggle-hint">{hint}</span> : null}
      </span>
      {action}
    </div>
  );
}
