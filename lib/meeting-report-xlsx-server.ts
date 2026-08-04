import * as XLSX from "xlsx";
import type { MeetingReportPayload, MeetingReportFinanceRow, MeetingReportSchemeRow } from "@/lib/meeting-report";
import {
  formatMeetingScheduleLine,
  meetingReportTitleLine,
  financialYearHeaderLine,
} from "@/lib/meeting-report-display";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Excel sheet names cannot exceed 31 chars and must not contain : \ / ? * [ ] */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
}

function pctLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function numLabel(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(2);
}

function financeRowTypeLabel(variant: MeetingReportFinanceRow["rowVariant"]): string {
  switch (variant) {
    case "section_total":
      return "Section Total";
    case "grand_total":
      return "Grand Total";
    default:
      return "Row";
  }
}

function schemeRowTypeLabel(variant: MeetingReportSchemeRow["rowVariant"]): string {
  switch (variant) {
    case "heading":
      return "Heading";
    case "scheme":
      return "Scheme";
    case "subscheme":
      return "Sub-scheme";
    case "type_total":
      return "Type Total";
    default:
      return "Row";
  }
}

function applyCols(ws: XLSX.WorkSheet, widths: number[]): void {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function buildCoverSheet(data: MeetingReportPayload): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    ["Field", "Value"],
    ["Report", "HUDD Dashboard Meeting Pack"],
    ["Meeting #", data.meetingOrdinalInFy],
    ["Financial Year", financialYearHeaderLine(data.meeting.financialYearLabel)],
    ["Meeting Date", data.meeting.meetingDate],
    ["Schedule", formatMeetingScheduleLine(data.meeting.meetingDate)],
    ["Title", meetingReportTitleLine(data.meetingOrdinalInFy, data.meeting.title)],
    ["Finance As-Of", data.financeAsOfLabel ?? "—"],
    ["Notes", data.meeting.notes ?? ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  applyCols(ws, [20, 60]);
  return ws;
}

function buildTopicsSheet(data: MeetingReportPayload): XLSX.WorkSheet {
  const headers = ["#", "Topic"];
  const rows: (string | number)[][] = data.topics.map((t, i) => [i + 1, t.topic]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  applyCols(ws, [6, 80]);
  return ws;
}

function buildPresentationsSheet(data: MeetingReportPayload): XLSX.WorkSheet {
  const headers = ["Vertical", "File Name", "File ID"];
  const rows: (string | number)[][] = [];
  for (const g of data.presentationsByVertical) {
    for (const f of g.files) {
      rows.push([g.verticalLabel, f.fileName, f.id]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  applyCols(ws, [30, 60, 38]);
  return ws;
}

function buildFinanceSheet(rows: MeetingReportFinanceRow[]): XLSX.WorkSheet {
  const headers = [
    "Plan Type",
    "Budget Estimate (Cr)",
    "SO Expenditure (Cr)",
    "IFMS Expenditure (Cr)",
    "% IFMS",
    "Row Type",
  ];
  const body: (string | number)[][] = rows.map((r) => [
    r.planType,
    numLabel(r.budgetEstimateCr),
    numLabel(r.soExpenditureCr),
    numLabel(r.ifmsExpenditureCr),
    pctLabel(r.pctIfms),
    financeRowTypeLabel(r.rowVariant),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
  applyCols(ws, [40, 20, 22, 24, 12, 14]);
  return ws;
}

function buildSchemeSheet(rows: MeetingReportSchemeRow[]): XLSX.WorkSheet {
  const headers = [
    "Plan Type",
    "Budget Estimate (Cr)",
    "SO Expenditure (Cr)",
    "IFMS Expenditure (Cr)",
    "% IFMS",
    "Row Type",
  ];
  const body: (string | number)[][] = rows.map((r) => [
    r.planType,
    numLabel(r.budgetEstimateCr),
    numLabel(r.soExpenditureCr),
    numLabel(r.ifmsExpenditureCr),
    pctLabel(r.pctIfms),
    schemeRowTypeLabel(r.rowVariant),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
  applyCols(ws, [40, 20, 22, 24, 12, 14]);
  return ws;
}

function buildKeyDecisionsSheet(data: MeetingReportPayload): XLSX.WorkSheet {
  const headers = [
    "Title",
    "Description",
    "Source Meeting Date",
    "Action By",
    "Timeline",
    "Status",
    "Latest Note",
    "Carried Forward",
    "Priority",
  ];
  const rows: (string | number)[][] = data.keyDecisions.map((d) => [
    d.title,
    d.description,
    d.sourceMeetingDate ?? "—",
    d.actionBy,
    d.timeline,
    d.statusLabel,
    d.latestNote,
    d.statusCarriedForward ? "Yes" : "No",
    d.priority,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  applyCols(ws, [36, 50, 18, 28, 14, 16, 50, 14, 12]);
  return ws;
}

function buildKpisSheet(data: MeetingReportPayload): XLSX.WorkSheet {
  const headers = [
    "#",
    "Scheme",
    "Vertical",
    "KPI Description",
    "Action By",
    "Status",
    "Numerator",
    "Numerator Unit",
    "Denominator",
    "Denominator Unit",
    "Remarks",
    "Monitoring Level",
  ];
  const rows: (string | number)[][] = data.kpiRows.map((k) => [
    k.index,
    k.schemeLabel,
    k.vertical,
    k.description,
    k.actionBy,
    k.statusLabel,
    k.numerator,
    k.numeratorUnit,
    k.denominator,
    k.denominatorUnit,
    k.remarks,
    k.monitoringLevel ?? "—",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  applyCols(ws, [6, 26, 22, 50, 28, 16, 14, 16, 14, 18, 40, 18]);
  return ws;
}

function buildNotesSheet(notes: string): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([["Notes"], [notes]]);
  applyCols(ws, [80]);
  return ws;
}

/**
 * Builds a single .xlsx workbook for the meeting report. Each segment goes
 * into its own worksheet, mirroring the on-screen / PDF section order.
 */
export function renderMeetingReportXlsxBuffer(data: MeetingReportPayload): Buffer {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildCoverSheet(data), sanitizeSheetName("Cover"));

  XLSX.utils.book_append_sheet(
    wb,
    buildTopicsSheet(data),
    sanitizeSheetName("1. Topics"),
  );

  XLSX.utils.book_append_sheet(
    wb,
    buildPresentationsSheet(data),
    sanitizeSheetName("1. Presentations"),
  );

  XLSX.utils.book_append_sheet(
    wb,
    buildFinanceSheet(data.financeProgress),
    sanitizeSheetName("2. Financial Progress"),
  );

  for (const block of data.schemesFinancialProgress) {
    XLSX.utils.book_append_sheet(
      wb,
      buildSchemeSheet(block.rows),
      sanitizeSheetName(`3. ${block.sponsorshipHeading}`),
    );
  }

  XLSX.utils.book_append_sheet(
    wb,
    buildKeyDecisionsSheet(data),
    sanitizeSheetName("4. Key Decisions"),
  );

  XLSX.utils.book_append_sheet(wb, buildKpisSheet(data), sanitizeSheetName("5. KPIs"));

  if (data.meeting.notes && data.meeting.notes.trim().length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      buildNotesSheet(data.meeting.notes),
      sanitizeSheetName("Notes"),
    );
  }

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

export const MEETING_REPORT_XLSX_MIME = XLSX_MIME;
