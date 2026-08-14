import type { ReactNode } from "react";

/**
 * The segmented control — a radio group that looks like a toolbar.
 *
 * Built on native radios, exactly as the design system does, which is what
 * gives it arrow-key navigation, roving focus and correct announcement for
 * free. A `div`-and-`onClick` version of this control would look identical and
 * be unusable from a keyboard, which is the reason the design system's own
 * forms page is titled "native elements, themed states".
 *
 * The visible legend is usually redundant here — the options themselves read as
 * the question — so it defaults to hidden while staying in the accessibility
 * tree.
 */
export type SegmentOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps = {
  name: string;
  legend: ReactNode;
  options: readonly SegmentOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Show the legend above the control instead of hiding it visually. */
  showLegend?: boolean;
  className?: string;
};

export default function SegmentedControl({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  showLegend = false,
  className,
}: SegmentedControlProps) {
  const controlled = value !== undefined;
  return (
    <fieldset className={className} style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
      <legend
        className="text-muted"
        style={
          showLegend
            ? { fontSize: 12, padding: 0, marginBottom: 6 }
            : { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }
        }
      >
        {legend}
      </legend>
      <span className="seg">
        {options.map((option) => (
          <label className="seg-opt" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              disabled={option.disabled}
              {...(controlled
                ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
                : { defaultChecked: defaultValue === option.value, onChange: () => onChange?.(option.value) })}
            />
            {option.label}
          </label>
        ))}
      </span>
    </fieldset>
  );
}
