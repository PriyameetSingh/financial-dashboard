import type { ReactNode } from "react";

/**
 * The four ways a surface tells the user what just happened or what is missing:
 * a toast, an inline alert, an empty state and a loading state.
 *
 * They share a file because they share one decision. Each of them is content
 * that appears without the user having asked for it, and each therefore needs
 * the right live-region semantics or it appears silently for anyone not looking
 * at that part of the screen:
 *
 *   Toast        `role="status"`  — polite; announced after the current phrase.
 *   InlineAlert  `role="alert"`   — assertive; interrupts. Reserve for failures.
 *   EmptyState   no live region   — it is the content, not a change to it.
 *   LoadingRow   `role="status"`  — polite, plus `aria-live` on the text so a
 *                                   late-arriving "loaded" message is heard.
 *
 * All four carry their meaning in words. The accent edge on the alert and the
 * ✓ on the toast are reinforcement, never the signal (WCAG 1.4.1).
 */

export type ToastProps = {
  children: ReactNode;
  className?: string;
};

export function Toast({ children, className }: ToastProps) {
  return (
    <div role="status" className={["ax-toast", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export type InlineAlertProps = {
  children: ReactNode;
  /** Set false for advisory text that should not interrupt. */
  assertive?: boolean;
  className?: string;
};

export function InlineAlert({ children, assertive = true, className }: InlineAlertProps) {
  return (
    <div
      role={assertive ? "alert" : "status"}
      className={["ax-alert", className].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true">! </span>
      {children}
    </div>
  );
}

export type EmptyStateProps = {
  children: ReactNode;
  className?: string;
};

export function EmptyState({ children, className }: EmptyStateProps) {
  return <div className={["ax-empty", className].filter(Boolean).join(" ")}>{children}</div>;
}

export type SpinnerProps = {
  className?: string;
};

/** The ring alone. Decorative — the surrounding text does the announcing. */
export function Spinner({ className }: SpinnerProps) {
  return <span aria-hidden="true" className={["ax-spinner", className].filter(Boolean).join(" ")} />;
}

export type LoadingRowProps = {
  children: ReactNode;
  className?: string;
};

export function LoadingRow({ children, className }: LoadingRowProps) {
  return (
    <div role="status" className={["ax-loading", className].filter(Boolean).join(" ")}>
      <Spinner />
      {children}
    </div>
  );
}
