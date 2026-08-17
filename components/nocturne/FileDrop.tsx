"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * A file dropzone.
 *
 * Drag-and-drop is an enhancement here, never the mechanism. The visible
 * control is a real `<label>` bound to a real `<input type="file">`: it is
 * focusable, activates on Enter and Space, opens the OS file picker, and works
 * for anyone who cannot drag — which on a phone, where this product's nodal
 * officers often are, is everyone. The drop handlers are added on top.
 *
 * The hidden input is positioned off-screen rather than `display: none`, so it
 * stays in the accessibility tree and keeps its label association.
 */
export type FileDropProps = {
  id: string;
  label: ReactNode;
  /** Accepted formats and limits, shown as small print and used as the a11y hint. */
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  onFiles?: (files: FileList) => void;
  className?: string;
};

const OFFSCREEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

export default function FileDrop({
  id,
  label,
  hint,
  accept,
  multiple = false,
  onFiles,
  className,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        style={OFFSCREEN}
        aria-describedby={hintId}
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) onFiles?.(event.target.files);
        }}
      />
      <label
        htmlFor={id}
        className={["ax-dropzone", className].filter(Boolean).join(" ")}
        style={dragging ? { borderColor: "var(--color-accent)" } : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length > 0) onFiles?.(event.dataTransfer.files);
        }}
      >
        <span className="ax-dropzone-icon" aria-hidden="true">
          ↑
        </span>
        <span>
          {label}
          {hint ? (
            <span className="ax-dropzone-hint" id={hintId}>
              {hint}
            </span>
          ) : null}
        </span>
      </label>
    </div>
  );
}
