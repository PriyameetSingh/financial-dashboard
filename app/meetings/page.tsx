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
import DeleteMeetingModal from "./components/DeleteMeetingModal";

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
  const [deletingMeeting, setDeletingMeeting] = useState<MeetingListItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBlockers, setDeleteBlockers] = useState<
    Array<{ id: string; title: string; status: string }> | null
  >(null);

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

  const openDeleteMeeting = (meeting: MeetingListItem) => {
    setDeletingMeeting(meeting);
    setDeleteError(null);
    setDeleteBlockers(null);
  };

  const closeDeleteMeeting = () => {
    setDeletingMeeting(null);
    setDeleteError(null);
    setDeleteBlockers(null);
    setDeleteSubmitting(false);
  };

  const confirmDeleteMeeting = async () => {
    if (!deletingMeeting) return;
    const meetingId = deletingMeeting.id;
    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      await deleteMeeting(meetingId);
      closeDeleteMeeting();
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete meeting";
      // The server refuses deletion when active action items remain. Refresh the
      // meeting list so the modal reflects the current set of blocking items.
      if (e instanceof Error && /active action items/i.test(message)) {
        try {
          const data = await fetchMeetings();
          const normalized = normalizeMeetings(data);
          setMeetings(normalized);
          const refreshed = normalized.find((m) => m.id === meetingId) ?? null;
          if (refreshed) {
            setDeletingMeeting(refreshed);
            setDeleteBlockers(refreshed.actionItems ?? []);
          }
        } catch {
          // fall through to show the generic error
        }
      }
      setDeleteError(message);
    } finally {
      setDeleteSubmitting(false);
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
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--ax-muted)]">Coordination Desk</p>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">Meeting Calendar</h1>
            <p className="mt-1 text-sm text-[var(--ax-muted)]">
              HUDD dashboard meetings, presentation files, and linked action items.
            </p>
          </div>
          {canSchedule && (
            <button
              id="btn-schedule-meeting"
              type="button"
              onClick={() => setShowSchedule(true)}
              className="btn btn-primary group px-5 py-2.5 text-sm font-medium"
            >
              <CalendarPlus size={16} className="transition-transform group-hover:rotate-6" />
              Schedule Meeting
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--ax-status-critical)] bg-[var(--ax-status-critical)]/5 px-4 py-3 text-sm text-[var(--ax-status-critical)]">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-sm text-[var(--ax-muted)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            Loading meetings…
          </div>
        )}

        {!loading && meetings.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--color-divider)] bg-[var(--color-surface)] p-10 text-center text-sm text-[var(--ax-muted)]">
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
            <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-accent)]">
              <Sparkles size={14} /> Today&apos;s Meetings
            </h2>
            <div className="ax-meeting-grid grid gap-4 md:grid-cols-2" role="group" aria-label="Today's meetings">
              {todayMeetings.map((m) => (
                <MeetingCard 
                  key={m.id} 
                  meeting={m} 
                  isToday 
                  onClick={() => setSelectedMeeting(m)}
                  onEdit={() => setEditingMeeting(m)}
                  onDelete={() => openDeleteMeeting(m)}
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
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--ax-muted)]">
                Upcoming &amp; Past
              </h2>
            )}
            <div className="ax-meeting-grid grid gap-4 md:grid-cols-2" role="group" aria-label="Upcoming and past meetings">
              {otherMeetings.map((m) => (
                <MeetingCard 
                  key={m.id} 
                  meeting={m}
                  onClick={() => setSelectedMeeting(m)}
                  onEdit={() => setEditingMeeting(m)}
                  onDelete={() => openDeleteMeeting(m)}
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

      {deletingMeeting && (
        <DeleteMeetingModal
          meeting={deletingMeeting}
          blockingActionItems={deleteBlockers}
          onClose={closeDeleteMeeting}
          onConfirm={confirmDeleteMeeting}
          deleting={deleteSubmitting}
          error={deleteError}
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
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 ${
        isToday
          ? "border-[var(--color-accent)]/40 bg-gradient-to-br from-[var(--color-accent)]/5 to-[var(--color-surface)] shadow-md shadow-[var(--color-accent)]/5"
          : "border-[var(--color-divider)] bg-[var(--color-surface)] hover:border-[var(--color-accent,var(--color-divider))]"
      }`}
    >
      {isToday && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[var(--color-accent)]/10 blur-3xl" />
      )}

      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ax-muted)]">{meeting.meetingDate}</p>
          <div className="flex items-center gap-2">
            {isToday && (
              <span className="flex items-center gap-1 rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
                Today
              </span>
            )}
            <p className="text-xs text-[var(--ax-muted)]">{meeting.createdByName ?? "—"}</p>
          </div>
        </div>

        <h3 className="mt-3 text-lg font-semibold text-[var(--color-text)]">
          {meeting.title ?? "Untitled meeting"}
        </h3>
        {meeting.notes && (
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--ax-muted)]">{meeting.notes}</p>
        )}

        <div className="mt-3">
          <span className="inline-block rounded-md bg-[var(--color-surface,var(--color-bg))] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--ax-muted)]">
            FY {getFinancialYear(meeting.meetingDate)}
          </span>
        </div>

        {materials.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[var(--ax-muted)]">
            <FileText size={14} className="text-[var(--color-accent)]" />
            <span>
              {materials.length} presentation file{materials.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--ax-muted)]">
          <p>
            <span className="text-[10px] font-medium uppercase tracking-[0.3em]">Discussion topics</span>
            <span className="ml-2 tabular-nums text-[var(--color-text)]">{meeting.topics.length}</span>
          </p>
          <p>
            <span className="text-[10px] font-medium uppercase tracking-[0.3em]">Action items</span>
            <span className="ml-2 tabular-nums text-[var(--color-text)]">{meeting.actionItems.length}</span>
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
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/5"
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
              className="flex items-center gap-1.5 rounded-lg border border-[var(--ax-status-critical)]/40 bg-[var(--ax-status-critical)]/5 px-3 py-1.5 text-xs font-medium text-[var(--ax-status-critical)] transition-colors hover:border-[var(--ax-status-critical)]/60 hover:bg-[var(--ax-status-critical)]/10"
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
            className="btn btn-primary mt-5 w-full px-4 py-2.5 text-sm font-semibold"
          >
            <Play size={16} fill="white" />
            Start Meeting
          </button>
        )}
      </div>
    </div>
  );
}
