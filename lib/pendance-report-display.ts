/**
 * Display formatting helpers for the Pendance Report.
 */

/** dd.mm.yyyy — moved here from lib/pendance-report.ts so client components
 * never import the server report builder (whose data-scope chain reaches
 * server-only modules: prisma, auth, tenant resolution). */
export function formatPendanceReportDate(iso: string): string {
  const [y, m, day] = iso.split("-");
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

export function pendanceReportTitleLine(meetingTitle: string | null): string {
  if (meetingTitle && meetingTitle.trim().length > 0) {
    return `Pendance Report — ${meetingTitle}`;
  }
  return "Pendance Report — User Adoption & Data Entry Status";
}

export function formatWeekPeriod(start: string, end: string): string {
  return `Week: ${start} to ${end}`;
}

export function formatTaskSummary(
  assignedCount: number,
  completedCount: number,
  pendingCount: number
): string {
  if (assignedCount === 0) return "No tasks assigned";
  const completionRate = Math.round((completedCount / assignedCount) * 100);
  return `${completedCount}/${assignedCount} completed (${completionRate}%)`;
}
