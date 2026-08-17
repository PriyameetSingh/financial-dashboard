import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The design system's action.
 *
 * `primary` is an accent OUTLINE, never a fill — the single most load-bearing
 * rule in this system, and the one most likely to be undone by someone reaching
 * for a familiar solid button. It is expressed in `nocturne.css`; this component
 * exists so nobody has to remember the class pair.
 *
 * `icon` buttons have no text, so they require `aria-label`: the prop is typed
 * as mandatory rather than checked at runtime.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  ghost: "btn btn-ghost",
};

function classes(variant: ButtonVariant, block: boolean, extra?: string): string {
  return [VARIANT_CLASS[variant], block ? "btn-block" : null, extra].filter(Boolean).join(" ");
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  /** Full width, with the design system's own top margin. */
  block?: boolean;
  className?: string;
  children: ReactNode;
};

export default function Button({
  variant = "secondary",
  block = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={classes(variant, block, className)} {...rest}>
      {children}
    </button>
  );
}

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
  variant?: ButtonVariant;
  block?: boolean;
  className?: string;
  children: ReactNode;
};

/** An action that navigates. Still a link, so it keeps link semantics. */
export function ButtonLink({
  variant = "secondary",
  block = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <a className={classes(variant, block, className)} {...rest}>
      {children}
    </a>
  );
}

export type IconButtonProps = Omit<ButtonProps, "block" | "children"> & {
  /** Required: an icon-only control has no accessible name without it. */
  "aria-label": string;
  children: ReactNode;
};

export function IconButton({ variant = "secondary", className, children, ...rest }: IconButtonProps) {
  return (
    <Button variant={variant} className={["btn-icon", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Button>
  );
}
