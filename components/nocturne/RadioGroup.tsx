import type { ReactNode } from "react";

/**
 * A set of radios, wrapped in the fieldset/legend the design system's markup
 * leaves to the caller.
 *
 * The mockup draws loose `.radio` labels with no grouping element. That renders
 * correctly and reads wrongly: a screen reader announces three unrelated radios
 * with no idea what question they answer. The legend is the question.
 *
 * `visuallyHiddenLegend` exists for the case where the surrounding layout
 * already states the question in a visible heading — the legend still has to be
 * in the accessibility tree, it just does not have to be painted twice.
 */
export type RadioOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type RadioGroupProps = {
  /** Shared `name` for the underlying inputs. */
  name: string;
  legend: ReactNode;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  visuallyHiddenLegend?: boolean;
  className?: string;
};

export default function RadioGroup({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  visuallyHiddenLegend = false,
  className,
}: RadioGroupProps) {
  const controlled = value !== undefined;
  return (
    <fieldset className={className} style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
      <legend
        className="text-muted"
        style={
          visuallyHiddenLegend
            ? { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }
            : { fontSize: 12, padding: 0, marginBottom: 6 }
        }
      >
        {legend}
      </legend>
      {/* The row is a child rather than the fieldset itself: a `display: flex`
          fieldset turns its own legend into a flex item, which drops it into
          the row beside the radios. */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        {options.map((option) => (
          <label className="radio" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              disabled={option.disabled}
              {...(controlled
                ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
                : { defaultChecked: defaultValue === option.value, onChange: () => onChange?.(option.value) })}
            />
            <span className="dot" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
