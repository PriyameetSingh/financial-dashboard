import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-text)] text-[var(--color-bg)] border border-transparent hover:bg-opacity-90",
  secondary: "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-divider)] hover:border-[var(--color-text)]",
  ghost: "bg-transparent text-[var(--ax-muted)] border border-transparent hover:text-[var(--color-text)]",
};

export default function Button({ variant = "primary", loading, className, children, disabled, ...rest }: Props) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition cursor-pointer",
        VARIANT_STYLES[variant],
        (disabled || loading) && "opacity-60 cursor-not-allowed",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? "Processing..." : children}
    </button>
  );
}
