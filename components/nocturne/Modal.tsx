"use client";

import { useEffect, useRef, type ReactNode } from "react";
import DialogSurface from "./Dialog";

/**
 * A modal, built on the native `<dialog>` element.
 *
 * `showModal()` is what supplies the behaviour that is otherwise hundreds of
 * lines of easy-to-get-wrong JavaScript: the focus trap, the inert background,
 * Escape to dismiss, and correct announcement as a modal dialog. Reimplementing
 * those on a `div` is the standard way a dialog ends up keyboard-inescapable.
 *
 * Two things the element does not do for us, handled here:
 *
 *   - the `cancel` event (Escape) has to be routed back to `onClose`, or the
 *     element closes while React still believes it is open;
 *   - the backdrop is drawn with `::backdrop`, which cannot read the design
 *     system's `.dialog-backdrop` class, so the class is applied to the dialog
 *     element itself for layout and the backdrop tint comes from the stylesheet
 *     rule below.
 */
export type ModalProps = {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
};

export default function Modal({ open, onClose, titleId, title, children, actions }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      style={{
        border: 0,
        padding: 0,
        background: "transparent",
        color: "inherit",
        maxWidth: "min(440px, calc(100vw - 2 * var(--space-4)))",
      }}
    >
      <DialogSurface titleId={titleId} title={title} actions={actions}>
        {children}
      </DialogSurface>
    </dialog>
  );
}
