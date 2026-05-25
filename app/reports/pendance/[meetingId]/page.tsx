"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { PendanceReportContent } from "@/components/pendance-report/PendanceReportContent";
import { useRequireRole } from "@/src/lib/route-guards";
import { UserRole } from "@/lib/auth";
import { fetchPendanceReport } from "@/src/lib/services/pendanceReportService";
import type { PendanceReportPayload } from "@/lib/pendance-report";
import { HUDD_LOGO_PUBLIC_PATH } from "@/lib/hudd-logo";
import { withNextBasePath } from "@/lib/next-base-path";

export default function PendanceReportPage() {
  useRequireRole([UserRole.VERTICAL_HEAD, UserRole.ACS, UserRole.TASU], "/dashboard");

  const params = useParams<{ meetingId: string }>();
  const meetingId = (params?.meetingId as string) ?? "";
  const [data, setData] = useState<PendanceReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const logoSrc = withNextBasePath(HUDD_LOGO_PUBLIC_PATH);

  const pdfApiUrl = meetingId
    ? withNextBasePath(`/api/v1/reports/pendance/${encodeURIComponent(meetingId)}/pdf?download=1`)
    : null;

  const load = useCallback(async () => {
    if (!meetingId) return;
    setLoading(true);
    setError(null);
    try {
      const report = await fetchPendanceReport(meetingId);
      setData(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDownloadPdf() {
    if (!data || !pdfApiUrl) return;
    setPdfLoading(true);
    try {
      const res = await fetch(pdfApiUrl);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HUDD-pendance-report-${data.meeting.meetingDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Could not generate PDF. Try Print instead.");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <AppShell title="Pendance report">
      <div className="print:px-4 print:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-6 py-4 print:hidden">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Reports</p>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Pendance Report</h1>
            {data && (
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Meeting date {data.meeting.meetingDate}
                {data.meeting.title ? ` · ${data.meeting.title}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/reports"
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]"
            >
              Back
            </Link>
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
              disabled={!data}
              onClick={() => window.print()}
            >
              Print
            </button>
            <button
              type="button"
              className="rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-50"
              disabled={!data || pdfLoading}
              onClick={() => void handleDownloadPdf()}
            >
              {pdfLoading ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
        </div>

        <div className="space-y-8 px-6 py-6">
          {loading && <p className="text-sm text-[var(--text-muted)]">Building report…</p>}
          {error && (
            <p className="rounded-lg border border-[var(--alert-critical)] bg-[var(--alert-critical)]/10 px-4 py-3 text-sm text-[var(--alert-critical)]">
              {error}
            </p>
          )}

          {data && (
            <div className="mx-auto max-w-[210mm] bg-white print:max-w-none">
              <PendanceReportContent data={data} logoSrc={logoSrc} />
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          aside,
          nav,
          header[data-appshell-header],
          footer {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </AppShell>
  );
}
