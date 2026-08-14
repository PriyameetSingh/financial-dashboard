import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/**
 * A labelled form control.
 *
 * `id` is required rather than generated. A generated id would need `useId`,
 * which would make every field a client component, and — more to the point — a
 * required id is what guarantees the `label`/`for` pair actually exists. The
 * commonest way a form field loses its accessible name is a wrapper that
 * generates the id "when one isn't passed" and silently doesn't.
 *
 * `hint` and `error` are wired to the control through `aria-describedby`, and
 * `error` additionally sets `aria-invalid`. The error text carries a `!` mark so
 * the failure is not signalled by the accent border alone (WCAG 1.4.1).
 */
export type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (control: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
  }) => ReactNode;
};

export function Field({ id, label, hint, error, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["field", className].filter(Boolean).join(" ")}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint ? (
        <div id={hintId} className="text-muted" style={{ fontSize: 11, marginTop: 5 }}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} style={{ fontSize: 11, marginTop: 5, color: "var(--ax-accent-text)" }}>
          <span aria-hidden="true">! </span>
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** The bare themed input, for the rare case a caller supplies its own label. */
export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
};

export function TextInput({ className, type = "text", ...rest }: TextInputProps) {
  return <input type={type} className={["input", className].filter(Boolean).join(" ")} {...rest} />;
}

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  className?: string;
};

export function TextArea({ className, ...rest }: TextAreaProps) {
  return <textarea className={["input", className].filter(Boolean).join(" ")} {...rest} />;
}

/** The common case: a label, an input, and the wiring between them. */
export type TextFieldProps = Omit<TextInputProps, "id"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
};

export default function TextField({
  id,
  label,
  hint,
  error,
  fieldClassName,
  ...input
}: TextFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={fieldClassName}>
      {(control) => <TextInput {...control} {...input} />}
    </Field>
  );
}
