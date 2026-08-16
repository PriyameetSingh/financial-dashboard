"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRequireRole } from "@/src/lib/route-guards";
import { UserRole } from "@/lib/auth";
import { fetchMeetings, type MeetingListItem } from "@/src/lib/services/meetingService";

export default function ReportsPage() {
  useRequireRole([UserRole.VERTICAL_HEAD, UserRole.ACS, UserRole.TASU], "/dashboard");

  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [meetingsError, setMeetingsError] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [selectedPendanceMeetingId, setSelectedPendanceMeetingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchMeetings()
      .then((list) => {
        if (!cancelled) {
          setMeetingsError(null);
          setMeetings(list);
        }
      })
      .catch((e) => {
        if (!cancelled) setMeetingsError(e instanceof Error ? e.message : "Failed to load meetings");
      })
      .finally(() => {
        if (!cancelled) setMeetingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate)),
    [meetings],
  );

  const selectedMeeting = sortedMeetings.find((m) => m.id === selectedMeetingId);
  const selectedPendanceMeeting = sortedMeetings.find((m) => m.id === selectedPendanceMeetingId);

  return (
    <AppShell title="Reports & Export">
      <div className="space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--ax-muted)]">Insights</p>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">Reports & Export</h1>
            <p className="mt-1 text-sm text-[var(--ax-muted)]">
              Curated briefings and exportable packs for executive review.
            </p>
          </div>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* Meeting Report */}
          <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ax-muted)]">Meeting pack</p>
              <p className="text-xs text-[var(--ax-muted)]">
                {meetingsLoading
                  ? "Loading meetings…"
                  : `${sortedMeetings.length} meeting${sortedMeetings.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-[var(--color-text)]">Dashboard meeting report</h2>
            <p className="mt-2 text-sm text-[var(--ax-muted)]">
              Numbered HUDD briefing for one dashboard meeting: vertical presentations (uploaded files), discussion
              topics, financial progress through that meeting date, schemes by sponsorship type, KPI snapshots up to that
              meeting, key decisions from the tracker whose records were created before that meeting&apos;s date, and
              carry‑forward when status was last updated against an earlier meeting.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="report-meeting-select" className="block text-xs font-medium text-[var(--ax-muted)]">
                  Meeting
                </label>
                <select
                  id="report-meeting-select"
                  className="mt-1 w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
                  value={selectedMeetingId}
                  disabled={meetingsLoading || sortedMeetings.length === 0}
                  onChange={(e) => setSelectedMeetingId(e.target.value)}
                >
                  <option value="">
                    {meetingsLoading
                      ? "Loading meetings…"
                      : sortedMeetings.length === 0
                        ? "No meetings yet"
                        : "Select meeting…"}
                  </option>
                  {sortedMeetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.meetingDate}
                      {m.title ? ` — ${m.title}` : ""}
                    </option>
                  ))}
                </select>
                {meetingsError && <p className="mt-2 text-xs text-[var(--ax-status-critical)]">{meetingsError}</p>}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {selectedMeetingId ? (
                  <Link
                    href={`/reports/meeting/${encodeURIComponent(selectedMeetingId)}`}
                    className="rounded-lg bg-[var(--color-text)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)]"
                  >
                    Open report
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-lg border border-[var(--color-divider)] px-4 py-2 text-sm font-semibold text-[var(--ax-muted)]">
                    Open report
                  </span>
                )}
                {selectedMeeting ? (
                  <span className="self-center text-xs text-[var(--ax-muted)]">
                    {selectedMeeting.meetingDate}
                    {selectedMeeting.title ? ` · ${selectedMeeting.title}` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Pendance Report */}
          <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ax-muted)]">Adoption tracking</p>
              <p className="text-xs text-[var(--ax-muted)]">
                {meetingsLoading
                  ? "Loading meetings…"
                  : `${sortedMeetings.length} meeting${sortedMeetings.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-[var(--color-text)]">Pendance Report</h2>
            <p className="mt-2 text-sm text-[var(--ax-muted)]">
              User adoption and data entry status report: shows what tasks (KPIs + action items) are assigned to each user for a meeting,
              what data they added vs what they didn&apos;t add. Includes a separate financial data table showing which
              schemes/subschemes had data updated during the week and which didn&apos;t. Useful for tracking system
              adoption and identifying data entry gaps.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="pendance-meeting-select" className="block text-xs font-medium text-[var(--ax-muted)]">
                  Meeting
                </label>
                <select
                  id="pendance-meeting-select"
                  className="mt-1 w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
                  value={selectedPendanceMeetingId}
                  disabled={meetingsLoading || sortedMeetings.length === 0}
                  onChange={(e) => setSelectedPendanceMeetingId(e.target.value)}
                >
                  <option value="">
                    {meetingsLoading
                      ? "Loading meetings…"
                      : sortedMeetings.length === 0
                        ? "No meetings yet"
                        : "Select meeting…"}
                  </option>
                  {sortedMeetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.meetingDate}
                      {m.title ? ` — ${m.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {selectedPendanceMeetingId ? (
                  <Link
                    href={`/reports/pendance/${encodeURIComponent(selectedPendanceMeetingId)}`}
                    className="rounded-lg bg-[var(--color-text)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)]"
                  >
                    Open report
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-lg border border-[var(--color-divider)] px-4 py-2 text-sm font-semibold text-[var(--ax-muted)]">
                    Open report
                  </span>
                )}
                {selectedPendanceMeeting ? (
                  <span className="self-center text-xs text-[var(--ax-muted)]">
                    {selectedPendanceMeeting.meetingDate}
                    {selectedPendanceMeeting.title ? ` · ${selectedPendanceMeeting.title}` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
