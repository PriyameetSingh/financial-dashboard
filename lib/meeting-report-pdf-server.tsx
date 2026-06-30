/**
 * Improved Server-side PDF generation for the meeting report.
 * Enhanced for:
 * - Visual hierarchy and scanning
 * - Accessibility (semantic structure, color contrast, readable typography)
 * - Professional aesthetic (refined typography, generous spacing, clear information architecture)
 * - Better data readability (improved table layouts, visual grouping)
 */
import React from "react";
import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
  Font,
  Image,
} from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { MeetingReportPayload } from "@/lib/meeting-report";
import {
  financialYearHeaderLine,
  formatMeetingScheduleLine,
  meetingReportTitleLine,
} from "@/lib/meeting-report-display";

Font.registerHyphenationCallback((word) => [word]);

// ─── Colour scheme pulled from the provided screenshot ────────────────────────
// Header bars: deep red, separators: warm gold, row accents: pale peach
const C = {
  // Neutrals - primary text and structure
  black: "#1a1a1a",
  darkGray: "#2d2d2d",
  mediumGray: "#4a4a4a",
  lightGray: "#e8e8e8",
  veryLightGray: "#f9f7f6",
  white: "#ffffff",

  // Primary accent - header bars (deep red from screenshot)
  primaryBlue: "#c62828",        // used previously for primary headers — now deep red
  primaryBlueDark: "#8e0000",    // darker red for stronger header contrast
  primaryBlueLighter: "#f6dbd9", // pale peach used for subtle row backgrounds / highlights

  // Secondary - for warnings and highlights (keep red family for emphasis)
  warningRed: "#d32f2f",
  warningRedLight: "#ffebee",
  warningRedDark: "#b71c1c",

  // Tertiary - scheme/section separators (warm gold from screenshot)
  accentGreen: "#f2b400",       // repurposed as gold accent
  accentGreenLight: "#fff3d6",  // pale gold background for subheaders

  // Data visualization
  dataGray: "#757575",
  dataGrayLight: "#f0f0f0",

  // Status indicators
  statusComplete: "#2e7d32",
  statusPending: "#f57c00",
  statusAtRisk: "#d32f2f",
};

// ─── Improved Shared Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.black,
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 32,
    backgroundColor: C.white,
    lineHeight: 1.5,
  },

  // Document header - sets context
  documentHeader: {
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: C.primaryBlue,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "column",
    alignItems: "center",
  },
  documentHeaderTextBlock: {
    flex: 1,
    alignItems: "center",
  },
  documentHeaderSeal: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  departmentName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.black,
    textAlign: "center",
    lineHeight: 1.4,
  },
  financialYear: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.black,
    textAlign: "center",
    marginTop: 1,
  },
  meetingTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.black,
    textAlign: "center",
    marginTop: 1,
    lineHeight: 1.4,
  },
  meetingDetails: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.black,
    textAlign: "center",
    marginTop: 1,
  },

  // Section headers - clear visual separation
  sectionContainer: {
    marginBottom: 16,
    breakInside: "avoid",
  },
  sectionHeader: {
    flexDirection: "row",
    backgroundColor: C.primaryBlue,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 0,
    alignItems: "center",
  },
  sectionNumber: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginRight: 12,
    width: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    flex: 1,
    lineHeight: 1.3,
  },

  // Generic list container
  listContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.veryLightGray,
    borderLeft: `3pt solid ${C.primaryBlueLighter}`,
  },
  listItem: {
    marginBottom: 6,
    lineHeight: 1.4,
  },
  listItemText: {
    fontSize: 8.5,
    color: C.darkGray,
  },
  emptyState: {
    fontSize: 8.5,
    color: C.mediumGray,
    fontStyle: "italic",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.veryLightGray,
  },

  // ─── Table Styles (Improved) ───
  tableContainer: {
    backgroundColor: C.white,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: C.primaryBlueDark,
    borderBottomWidth: 2,
    borderBottomColor: C.primaryBlue,
  },
  tableHeaderCell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    color: C.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    lineHeight: 1.3,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.2)",
  },
  tableHeaderCellLast: {
    borderRightWidth: 0,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.lightGray,
  },
  tableCell: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 8,
    color: C.darkGray,
    lineHeight: 1.35,
    borderRightWidth: 1,
    borderRightColor: C.lightGray,
  },
  tableCellLast: {
    borderRightWidth: 0,
  },
  tableRowEven: {
    backgroundColor: C.veryLightGray,
  },
  tableRowOdd: {
    backgroundColor: C.white,
  },
  tableRowWarning: {
    backgroundColor: C.warningRedLight,
  },
  tableRowAttn: {
    backgroundColor: C.accentGreenLight,
  },

  // Scheme subheader
  schemeSubheader: {
    flexDirection: "row",
    backgroundColor: C.accentGreenLight,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: C.accentGreen,
    borderBottomWidth: 1,
    borderBottomColor: C.accentGreen,
  },
  schemeSubheaderText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.accentGreen,
  },

  // Financial data - right-aligned numbers
  amountCell: {
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.darkGray,
  },
  percentCell: {
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  percentLow: {
    color: C.warningRed,
    backgroundColor: C.warningRedLight,
  },
  percentHigh: {
    color: C.statusComplete,
  },

  // Key decisions table
  decisionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: C.black,
    marginBottom: 2,
  },
  decisionDescription: {
    fontSize: 7.5,
    color: C.mediumGray,
    marginBottom: 2,
    lineHeight: 1.3,
  },
  decisionNote: {
    fontSize: 7,
    color: C.dataGray,
    marginTop: 3,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: C.lightGray,
    lineHeight: 1.2,
  },
  statusBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 2,
    marginBottom: 2,
  },
  statusComplete: {
    color: C.statusComplete,
    backgroundColor: C.accentGreenLight,
  },
  statusPending: {
    color: C.statusPending,
    backgroundColor: "#fff3e0",
  },
  statusAtRisk: {
    color: C.statusAtRisk,
    backgroundColor: C.warningRedLight,
  },

  // KPI specific
  kpiRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.lightGray,
  },
  kpiNum: {
    textAlign: "center",
    fontSize: 8,
    color: C.mediumGray,
    fontFamily: "Helvetica-Bold",
  },
  kpiDesc: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.black,
    lineHeight: 1.3,
  },
  kpiValue: {
    textAlign: "right",
    fontSize: 8,
    color: C.primaryBlue,
    fontFamily: "Helvetica-Bold",
  },
  kpiUnit: {
    fontSize: 7.5,
    color: C.mediumGray,
  },

  // Meeting notes
  notesSection: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.primaryBlueLighter,
    borderLeftWidth: 3,
    borderLeftColor: C.primaryBlue,
  },
  notesTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.primaryBlue,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 8,
    color: C.darkGray,
    lineHeight: 1.4,
  },

  // Utilities
  mb16: { marginBottom: 16 },
  mb12: { marginBottom: 12 },
  mb8: { marginBottom: 8 },
  mb4: { marginBottom: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCr(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "—";
  return `${p.toFixed(1)}%`;
}

function getPercentStatus(pct: number | null): "warning" | "success" | "neutral" {
  if (pct === null) return "neutral";
  if (pct < 15) return "warning";
  if (pct > 50) return "success";
  return "neutral";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionNumber}>{number}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

/** Finance table columns — fit A4 portrait usable width ~531pt */
const FIN_COLS = {
  planType: 175,
  budget: 78,
  soExp: 82,
  ifmsExp: 82,
  pct: 68,
};

function FinanceTableHeader({ asOf, fyLabel }: { asOf: string; fyLabel: string }) {
  return (
    <View style={s.tableHeaderRow}>
      <Text style={[s.tableHeaderCell, { width: FIN_COLS.planType }]}>Plan Type</Text>
      <Text style={[s.tableHeaderCell, { width: FIN_COLS.budget, textAlign: "right" }]}>
        Budget Est. (Cr.){"\n"}{fyLabel}
      </Text>
      <Text style={[s.tableHeaderCell, { width: FIN_COLS.soExp, textAlign: "right" }]}>
        S.O. Exp. (Cr.){"\n"}as on {asOf}
      </Text>
      <Text style={[s.tableHeaderCell, { width: FIN_COLS.ifmsExp, textAlign: "right" }]}>
        IFMS Exp. (Cr.){"\n"}as on {asOf}
      </Text>
      <Text style={[s.tableHeaderCell, s.tableHeaderCellLast, { width: FIN_COLS.pct, textAlign: "right" }]}>
        % as per{"\n"}IFMS
      </Text>
    </View>
  );
}

type FinRow = MeetingReportPayload["financeProgress"][0] | MeetingReportPayload["schemesFinancialProgress"][0]["rows"][0];

function FinanceRow({ row, index }: { row: FinRow; index: number }) {
  const isSchemeRow = "rowVariant" in row;
  const variant = isSchemeRow ? (row as { rowVariant: string }).rowVariant : "normal";
  const isBold = ["heading", "type_total", "section_total", "grand_total"].includes(variant);
  const isHeading = variant === "heading";
  const pctVal = "pctIfms" in row ? (row as { pctIfms: number | null }).pctIfms : null;
  const pctStatus = getPercentStatus(pctVal);
  
  const isWarning = pctStatus === "warning" && !isHeading;
  const isSuccess = pctStatus === "success";

  return (
    <View style={[
      s.tableRow,
      isWarning ? s.tableRowWarning : isSuccess ? s.tableRowAttn : (index % 2 === 0 ? s.tableRowEven : s.tableRowOdd),
    ]}>
      <Text style={[s.tableCell, { width: FIN_COLS.planType, fontFamily: isBold ? "Helvetica-Bold" : "Helvetica" }]}>
        {row.planType}
      </Text>
      <Text style={[s.tableCell, { width: FIN_COLS.budget }, s.amountCell]}>
        {isHeading ? "" : fmtCr(row.budgetEstimateCr)}
      </Text>
      <Text style={[s.tableCell, { width: FIN_COLS.soExp }, s.amountCell]}>
        {isHeading ? "" : fmtCr(row.soExpenditureCr)}
      </Text>
      <Text style={[s.tableCell, { width: FIN_COLS.ifmsExp }, s.amountCell, ...(isBold ? [s.bold] : [])]}>
        {isHeading ? "" : fmtCr(row.ifmsExpenditureCr)}
      </Text>
      <Text style={[
        s.tableCell,
        s.tableCellLast,
        { width: FIN_COLS.pct },
        s.percentCell,
        ...(isWarning ? [s.percentLow] : []),
        ...(isSuccess ? [s.percentHigh] : []),
      ]}>
        {isHeading ? "" : fmtPct(pctVal)}
      </Text>
    </View>
  );
}

// ─── Main document ────────────────────────────────────────────────────────────

export function MeetingReportPdfDocument({ data }: { data: MeetingReportPayload }) {
  const fy = data.meeting.financialYearLabel ?? "2026-27";
  const meetingLine = meetingReportTitleLine(data.meetingOrdinalInFy, data.meeting.title);
  const fyLine = financialYearHeaderLine(data.meeting.financialYearLabel);
  const scheduleLine = formatMeetingScheduleLine(data.meeting.meetingDate);
  const asOf = data.financeAsOfLabel ?? "—";

  // Flatten presentations
  const presentationRows: Array<{ letter: string; label: string }> = [];
  let pidx = 0;
  for (const g of data.presentationsByVertical) {
    for (const f of g.files) {
      const letter = pidx < 26 ? String.fromCharCode(97 + pidx) : String(pidx + 1);
      presentationRows.push({ letter, label: f.fileName });
      pidx++;
    }
  }

  // Group KPIs by scheme+vertical
  type KpiGroup = { schemeLabel: string; vertical: string; rows: typeof data.kpiRows };
  const kpiGroups: KpiGroup[] = [];
  for (const row of data.kpiRows) {
    const prev = kpiGroups[kpiGroups.length - 1];
    if (prev && prev.schemeLabel === row.schemeLabel && prev.vertical === row.vertical) {
      prev.rows.push(row);
    } else {
      kpiGroups.push({ schemeLabel: row.schemeLabel, vertical: row.vertical, rows: [row] });
    }
  }

  // KPI column widths — fit A4 portrait usable width ~531pt
  // num1/num2 must be wide enough to hold "Numerator" (~57pt) and "Denominator" (~66pt) without overflow
  const KPI_COLS = { num: 16, desc: 110, actionBy: 62, num1: 58, unit1: 50, num2: 68, unit2: 50, remarks: 74 };

  return (
    <Document title={`HUDD Meeting Pack — ${data.meeting.meetingDate}`} author="HUDD Dashboard">
      <Page size="A4" style={s.page}>

        {/* ── Document Header ── */}
        <View style={[s.documentHeader, s.mb16]}>
          <View style={[s.documentHeaderSeal, { marginBottom: 6 }]}>
            <Image src={LOGO_PATH} style={{ width: 52, height: 52 }} />
          </View>
          <View style={s.documentHeaderTextBlock}>
            <Text style={s.departmentName}>Government of Odisha</Text>
            <Text style={s.departmentName}>Housing &amp; Urban Development Department</Text>
            <Text style={s.financialYear}>{fyLine}</Text>
            <Text style={s.meetingTitle}>{meetingLine}</Text>
            <Text style={s.meetingDetails}>{scheduleLine}</Text>
          </View>
        </View>

        {/* ── 1. Topics ── */}
        <View style={s.sectionContainer}>
          <SectionHeader number={1} title="Important Topics for Discussion" />
          <View style={s.listContainer}>
            {data.topics.length === 0 && presentationRows.length === 0 ? (
              <Text style={s.emptyState}>No topics or presentations recorded.</Text>
            ) : (
              <React.Fragment>
                {data.topics.map((t, i) => (
                  <View key={t.id} style={s.listItem}>
                    <Text style={s.listItemText}>
                      <Text style={s.bold}>{i + 1}.</Text> {t.topic}
                    </Text>
                  </View>
                ))}
                {presentationRows.length > 0 && (
                  <View style={s.listItem}>
                    <Text style={[s.listItemText, s.bold]}>
                      <Text style={s.bold}>{data.topics.length + 1}.</Text> Proposed Presentations
                    </Text>
                    {presentationRows.map((row) => (
                      <View key={`${row.letter}-${row.label}`} style={{ marginLeft: 12, marginTop: 4, flexDirection: "row" }}>
                        <Text style={[s.listItemText, { marginRight: 6 }]}>•</Text>
                        <Text style={s.listItemText}>{row.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </React.Fragment>
            )}
          </View>
        </View>

      </Page>

      {/* ── Finance Tables ── */}
      <Page size="A4" style={s.page}>

        {/* ── 2. Financial Progress ── */}
        <View style={[s.sectionContainer, s.mb16]}>
          <SectionHeader number={2} title={`Financial Progress ${fy} (In Cr.)`} />
          <View style={s.tableContainer}>
            <FinanceTableHeader asOf={asOf} fyLabel={fy} />
            {data.financeProgress.map((row, i) => (
              <FinanceRow key={`fin-${i}`} row={row} index={i} />
            ))}
          </View>
        </View>

        {/* ── 3. Scheme-wise Financial Progress ── */}
        <View style={s.sectionContainer}>
          <SectionHeader number={3} title={`Schemes wise Financial Progress ${fy} (In Cr.)`} />
          {data.schemesFinancialProgress.map((block, bi) => (
            <View key={block.sponsorshipKey} style={{ marginBottom: bi < data.schemesFinancialProgress.length - 1 ? 8 : 0 }}>
              <View style={s.schemeSubheader}>
                <Text style={s.schemeSubheaderText}>{block.sponsorshipHeading}</Text>
              </View>
              <View style={s.tableContainer}>
                <FinanceTableHeader asOf={asOf} fyLabel={fy} />
                {block.rows.map((row, i) => (
                  <FinanceRow key={`scheme-${block.sponsorshipKey}-${i}`} row={row} index={i} />
                ))}
              </View>
            </View>
          ))}
        </View>

      </Page>

      {/* ── Key Decisions & KPIs ── */}
      <Page size="A4" style={s.page}>

        {/* ── 4. Key Decisions ── */}
        <View style={[s.sectionContainer, s.mb16]}>
          <SectionHeader number={4} title="Key Decisions from Last Dashboard Meetings" />
          <View style={s.tableContainer}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { flex: 3 }]}>Decision &amp; Details</Text>
              <Text style={[s.tableHeaderCell, { flex: 1 }]}>Action by</Text>
              <Text style={[s.tableHeaderCell, { flex: 1 }]}>Timeline</Text>
              <Text style={[s.tableHeaderCell, s.tableHeaderCellLast, { flex: 0.8 }]}>Status</Text>
            </View>
            {data.keyDecisions.length === 0 ? (
              <Text style={[s.emptyState, { marginBottom: 0 }]}>No meeting decisions recorded up to this meeting.</Text>
            ) : (
              data.keyDecisions.map((d) => (
                <View
                  key={d.id}
                  style={[
                    s.tableRow,
                    d.statusCarriedForward ? s.tableRowWarning : s.tableRowOdd,
                  ]}
                >
                  <View style={[s.tableCell, { flex: 3, paddingVertical: 8 }]}>
                    <Text style={s.decisionTitle}>{d.title}</Text>
                    <Text style={s.decisionDescription}>{d.description}</Text>
                    {d.sourceMeetingDate && (
                      <Text style={s.decisionNote}>Source: {d.sourceMeetingDate}</Text>
                    )}
                    {d.latestNote && (
                      <Text style={s.decisionNote}>Latest: {d.latestNote}</Text>
                    )}
                  </View>
                  <Text style={[s.tableCell, { flex: 1, fontSize: 8 }]}>{d.actionBy}</Text>
                  <Text style={[s.tableCell, { flex: 1, fontSize: 8 }]}>{d.timeline}</Text>
                  <View style={[s.tableCell, s.tableCellLast, { flex: 0.8, paddingVertical: 8 }]}>
                    <Text style={[
                      s.statusBadge,
                      d.statusLabel.toLowerCase().includes("complete") ? s.statusComplete
                        : d.statusLabel.toLowerCase().includes("risk") ? s.statusAtRisk
                        : s.statusPending,
                    ]}>
                      {d.statusLabel}
                    </Text>
                    {d.statusCarriedForward && (
                      <Text style={{ fontSize: 6.5, color: C.statusPending, marginTop: 2 }}>
                        Carried from prior meeting
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

      </Page>

      {/* ── KPIs (may span multiple pages) ── */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionContainer}>
          <SectionHeader number={5} title="Key Performance Indicators (KPIs) — Weekly Update" />
          <View style={s.tableContainer}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: KPI_COLS.num }]}>#</Text>
              <Text style={[s.tableHeaderCell, { width: KPI_COLS.desc }]}>KPI Description</Text>
              <Text style={[s.tableHeaderCell, { width: KPI_COLS.actionBy }]}>Owner</Text>
              <Text style={[s.tableHeaderCell, { width: KPI_COLS.num1, textAlign: "right" }]}>Numerator</Text>
              <Text style={[s.tableHeaderCell, { width: KPI_COLS.unit1 }]}>Unit</Text>
              <Text style={[s.tableHeaderCell, { width: KPI_COLS.num2, textAlign: "right" }]}>Denominator</Text>
              <Text style={[s.tableHeaderCell, { width: KPI_COLS.unit2 }]}>Unit</Text>
              <Text style={[s.tableHeaderCell, s.tableHeaderCellLast, { width: KPI_COLS.remarks }]}>Remarks</Text>
            </View>
            {data.kpiRows.length === 0 ? (
              <Text style={[s.emptyState, { marginBottom: 0 }]}>No KPI definitions for this financial year.</Text>
            ) : (
              kpiGroups.map((group, gi) => (
                <React.Fragment key={`${group.schemeLabel}-${group.vertical}-${gi}`}>
                  <View style={[s.tableRow, s.tableRowAttn]}>
                    <Text style={[s.tableCell, { flex: 1, borderRightWidth: 0, color: C.accentGreen, fontFamily: "Helvetica-Bold", fontSize: 8.5 }]}>
                      {group.schemeLabel}{group.vertical.trim() ? ` • ${group.vertical.trim()}` : ""}
                    </Text>
                  </View>
                  {group.rows.map((k, ri) => (
                    <View
                      key={`${group.schemeLabel}-${group.vertical}-${k.index}`}
                      style={[s.tableRow, k.warnLowPct ? s.tableRowWarning : (ri % 2 === 0 ? s.tableRowEven : s.tableRowOdd)]}
                    >
                      <Text style={[s.tableCell, { width: KPI_COLS.num }, s.center, s.kpiNum]}>{ri + 1}</Text>
                      <Text style={[s.tableCell, { width: KPI_COLS.desc }, s.kpiDesc]}>{k.description}</Text>
                      <View style={[s.tableCell, { width: KPI_COLS.actionBy }]}>
                        <Text style={[s.bold, { fontSize: 8 }]}>{k.actionBy}</Text>
                        <Text style={{ fontSize: 7, marginTop: 2, textTransform: "capitalize", color: C.mediumGray }}>{k.statusLabel}</Text>
                      </View>
                      <Text style={[s.tableCell, { width: KPI_COLS.num1 }, s.kpiValue]}>{k.numerator}</Text>
                      <Text style={[s.tableCell, { width: KPI_COLS.unit1, fontSize: 7.5, color: C.mediumGray }]}>{k.numeratorUnit || "—"}</Text>
                      <Text style={[s.tableCell, { width: KPI_COLS.num2 }, s.kpiValue]}>{k.denominator}</Text>
                      <Text style={[s.tableCell, { width: KPI_COLS.unit2, fontSize: 7.5, color: C.mediumGray }]}>{k.denominatorUnit || "—"}</Text>
                      <Text style={[s.tableCell, s.tableCellLast, { width: KPI_COLS.remarks, fontSize: 7.5 }]}>{k.remarks || "—"}</Text>
                    </View>
                  ))}
                </React.Fragment>
              ))
            )}
          </View>
        </View>

        {/* ── Meeting Notes ── */}
        {data.meeting.notes && (
          <View style={s.notesSection}>
            <Text style={s.notesTitle}>Meeting Notes</Text>
            <Text style={s.notesText}>{data.meeting.notes}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

/**
 * Renders the meeting report as a PDF and returns a Node.js Buffer.
 * Safe to call from a Next.js Route Handler (nodejs runtime).
 */
export async function renderMeetingReportPdfBuffer(data: MeetingReportPayload): Promise<Buffer> {
  const element = React.createElement(MeetingReportPdfDocument, { data }) as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}