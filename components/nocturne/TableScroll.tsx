import type { ReactNode } from "react";

/**
 * A horizontally scrolling region that a keyboard can actually reach.
 *
 * Wide tables get wrapped in `overflow-x-auto` and the job looks done. It is
 * not: a scroll container with no focusable content and no tabindex cannot be
 * scrolled without a pointer, so every column past the right edge is simply
 * unavailable to anyone navigating by keyboard — and it is announced as an
 * unlabelled group by a screen reader. WCAG 2.1.1.
 *
 * Three of these turned up across the reskin (the budget-head table, and seven
 * report tables) before it was worth having a component. The `label` is required
 * rather than optional for the same reason `alt` is: the version of this that
 * lets you skip the name is the version that ships without one.
 */
export type TableScrollProps = {
  /** What the table contains — "Key decisions", "Officer pendency summary". */
  label: string;
  className?: string;
  children: ReactNode;
};

export default function TableScroll({ label, className, children }: TableScrollProps) {
  return (
    <div
      className={className}
      tabIndex={0}
      role="region"
      aria-label={`${label} — scrolls horizontally`}
    >
      {children}
    </div>
  );
}
