import { isAssignedActionOfficer, isPendingActionItem, isDesignatedReviewer } from "@/src/lib/actionItemAssignment";
import type { KpiLatestMeeting } from "@/src/lib/services/kpiService";
import type { ActionItem, KPISubmission, SessionUser } from "@/types";

export type PendingBadgeTone = "red" | "yellow" | "green";
export type PendingBadgeState = { count: number; tone: PendingBadgeTone | null };

/**
 * The in-page badge's tone. Same three Nocturne tone classes as the nav badge —
 * one set, so the two cannot drift.
 *
 * The `dark:` variants they replace were dead in any case: the app removed the
 * `dark` class on every mount, so only the light half ever rendered.
 */
export const BADGE_TONE_CLASS: Record<PendingBadgeTone, string> = {
  red: "ax-tone-critical",
  yellow: "ax-tone-warning",
  green: "ax-tone-ok",
};

/**
 * The nav badge's tone.
 *
 * Was three Tailwind palette classes, which pinned the badge to a fixed hue in
 * one theme and left it unreadable in the other. The Nocturne tone classes read
 * the status token pair, so both grounds are covered and a tenant swap cannot
 * strand them.
 *
 * The tone is never the only signal: the badge sits beside the item's label and
 * its count, and the count is the thing being communicated.
 */
export const SIDEBAR_BADGE_TONE_CLASS: Record<PendingBadgeTone, string> = {
  red: "ax-tone-critical",
  yellow: "ax-tone-warning",
  green: "ax-tone-ok",
};

function isOverdue(item: ActionItem) {
  if (item.status === "OVERDUE") return true;
  const due = new Date(item.dueDate);
  return due < new Date();
}

function isDueWithinWeek(item: ActionItem) {
  const due = new Date(item.dueDate);
  const now = new Date();
  const week = new Date();
  week.setDate(now.getDate() + 7);
  return due >= now && due <= week;
}

function isPendingForLatestMeeting(item: ActionItem, latestMeeting: KpiLatestMeeting | null | undefined): boolean {
  if (!latestMeeting) {
    return isPendingActionItem(item);
  }
  // When the API exposes `hasUpdateForLatestMeeting`, prefer it.
  const hasUpdateFlag = (item as ActionItem & { hasUpdateForLatestMeeting?: boolean }).hasUpdateForLatestMeeting;
  if (hasUpdateFlag === true) {
    return false;
  }
  return isPendingActionItem(item);
}

export function pendingAssignedBadgeState(
  items: ActionItem[],
  user: SessionUser,
  latestMeeting?: KpiLatestMeeting | null,
): PendingBadgeState {
  const mine = items.filter(
    (item) => isAssignedActionOfficer(item, user) && isPendingForLatestMeeting(item, latestMeeting),
  );
  const count = mine.length;
  if (count === 0) return { count: 0, tone: null };
  const anyOverdue = mine.some(isOverdue);
  if (anyOverdue) return { count, tone: "red" };
  const anyDueSoon = mine.some(isDueWithinWeek);
  if (anyDueSoon) return { count, tone: "yellow" };
  return { count, tone: "green" };
}

/** KPI is pending when the user can enter data and the latest weekly meeting has no measurement yet. */
export function isPendingKpiEntryForLatestMeeting(submission: KPISubmission, latestMeeting: KpiLatestMeeting | null) {
  if (!latestMeeting) return false;
  if (submission.currentUserCanEnter !== true) return false;
  return submission.hasEntryForLatestMeeting !== true;
}

function daysSinceMeetingDate(meetingDate: string): number {
  const meeting = new Date(`${meetingDate}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.floor((today.getTime() - meeting.getTime()) / 86_400_000);
}

/** Urgency when latest-meeting KPI data is still missing (weekly meeting cycle). */
function urgencyToneForMissingLatestMeetingEntry(meetingDate: string): PendingBadgeTone {
  const days = daysSinceMeetingDate(meetingDate);
  if (days > 7) return "red";
  if (days > 0) return "yellow";
  return "green";
}

/** Red if any overdue, else yellow if any delayed, else green. */
export function pendingKpiEntryBadgeState(
  submissions: KPISubmission[],
  latestMeeting: KpiLatestMeeting | null,
): PendingBadgeState {
  if (!latestMeeting) return { count: 0, tone: null };
  const mine = submissions.filter((s) => isPendingKpiEntryForLatestMeeting(s, latestMeeting));
  const count = mine.length;
  if (count === 0) return { count: 0, tone: null };
  const tone = urgencyToneForMissingLatestMeetingEntry(latestMeeting.meetingDate);
  return { count, tone };
}

/** KPI measurements awaiting this user's review (submitted & reviewable). */
export function pendingKpiReviewBadgeState(submissions: KPISubmission[]): PendingBadgeState {
  const mine = submissions.filter(
    (s) => s.status === "submitted_pending" && s.currentUserCanReview === true,
  );
  const count = mine.length;
  if (count === 0) return { count: 0, tone: null };

  // Use staleness to drive urgency where available.
  const anyOverdue = mine.some((s) => (s.staleDays ?? 0) > 7);
  if (anyOverdue) return { count, tone: "red" };
  const anyDelayed = mine.some((s) => (s.staleDays ?? 0) > 0);
  if (anyDelayed) return { count, tone: "yellow" };
  return { count, tone: "green" };
}

/** Decision-tracker items awaiting this user's review (UNDER_REVIEW + reviewer match). */
export function pendingActionReviewBadgeState(items: ActionItem[], user: SessionUser): PendingBadgeState {
  const mine = items.filter(
    (item) => item.status === "UNDER_REVIEW" && isDesignatedReviewer(item, user),
  );
  const count = mine.length;
  if (count === 0) return { count: 0, tone: null };
  const anyOverdue = mine.some(isOverdue);
  if (anyOverdue) return { count, tone: "red" };
  const anyDueSoon = mine.some(isDueWithinWeek);
  if (anyDueSoon) return { count, tone: "yellow" };
  return { count, tone: "green" };
}

export function mergePendingBadges(slices: PendingBadgeState[]): PendingBadgeState {
  const active = slices.filter((s) => s.count > 0 && s.tone);
  if (!active.length) return { count: 0, tone: null };
  const count = active.reduce((acc, s) => acc + s.count, 0);
  const tone = active.some((s) => s.tone === "red")
    ? "red"
    : active.some((s) => s.tone === "yellow")
      ? "yellow"
      : "green";
  return { count, tone };
}
