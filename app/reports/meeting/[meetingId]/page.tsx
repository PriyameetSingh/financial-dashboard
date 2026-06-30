"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { MeetingReportContent } from "@/components/meeting-report/MeetingReportContent";
import { useRequireRole } from "@/src/lib/route-guards";
import { UserRole } from "@/lib/auth";
import { fetchMeetingReport } from "@/src/lib/services/meetingReportService";
import type { MeetingReportPayload } from "@/lib/meeting-report";
import { filterMeetingReportPayload } from "@/lib/meeting-report-filter";
import { HUDD_LOGO_PUBLIC_PATH } from "@/lib/hudd-logo";
import { withNextBasePath } from "@/lib/next-base-path";

export default function MeetingReportPage() {
  useRequireRole([UserRole.VERTICAL_HEAD, UserRole.ACS, UserRole.TASU], "/dashboard");

  const params = useParams<{ meetingId: string }>();
  const meetingId = (params?.meetingId as string) ?? "";
  const [data, setData] = useState<MeetingReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const logoSrc = withNextBasePath(HUDD_LOGO_PUBLIC_PATH);

  const [monitoringLevel, setMonitoringLevel] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const filteredData = useMemo(() => {
    if (!data) return null;
    return filterMeetingReportPayload(data, {
      monitoringLevel,
      priority,
      status,
    });
  }, [data, monitoringLevel, priority, status]);

  const load = useCallback(async () => {
    if (!meetingId) return;
    setLoading(true);
    setError(null);
    try {
      const report = await fetchMeetingReport(meetingId);
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
    if (!data) return;
    setPdfLoading(true);
    try {
      const queryParams = new URLSearchParams({
        download: "1",
        ...(monitoringLevel !== "ALL" && { monitoringLevel }),
        ...(priority !== "ALL" && { priority }),
        ...(status !== "ALL" && { status }),
      });
      const urlWithParams = withNextBasePath(
        `/api/v1/reports/meeting/${encodeURIComponent(meetingId)}/pdf?${queryParams.toString()}`
      );
      const res = await fetch(urlWithParams);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HUDD-meeting-report-${data.meeting.meetingDate}.pdf`;
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
    <AppShell title="Meeting report">
      <div className="print:px-4 print:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-6 py-4 print:hidden">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Reports</p>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Dashboard meeting pack</h1>
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

        {/* Filters Panel */}
        <div className="flex flex-wrap items-end gap-4 border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4 print:hidden">
          <div className="min-w-[150px] flex-1">
            <label htmlFor="filter-monitoring-level" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Monitoring Level
            </label>
            <select
              id="filter-monitoring-level"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)] transition-colors"
              value={monitoringLevel}
              onChange={(e) => setMonitoringLevel(e.target.value)}
            >
              <option value="ALL">All Levels</option>
              <option value="CM">CM</option>
              <option value="CS">CS</option>
              <option value="ACS">ACS</option>
            </select>
          </div>

          <div className="min-w-[150px] flex-1">
            <label htmlFor="filter-priority" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Priority
            </label>
            <select
              id="filter-priority"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)] transition-colors"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="ALL">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div className="min-w-[150px] flex-1">
            <label htmlFor="filter-status" className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Status
            </label>
            <select
              id="filter-status"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)] transition-colors"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {(monitoringLevel !== "ALL" || priority !== "ALL" || status !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setMonitoringLevel("ALL");
                setPriority("ALL");
                setStatus("ALL");
              }}
              className="rounded-xl border border-[var(--border)] hover:border-red-500 hover:text-red-500 px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors h-[38px] flex items-center justify-center"
            >
              Reset
            </button>
          )}
        </div>

        <div className="space-y-8 px-6 py-6">
          {loading && <p className="text-sm text-[var(--text-muted)]">Building report…</p>}
          {error && (
            <p className="rounded-lg border border-[var(--alert-critical)] bg-[var(--alert-critical)]/10 px-4 py-3 text-sm text-[var(--alert-critical)]">
              {error}
            </p>
          )}

          {filteredData && (
            <div className="mx-auto max-w-[210mm] bg-white print:max-w-none">
              <MeetingReportContent data={filteredData} logoSrc={logoSrc} />
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
