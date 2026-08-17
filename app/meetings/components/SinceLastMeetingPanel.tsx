"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchFinanceSummary } from "@/src/lib/services/financialService";
import type { MeetingListItem } from "@/src/lib/services/meetingService";
import { getFinancialYear } from "../meetingUtils";
import { withNextBasePath } from "@/lib/next-base-path";

export default function SinceLastMeetingPanel({
  meeting,
  allMeetings,
}: {
  meeting: MeetingListItem;
  allMeetings: MeetingListItem[];
}) {
  const prevMeeting = useMemo(() => {
    const sorted = [...allMeetings].sort((a, b) => (a.meetingDate < b.meetingDate ? 1 : -1));
    const idx = sorted.findIndex((m) => m.id === meeting.id);
    if (idx < 0) return null;
    return sorted[idx + 1] ?? null;
  }, [allMeetings, meeting.id]);

  const [loading, setLoading] = useState(() => prevMeeting != null);
  const [err, setErr] = useState<string | null>(null);
  const [baselineDate, setBaselineDate] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const [deltaIfms, setDeltaIfms] = useState<number | null>(null);
  const [deltaSo, setDeltaSo] = useState<number | null>(null);
  const [fy, setFy] = useState<string | null>(null);

  useEffect(() => {
    if (!prevMeeting) return;

    let alive = true;

    const run = async () => {
      try {
        const dRes = await fetch(withNextBasePath("/api/v1/financial/snapshot-dates"), { cache: "no-store" });
        if (!dRes.ok) throw new Error("Could not load snapshot dates");
        const { dates } = (await dRes.json()) as { dates: string[] };
        const md = prevMeeting.meetingDate;
        const onOrBeforePrev = dates.filter((d) => d <= md);
        const baseline = onOrBeforePrev[0] ?? null;
        const current = dates[0] ?? null;
        if (!baseline || !current || baseline === current) {
          if (!alive) return;
          setBaselineDate(baseline);
          setCurrentDate(current);
          setDeltaIfms(null);
          setDeltaSo(null);
          setErr(null);
          return;
        }

        const fyLabel = getFinancialYear(meeting.meetingDate);
        const [baseSum, curSum] = await Promise.all([
          fetchFinanceSummary({ asOfDate: baseline, financialYearLabel: fyLabel }),
          fetchFinanceSummary({ asOfDate: current, financialYearLabel: fyLabel }),
        ]);
        if (!alive) return;
        setFy(curSum.financialYearLabel);
        setBaselineDate(baseline);
        setCurrentDate(current);
        setDeltaIfms(curSum.totals.ifmsExpenditureCr - baseSum.totals.ifmsExpenditureCr);
        setDeltaSo(curSum.totals.soExpenditureCr - baseSum.totals.soExpenditureCr);
        setErr(null);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Comparison failed");
        setDeltaIfms(null);
        setDeltaSo(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [prevMeeting, meeting.meetingDate]);

  if (!prevMeeting) {
    return (
      <p className="text-sm text-[var(--ax-muted)]">
        There is no earlier meeting on the calendar, so progress &ldquo;since last meeting&rdquo; cannot be
        computed.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--ax-muted)]">
        <Loader2 className="animate-spin" size={18} />
        Comparing finance snapshots…
      </div>
    );
  }

  if (err) {
    return <p className="text-sm text-[var(--ax-status-critical)]">{err}</p>;
  }

  if (deltaIfms === null || deltaSo === null) {
    return (
      <p className="text-sm text-[var(--ax-muted)]">
        Not enough snapshot history to compare against the period ending {prevMeeting.meetingDate} (
        {prevMeeting.title ?? "Previous meeting"}).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--ax-muted)]">
        FY {fy ?? "—"} · Baseline snapshot on or before last meeting ({prevMeeting.meetingDate}
        ): <strong>{baselineDate}</strong> · Current: <strong>{currentDate}</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ax-muted)]">Δ IFMS (Cr)</p>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${
              deltaIfms >= 0 ? "text-[var(--color-accent)]" : "text-[var(--ax-status-critical)]"
            }`}
          >
            {deltaIfms >= 0 ? "+" : ""}
            {deltaIfms.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ax-muted)]">Δ SO (Cr)</p>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${
              deltaSo >= 0 ? "text-[var(--color-text)]" : "text-[var(--ax-status-critical)]"
            }`}
          >
            {deltaSo >= 0 ? "+" : ""}
            {deltaSo.toFixed(2)}
          </p>
        </div>
      </div>
      <p className="text-xs text-[var(--ax-muted)]">
        Compares latest finance summary totals at two snapshot dates (same approach as Financial Overview
        &ldquo;since last meeting&rdquo;, anchored to the meeting before this one).
      </p>
    </div>
  );
}
