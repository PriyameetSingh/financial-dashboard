"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, Loader2 } from "lucide-react";
import { fetchActionItems } from "@/src/lib/services/actionItemService";
import type { MeetingListItem } from "@/src/lib/services/meetingService";
import type { ActionItem } from "@/types";

function statusTone(status: string) {
  switch (status) {
    case "COMPLETED":
      return "text-[var(--ax-status-ok)]";
    case "OVERDUE":
      return "text-[var(--ax-status-critical)]";
    default:
      return "text-[var(--ax-muted)]";
  }
}

export default function ActionItemsMeetingPanel({ meeting }: { meeting: MeetingListItem }) {
  const linkedIds = useMemo(
    () => new Set(meeting.actionItems.map((a) => a.id)),
    [meeting.actionItems],
  );

  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState<ActionItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [meetingOnly, setMeetingOnly] = useState(false);

  useEffect(() => {
    setMeetingOnly(false);
  }, [meeting.id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fetchActionItems()
      .then((items) => {
        if (!alive) return;
        setAllItems(items);
        setErr(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Failed to load action items");
        setAllItems(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [meeting.id]);

  const visibleItems = useMemo(() => {
    const list = allItems ?? [];
    if (!meetingOnly) return list;
    return list.filter((i) => linkedIds.has(i.id));
  }, [allItems, meetingOnly, linkedIds]);

  const progress = useMemo(() => {
    const done = visibleItems.filter((i) => i.status === "COMPLETED").length;
    return { total: visibleItems.length, done };
  }, [visibleItems]);

  if (loading || allItems === null) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--ax-muted)]">
        <Loader2 className="animate-spin" size={18} />
        Loading action items…
      </div>
    );
  }

  if (err) {
    return <p className="text-sm text-[var(--ax-status-critical)]">{err}</p>;
  }

  if (allItems.length === 0) {
    return <p className="text-sm text-[var(--ax-muted)]">No action items yet.</p>;
  }

  const emptyMeetingFilter = meetingOnly && visibleItems.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--ax-muted)]">
          {emptyMeetingFilter ? (
            <>
              Showing items linked to this meeting ({linkedIds.size} linked).
            </>
          ) : (
            <>
              Progress: <strong className="text-[var(--color-text)]">{progress.done}</strong> / {progress.total}{" "}
              completed
              {!meetingOnly && linkedIds.size > 0 && (
                <span className="ml-2 text-[var(--ax-muted)]/80">
                  ({linkedIds.size} linked to this meeting)
                </span>
              )}
            </>
          )}
        </p>
        <button
          type="button"
          id="btn-meeting-action-items-filter"
          aria-pressed={meetingOnly}
          onClick={() => setMeetingOnly((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            meetingOnly
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
              : "border-[var(--color-divider)] bg-[var(--color-bg)] text-[var(--ax-muted)] hover:border-[var(--color-accent,var(--color-divider))]"
          }`}
        >
          <Filter size={14} aria-hidden />
          This meeting only
        </button>
      </div>

      {emptyMeetingFilter ? (
        <p className="text-sm text-[var(--ax-muted)]">No action items are linked to this meeting.</p>
      ) : (
        <ul className="space-y-2">
          {visibleItems.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-1 rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-[var(--color-text)]">{a.title}</p>
                <p className="text-xs text-[var(--ax-muted)]">
                  Due {a.dueDate} · {a.assignedTo}
                  {!meetingOnly && linkedIds.has(a.id) && (
                    <span className="ml-1.5 rounded-md bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                      This meeting
                    </span>
                  )}
                </p>
              </div>
              <span className={`text-xs font-semibold uppercase tracking-wide ${statusTone(a.status)}`}>
                {a.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
