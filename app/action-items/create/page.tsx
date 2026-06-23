"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireRole } from "@/src/lib/route-guards";
import { UserRole } from "@/lib/auth";
import type { SessionUser } from "@/types";
import { fetchDirectoryUsers } from "@/src/lib/directory-users";
import { createActionItem } from "@/src/lib/services/actionItemService";
import { fetchMeetings } from "@/src/lib/services/meetingService";
import { fetchSchemesAdmin } from "@/src/lib/services/schemeService";
import { ActionItemPriority } from "@/types";
import SchemeSelector from "@/src/components/ui/SchemeSelector";
import SearchableUserSelector from "@/src/components/ui/SearchableUserSelector";
import ProofUpload from "@/src/components/ui/ProofUpload";
import ConfirmModal from "@/src/components/ui/ConfirmModal";

const PRIORITIES: ActionItemPriority[] = ["Critical", "High", "Medium", "Low"];
export default function ActionItemCreatePage() {
  useRequireRole([UserRole.TASU], "/action-items");

  const [schemes, setSchemes] = useState<string[]>([]);
  const [meetings, setMeetings] = useState<Array<{ id: string; label: string }>>([]);
  const [directoryUsers, setDirectoryUsers] = useState<SessionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheme, setScheme] = useState("");
  const [priority, setPriority] = useState<ActionItemPriority>("High");
  const [assignee, setAssignee] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setTitle("");
    setDescription("");
    setScheme("");
    setPriority("High");
    const first = directoryUsers[0]?.id ?? "";
    const second = directoryUsers.find((u) => u.id !== first)?.id ?? directoryUsers[1]?.id ?? first;
    setAssignee(first);
    setReviewer(second);
    setMeetingId("");
    setDueDate("");
  }

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [schemeData, meetingData, roster] = await Promise.all([
          fetchSchemesAdmin(),
          fetchMeetings(),
          fetchDirectoryUsers(),
        ]);
        if (!active) return;
        setDirectoryUsers(roster);
        const first = roster[0]?.id ?? "";
        const second = roster.find((u) => u.id !== first)?.id ?? roster[1]?.id ?? first;
        setAssignee(first);
        setReviewer(second);
        const codes = schemeData.schemes.map((s) => s.code);
        setSchemes(codes);
        const meetingOptions = meetingData.map((m) => ({
          id: m.id,
          label: `${m.meetingDate}${m.title ? ` — ${m.title}` : ""}`,
        }));
        setMeetings(meetingOptions);
      } catch {
        if (active) setError("Could not load schemes or meetings. Check permissions.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && dueDate;

  const selectedAssignee = useMemo(() => directoryUsers.find((user) => user.id === assignee), [assignee, directoryUsers]);
  const selectedReviewer = useMemo(() => directoryUsers.find((user) => user.id === reviewer), [reviewer, directoryUsers]);

  return (
    <AppShell title="Create Action Item">
      <div className="space-y-6 px-6 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">TASU Desk</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">New Action Item</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Draft directives and assign officers for rapid follow up.
          </p>
        </div>

        {success && (
          <div className="rounded-xl border border-[var(--alert-success)] bg-[rgba(0,200,83,0.1)] px-4 py-3 text-sm text-[var(--alert-success)]">
            Action item created and shared with assigned officers.
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.1)] px-4 py-3 text-sm text-[var(--alert-critical)]">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          {loading && (
            <div className="text-sm text-[var(--text-muted)]">Loading schemes...</div>
          )}

          {!loading && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
                <span className="text-xs uppercase tracking-[0.3em]">Title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  placeholder="Enter action item title"
                />
              </label>
              <SchemeSelector schemes={schemes} value={scheme} onChange={setScheme} label="Scheme (Optional)" />
              <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)] md:col-span-2">
                <span className="text-xs uppercase tracking-[0.3em]">Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  rows={3}
                  placeholder="Describe the expected action"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
                <span className="text-xs uppercase tracking-[0.3em]">Priority</span>
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as ActionItemPriority)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  {PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
                <span className="text-xs uppercase tracking-[0.3em]">Related Meeting (Optional)</span>
                <select
                  value={meetingId}
                  onChange={(event) => setMeetingId(event.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Select a meeting</option>
                  {meetings.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
                <span className="text-xs uppercase tracking-[0.3em]">Due Date</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </label>
              <SearchableUserSelector users={directoryUsers} value={assignee} onChange={setAssignee} label="Assigned Officer" />
              <SearchableUserSelector users={directoryUsers} value={reviewer} onChange={setReviewer} label="Reviewer" />
              <div className="md:col-span-2">
                <ProofUpload label="Attach initial notes" onUpload={() => undefined} />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-[var(--text-muted)]">
            <div>
              <p>
                Assigned to: <span className="text-[var(--text-primary)]">{selectedAssignee?.name ?? ""}</span>
              </p>
              <p>
                Reviewer: <span className="text-[var(--text-primary)]">{selectedReviewer?.name ?? ""}</span>
              </p>
            </div>
            <button
              className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60"
              onClick={() => {
                if (!canSubmit) {
                  setError("Please complete title, description, and due date before submitting.");
                  return;
                }
                setError(null);
                setConfirmOpen(true);
              }}
              disabled={!canSubmit || submitting}
            >
              {submitting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {submitting ? "Submitting…" : "Submit Action Item"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm submission"
        message="Once submitted, this action item will be visible to assigned officers and the reviewer."
        confirmLabel="Submit"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false);
          setError(null);
          setSubmitting(true);
          try {
            await createActionItem({
              meetingId: meetingId || null,
              schemeCode: scheme || null,
              title: title.trim(),
              description: description.trim(),
              priority,
              dueDate,
              performerUserCodes: [assignee],
              reviewerUserCodes: [reviewer],
            });
            resetForm();
            setSuccess(true);
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Create failed");
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </AppShell>
  );
}
