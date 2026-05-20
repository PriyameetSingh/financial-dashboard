"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { useRequireRole } from "@/src/lib/route-guards";
import { hasPermission, UserRole, Permission, refreshSessionUserFromApi, getCurrentUser } from "@/lib/auth";
import { fetchMeetings, MeetingListItem, deleteMeeting } from "@/src/lib/services/meetingService";
import { CalendarPlus, Play, Sparkles, FileText, Edit3, Trash2 } from "lucide-react";
import { getFinancialYear, todayISO } from "./meetingUtils";
import ActiveMeetingOverlay from "./components/ActiveMeetingOverlay";
import ScheduleMeetingModal from "./components/ScheduleMeetingModal";
import EditMeetingModal from "./components/EditMeetingModal";
import ViewMeetingModal from "./components/ViewMeetingModal";

function normalizeMeetings(raw: MeetingListItem[]): MeetingListItem[] {
  return raw.map((m) => ({
    ...m,
    materials: m.materials ?? [],
  }));
}

export default function MeetingsPage() {
  useRequireRole([UserRole.TASU, UserRole.VERTICAL_HEAD, UserRole.ACS], "/dashboard");

  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showSchedule, setShowSchedule] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingListItem | null>(null);
  const [dashboardMeeting, setDashboardMeeting] = useState<MeetingListItem | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<MeetingListItem | null>(null);

  const [canSchedule, setCanSchedule] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshSessionUserFromApi();
      if (cancelled) return;
      const user = getCurrentUser();
      setCanSchedule(
        hasPermission(user, Permission.CREATE_ACTION_ITEMS) ||
          hasPermission(user, Permission.MANAGE_SCHEMES),
      );
      setCanDelete(hasPermission(user, Permission.MANAGE_SCHEMES));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchMeetings();
      setMeetings(normalizeMeetings(data));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMeetingContext = useCallback(async () => {
    try {
      const data = await fetchMeetings();
      const normalized = normalizeMeetings(data);
      setMeetings(normalized);
      setDashboardMeeting((prev) => {
        if (!prev) return null;
        return normalized.find((m) => m.id === prev.id) ?? prev;
      });
      setSelectedMeeting((prev) => {
        if (!prev) return null;
        return normalized.find((m) => m.id === prev.id) ?? prev;
      });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load meetings");
    }
  }, []);

  const handleDeleteMeeting = async (meetingId: string, meetingTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete the meeting "${meetingTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteMeeting(meetingId);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete meeting");
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const today = todayISO();

  const todayMeetings = meetings.filter((m) => m.meetingDate === today);
  const otherMeetings = meetings.filter((m) => m.meetingDate !== today);

  if (dashboardMeeting) {
    return (
      <ActiveMeetingOverlay
        meeting={dashboardMeeting}
        allMeetings={meetings}
        onClose={() => setDashboardMeeting(null)}
        onActionItemCreated={refreshMeetingContext}
        onTopicAdded={refreshMeetingContext}
      />
    );
  }

  return (
    <AppShell title="Meetings">
      <div className="space-y-8 px-6 py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Coordination Desk</p>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Meeting Calendar</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              HUDD dashboard meetings, presentation files, and linked action items.
            </p>
          </div>
          {canSchedule && (
            <button
              id="btn-schedule-meeting"
              type="button"
              onClick={() => setShowSchedule(true)}
              className="group flex items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-2.5 text-sm font-medium text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20 hover:shadow-lg hover:shadow-[var(--accent)]/10 active:scale-[0.97]"
            >
              <CalendarPlus size={16} className="transition-transform group-hover:rotate-6" />
              Schedule Meeting
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--alert-critical)] bg-[var(--alert-critical)]/5 px-4 py-3 text-sm text-[var(--alert-critical)]">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            Loading meetings…
          </div>
        )}

        {!loading && meetings.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-muted)]">
            <CalendarPlus size={32} className="mx-auto mb-3 opacity-30" />
            No meetings recorded yet.
            {canSchedule && (
              <span className="mt-1 block">
                Click <strong>Schedule Meeting</strong> to create one.
              </span>
            )}
          </div>
        )}

        {todayMeetings.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
              <Sparkles size={14} /> Today&apos;s Meetings
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {todayMeetings.map((m) => (
                <MeetingCard 
                  key={m.id} 
                  meeting={m} 
                  isToday 
                  onClick={() => setSelectedMeeting(m)}
                  onEdit={() => setEditingMeeting(m)}
                  onDelete={() => handleDeleteMeeting(m.id, m.title || "Untitled meeting")}
                  canEdit={canSchedule}
                  canDelete={canDelete}
                />
              ))}
            </div>
          </section>
        )}

        {otherMeetings.length > 0 && (
          <section>
            {todayMeetings.length > 0 && (
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Upcoming &amp; Past
              </h2>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {otherMeetings.map((m) => (
                <MeetingCard 
                  key={m.id} 
                  meeting={m}
                  onClick={() => setSelectedMeeting(m)}
                  onEdit={() => setEditingMeeting(m)}
                  onDelete={() => handleDeleteMeeting(m.id, m.title || "Untitled meeting")}
                  canEdit={canSchedule}
                  canDelete={canDelete}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {showSchedule && (
        <ScheduleMeetingModal
          onClose={() => setShowSchedule(false)}
          onCreated={() => {
            setShowSchedule(false);
            load();
          }}
        />
      )}

      {selectedMeeting && (
        <ViewMeetingModal
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          onStartMeeting={() => {
            setDashboardMeeting(selectedMeeting);
            setSelectedMeeting(null);
          }}
          onEdit={() => {
            setEditingMeeting(selectedMeeting);
            setSelectedMeeting(null);
          }}
          canEdit={canSchedule}
        />
      )}

      {editingMeeting && (
        <EditMeetingModal
          meeting={editingMeeting}
          onClose={() => setEditingMeeting(null)}
          onUpdated={() => {
            setEditingMeeting(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function MeetingCard({
  meeting,
  isToday = false,
  onClick,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
}: {
  meeting: MeetingListItem;
  isToday?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const materials = meeting.materials ?? [];
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 ${
        isToday
          ? "border-[var(--accent)]/40 bg-gradient-to-br from-[var(--accent)]/5 to-[var(--bg-card)] shadow-md shadow-[var(--accent)]/5"
          : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover,var(--border))]"
      }`}
    >
      {isToday && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[var(--accent)]/10 blur-3xl" />
      )}

      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">{meeting.meetingDate}</p>
          <div className="flex items-center gap-2">
            {isToday && (
              <span className="flex items-center gap-1 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                Today
              </span>
            )}
            <p className="text-xs text-[var(--text-muted)]">{meeting.createdByName ?? "—"}</p>
          </div>
        </div>

        <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
          {meeting.title ?? "Untitled meeting"}
        </h3>
        {meeting.notes && (
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{meeting.notes}</p>
        )}

        <div className="mt-3">
          <span className="inline-block rounded-md bg-[var(--bg-card,var(--bg-primary))] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            FY {getFinancialYear(meeting.meetingDate)}
          </span>
        </div>

        {materials.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <FileText size={14} className="text-[var(--accent)]" />
            <span>
              {materials.length} presentation file{materials.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)]">
          <p>
            <span className="text-[10px] font-medium uppercase tracking-[0.3em]">Discussion topics</span>
            <span className="ml-2 tabular-nums text-[var(--text-primary)]">{meeting.topics.length}</span>
          </p>
          <p>
            <span className="text-[10px] font-medium uppercase tracking-[0.3em]">Action items</span>
            <span className="ml-2 tabular-nums text-[var(--text-primary)]">{meeting.actionItems.length}</span>
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          {canEdit && onEdit && (
            <button
              id={`btn-edit-meeting-${meeting.id}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5"
            >
              <Edit3 size={12} />
              Edit
            </button>
          )}
          {canDelete && onDelete && (
            <button
              id={`btn-delete-meeting-${meeting.id}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--alert-critical)]/40 bg-[var(--alert-critical)]/5 px-3 py-1.5 text-xs font-medium text-[var(--alert-critical)] transition-colors hover:border-[var(--alert-critical)]/60 hover:bg-[var(--alert-critical)]/10"
            >
              <Trash2 size={12} />
              Delete
            </button>
          )}
        </div>

        {isToday && onClick && (
          <button
            id={`btn-start-meeting-${meeting.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:brightness-110 hover:shadow-xl hover:shadow-[var(--accent)]/30 active:scale-[0.98]"
          >
            <Play size={16} fill="white" />
            Start Meeting
          </button>
        )}
      </div>
    </div>
  );
}
