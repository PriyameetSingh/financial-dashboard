"use client";

import clsx from "clsx";
import Button from "./Button";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center ax-scrim p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
        {message && <p className="mt-2 text-sm text-[var(--text-muted)]">{message}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            className={clsx(
              tone === "danger" && "bg-[var(--alert-critical)]  hover:bg-opacity-90",
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
