import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--text-primary)] text-[var(--bg-primary)] border border-transparent hover:bg-opacity-90",
  secondary: "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--text-primary)]",
  ghost: "bg-transparent text-[var(--text-muted)] border border-transparent hover:text-[var(--text-primary)]",
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
