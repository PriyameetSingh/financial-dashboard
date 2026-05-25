/** Shared copy for on-screen report and PDF capture (no React). */

export function ordinalEn(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

/** e.g. 27th April, 2026, 10:00 AM, Monday — meeting time is not stored; use department default 10:00. */
export function formatMeetingScheduleLine(isoDate: string): string {
  const parts = isoDate.split("-");
  const ys = parts[0];
  const ms = parts[1];
  const ds = parts[2];
  if (!ys || !ms || !ds) return isoDate;
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const date = new Date(y, m - 1, d, 10, 0, 0);
  const month = date.toLocaleDateString("en-IN", { month: "long" });
  const weekday = date.toLocaleDateString("en-IN", { weekday: "long" });
  return `${ordinalEn(d)} ${month}, ${y}, 10:00 AM, ${weekday}`;
}

export function meetingReportTitleLine(ordinalInFy: number, meetingTitle: string | null): string {
  const trimmed = meetingTitle?.trim();
  if (trimmed) return trimmed;
  return `${ordinalEn(ordinalInFy)} Dashboard Meeting`;
}

export function financialYearHeaderLine(financialYearLabel: string | null): string {
  if (financialYearLabel?.trim()) return `FY ${financialYearLabel.trim()}`;
  return "FY —";
}
