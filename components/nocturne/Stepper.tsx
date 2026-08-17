import type { ReactNode } from "react";

/**
 * The wizard progress indicator (used in full by S2 onboarding).
 *
 * It is an ordered list, because that is what it is: a sequence of named steps
 * with a position in it. The mockup draws bare spans, which look right and
 * announce as nothing at all — a screen reader user gets "✓ 2 3" with no
 * indication that these are steps, how many there are, or which one they are
 * on.
 *
 * So: `<ol>` with a visible marker and a visually-hidden state word per step,
 * and `aria-current="step"` on the active one. The connector lines are
 * decoration and are hidden from the accessibility tree.
 */
export type StepState = "done" | "current" | "upcoming";

export type Step = {
  /** The step's name. Announced even when the marker only shows a number. */
  label: ReactNode;
  state: StepState;
};

const STATE_WORD: Record<StepState, string> = {
  done: "completed",
  current: "current step",
  upcoming: "not started",
};

const HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

export type StepperProps = {
  /** Names the sequence, e.g. "Onboarding progress". */
  label: string;
  steps: readonly Step[];
  /** Show each step's label beside its marker rather than only in the a11y tree. */
  showLabels?: boolean;
  className?: string;
};

export default function Stepper({ label, steps, showLabels = false, className }: StepperProps) {
  return (
    <ol className={["ax-stepper", className].filter(Boolean).join(" ")} aria-label={label}>
      {steps.map((step, index) => (
        <li
          key={index}
          className={`ax-step ax-step-${step.state}`}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="ax-step-marker">
            <span aria-hidden="true">{step.state === "done" ? "✓" : index + 1}</span>
          </span>
          {showLabels ? (
            <span style={{ marginInlineEnd: 4 }}>{step.label}</span>
          ) : (
            <span style={HIDDEN}>{step.label}</span>
          )}
          <span style={HIDDEN}>{` — ${STATE_WORD[step.state]}`}</span>
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className={["ax-step-line", step.state === "done" ? "ax-step-line-done" : null]
                .filter(Boolean)
                .join(" ")}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
