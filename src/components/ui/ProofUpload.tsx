"use client";

import { useId, useState, ChangeEvent } from "react";
import { UploadCloud, FileText } from "lucide-react";
import clsx from "clsx";

interface ProofUploadProps {
  label?: string;
  description?: string;
  disabled?: boolean;
  onUpload?: (files: File[]) => void;
  accept?: string;
  className?: string;
}

export default function ProofUpload({
  label = "Upload proof",
  description = "Attach supporting files (PDF, images, any format)",
  disabled,
  onUpload,
  accept = "*/*",
  className,
}: ProofUploadProps) {
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(event.target.files ?? []);
    setFiles(list);
    onUpload?.(list);
  };

  return (
    <div className={clsx("rounded-2xl border border-dashed border-[var(--color-divider)] bg-[var(--color-surface)] p-4", className)}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)]">
          <UploadCloud size={18} className="text-[var(--ax-muted)]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">{label}</p>
          <p className="text-xs text-[var(--ax-muted)]">{description}</p>
        </div>
        <label
          htmlFor={inputId}
          className={clsx(
            "cursor-pointer rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ax-muted)]",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          Browse
        </label>
      </div>
      <input
        id={inputId}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((file) => (
            <div key={file.name} className="flex items-center gap-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2">
              <FileText size={14} className="text-[var(--ax-muted)]" />
              <span className="text-xs text-[var(--ax-text-secondary)]">{file.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
