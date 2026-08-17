"use client";

import { useEffect, useState } from "react";
import Button from "./Button";

interface PromptModalProps {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Minimum non-whitespace length required to enable confirm. */
  minLength?: number;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function PromptModal({
  open,
  title,
  message,
  placeholder = "Enter a note...",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  minLength = 1,
  busy = false,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const trimmed = value.trim();
  const canConfirm = trimmed.length >= minLength && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ax-scrim p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--color-divider)] bg-[var(--color-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[var(--color-text)]">{title}</h3>
        {message && <p className="mt-2 text-sm text-[var(--ax-muted)]">{message}</p>}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          rows={4}
          className="mt-4 w-full resize-none rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--ax-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            onClick={() => canConfirm && onConfirm(trimmed)}
            disabled={!canConfirm}
            className={
              tone === "danger"
                ? "bg-[var(--ax-status-critical)]  hover:bg-opacity-90"
                : undefined
            }
          >
            {busy ? "Processing..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
