"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import {
  getMeetingMaterialSignedUrl,
  type MeetingMaterialMeta,
} from "@/src/lib/services/meetingService";

function isPdfMime(mime: string | null, fileName: string) {
  if (mime === "application/pdf") return true;
  return fileName.toLowerCase().endsWith(".pdf");
}

function isPowerPointMime(mime: string | null, fileName: string) {
  if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    return true;
  }
  return /\.pptx?$/i.test(fileName);
}

function MaterialViewer({
  url,
  mimeType,
  fileName,
}: {
  url: string;
  mimeType: string | null;
  fileName: string;
}) {
  if (isPdfMime(mimeType, fileName)) {
    return (
      <iframe
        title={fileName}
        src={url}
        className="h-[min(70vh,560px)] w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)]"
      />
    );
  }

  if (isPowerPointMime(mimeType, fileName)) {
    const embed = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    return (
      <div className="flex min-h-[min(70vh,560px)] flex-col gap-3">
        <iframe
          title={fileName}
          src={embed}
          className="min-h-[min(70vh,520px)] w-full flex-1 rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)]"
        />
        <p className="text-xs text-[var(--ax-muted)]">
          If the preview does not load (network or Office viewer limits), open the file directly.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
        >
          <ExternalLink size={14} /> Open in new tab
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--ax-muted)]">
      <p>Preview is not available for this file type.</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-2 font-medium text-[var(--color-accent)]"
      >
        <ExternalLink size={14} /> Open or download
      </a>
    </div>
  );
}

export default function PresentationsPanel({
  meetingId,
  materials,
}: {
  meetingId: string;
  materials: MeetingMaterialMeta[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeMaterialId = selectedId ?? materials[0]?.id ?? null;
  const [bundle, setBundle] = useState<{
    url: string;
    fileName: string;
    mimeType: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadUrl = useCallback(
    async (materialId: string) => {
      setLoading(true);
      setErr(null);
      try {
        const data = await getMeetingMaterialSignedUrl(meetingId, materialId);
        setBundle({ url: data.url, fileName: data.fileName, mimeType: data.mimeType });
      } catch (e: unknown) {
        setBundle(null);
        setErr(e instanceof Error ? e.message : "Could not load file");
      } finally {
        setLoading(false);
      }
    },
    [meetingId],
  );

  useEffect(() => {
    if (!activeMaterialId) {
      setBundle(null);
      return;
    }
    void loadUrl(activeMaterialId);
  }, [activeMaterialId, loadUrl]);

  if (materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-divider)] bg-[var(--color-surface)]/50 px-8 py-16 text-center text-sm text-[var(--ax-muted)]">
        <FileText className="mb-3 opacity-40" size={40} />
        <p>No presentation files attached to this meeting.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <ul className="space-y-2">
        {materials.map((m) => {
          const active = m.id === activeMaterialId;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`flex w-full items-start gap-2 rounded-xl px-3 py-3 text-left text-sm transition-all ${
                  active
                    ? "border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]"
                    : "border border-transparent text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                }`}
              >
                <FileText size={16} className="mt-0.5 shrink-0 opacity-70" />
                <span className="break-words">{m.fileName}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="min-h-[320px] rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)]/80 p-4">
        {loading && (
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-[var(--ax-muted)]">
            <Loader2 className="animate-spin" size={18} />
            Loading preview…
          </div>
        )}
        {!loading && err && <p className="text-sm text-[var(--ax-status-critical)]">{err}</p>}
        {!loading && !err && bundle && (
          <MaterialViewer url={bundle.url} mimeType={bundle.mimeType} fileName={bundle.fileName} />
        )}
      </div>
    </div>
  );
}
