/**
 * Server-side PDF generation for the Pendance Report.
 * Uses the same styling and structure as the meeting report.
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
import type { PendanceReportPayload } from "@/lib/pendance-report";
import { formatPendanceReportDate } from "@/lib/pendance-report";

Font.registerHyphenationCallback((word) => [word]);

// Color scheme matching meeting report
const C = {
  black: "#1a1a1a",
  darkGray: "#2d2d2d",
  mediumGray: "#4a4a4a",
  lightGray: "#e8e8e8",
  veryLightGray: "#f9f7f6",
  white: "#ffffff",
  primaryBlue: "#c62828",
  primaryBlueDark: "#8e0000",
  primaryBlueLighter: "#f6dbd9",
  warningRed: "#d32f2f",
  warningRedLight: "#ffebee",
  accentGreen: "#f2b400",
  accentGreenLight: "#fff3d6",
  dataGray: "#757575",
  statusComplete: "#2e7d32",
  statusPending: "#f57c00",
  statusAtRisk: "#d32f2f",
};

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
  documentHeader: {
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: C.primaryBlue,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
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
  reportTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.black,
    textAlign: "center",
    marginTop: 1,
  },
  reportSubtitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.black,
    textAlign: "center",
    marginTop: 1,
  },
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
  tableRowSuccess: {
    backgroundColor: C.accentGreenLight,
  },
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
  statusBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 2,
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
  emptyState: {
    fontSize: 8.5,
    color: C.mediumGray,
    fontStyle: "italic",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.veryLightGray,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  mb16: { marginBottom: 16 },
});

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionNumber}>{number}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

export function PendanceReportPdfDocument({ data }: { data: PendanceReportPayload }) {
  const meetingDate = formatPendanceReportDate(data.meeting.meetingDate);
  const weekStart = formatPendanceReportDate(data.weekStartDate);
  const weekEnd = formatPendanceReportDate(data.weekEndDate);

  return (
    <Document title={`HUDD Pendance Report — ${data.meeting.meetingDate}`} author="HUDD Dashboard">
      <Page size="A4" style={s.page}>
        {/* Document Header */}
        <View style={[s.documentHeader, s.mb16]}>
          <View style={s.documentHeaderTextBlock}>
            <Text style={s.departmentName}>Government of Odisha</Text>
            <Text style={s.departmentName}>Housing &amp; Urban Development Department</Text>
            <Text style={s.reportTitle}>Pendance Report — User Adoption & Data Entry Status</Text>
            <Text style={s.reportSubtitle}>
              Meeting Date: {meetingDate}
              {data.meeting.title ? ` — ${data.meeting.title}` : ""}
            </Text>
            <Text style={s.reportSubtitle}>
              Week Period: {weekStart} to {weekEnd}
            </Text>
          </View>
          <View style={s.documentHeaderSeal}>
            <Image src={LOGO_PATH} style={{ width: 52, height: 52 }} />
          </View>
        </View>

        {/* Section 1: User Tasks Summary */}
        <View style={[s.sectionContainer, s.mb16]}>
          <SectionHeader number={1} title="User Task Assignment & Completion Status" />
          <View style={s.tableContainer}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: 100 }]}>User Name</Text>
              <Text style={[s.tableHeaderCell, { width: 80 }]}>Department</Text>
              <Text style={[s.tableHeaderCell, { width: 45, textAlign: "center" }]}>KPIs{"\n"}Assigned</Text>
              <Text style={[s.tableHeaderCell, { width: 45, textAlign: "center" }]}>KPIs{"\n"}Submitted</Text>
              <Text style={[s.tableHeaderCell, { width: 45, textAlign: "center" }]}>KPIs{"\n"}Pending</Text>
              <Text style={[s.tableHeaderCell, { width: 50, textAlign: "center" }]}>Action Items{"\n"}Assigned</Text>
              <Text style={[s.tableHeaderCell, { width: 50, textAlign: "center" }]}>Action Items{"\n"}Completed</Text>
              <Text style={[s.tableHeaderCell, s.tableHeaderCellLast, { width: 50, textAlign: "center" }]}>
                Action Items{"\n"}Pending
              </Text>
            </View>
            {data.userTasks.length === 0 ? (
              <Text style={s.emptyState}>No users with assigned tasks found.</Text>
            ) : (
              data.userTasks.map((user, i) => {
                const hasIssues = user.pendingKpiCount > 0 || user.pendingActionItemCount > 0;
                return (
                  <View
                    key={`${user.userName}-${i}`}
                    style={[s.tableRow, hasIssues ? s.tableRowWarning : i % 2 === 0 ? s.tableRowEven : s.tableRowOdd]}
                  >
                    <Text style={[s.tableCell, { width: 100 }, s.bold]}>{user.userName}</Text>
                    <Text style={[s.tableCell, { width: 80 }]}>{user.userDepartment}</Text>
                    <Text style={[s.tableCell, { width: 45 }, s.center]}>{user.assignedKpiCount}</Text>
                    <Text style={[s.tableCell, { width: 45 }, s.center]}>{user.submittedKpiCount}</Text>
                    <Text style={[s.tableCell, { width: 45 }, s.center, s.bold]}>
                      {user.pendingKpiCount > 0 ? user.pendingKpiCount : "—"}
                    </Text>
                    <Text style={[s.tableCell, { width: 50 }, s.center]}>{user.assignedActionItemCount}</Text>
                    <Text style={[s.tableCell, { width: 50 }, s.center]}>{user.completedActionItemCount}</Text>
                    <Text style={[s.tableCell, s.tableCellLast, { width: 50 }, s.center, s.bold]}>
                      {user.pendingActionItemCount > 0 ? user.pendingActionItemCount : "—"}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </Page>

      {/* Section 2: Detailed User Task Breakdown */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionContainer}>
          <SectionHeader number={2} title="Detailed User Task Breakdown" />
          {data.userTasks.length === 0 ? (
            <Text style={s.emptyState}>No user tasks to display.</Text>
          ) : (
            data.userTasks.map((user, userIdx) => (
              <View key={`detail-${user.userName}-${userIdx}`} style={{ marginBottom: 12 }}>
                <View style={s.schemeSubheader}>
                  <Text style={s.schemeSubheaderText}>
                    {user.userName} ({user.userDepartment})
                  </Text>
                </View>

                {/* KPI Details */}
                {user.kpiDetails.length > 0 && (
                  <View style={{ marginTop: 4, marginBottom: 8 }}>
                    <Text style={[s.bold, { fontSize: 8.5, marginBottom: 4, paddingHorizontal: 8 }]}>
                      KPI Assignments:
                    </Text>
                    <View style={s.tableContainer}>
                      <View style={s.tableHeaderRow}>
                        <Text style={[s.tableHeaderCell, { width: 250 }]}>KPI Description</Text>
                        <Text style={[s.tableHeaderCell, { width: 100 }]}>Scheme</Text>
                        <Text style={[s.tableHeaderCell, { width: 60, textAlign: "center" }]}>Status</Text>
                        <Text style={[s.tableHeaderCell, s.tableHeaderCellLast, { width: 75 }]}>Last Updated</Text>
                      </View>
                      {user.kpiDetails.map((kpi, kpiIdx) => (
                        <View
                          key={`kpi-${userIdx}-${kpiIdx}`}
                          style={[s.tableRow, kpi.hasData ? s.tableRowSuccess : s.tableRowWarning]}
                        >
                          <Text style={[s.tableCell, { width: 250 }]}>{kpi.description}</Text>
                          <Text style={[s.tableCell, { width: 100 }]}>{kpi.schemeName}</Text>
                          <Text style={[s.tableCell, { width: 60 }, s.center]}>
                            {kpi.hasData ? "Submitted" : "Pending"}
                          </Text>
                          <Text style={[s.tableCell, s.tableCellLast, { width: 75 }]}>
                            {kpi.lastUpdated ?? "—"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Action Item Details */}
                {user.actionItemDetails.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[s.bold, { fontSize: 8.5, marginBottom: 4, paddingHorizontal: 8 }]}>
                      Action Items:
                    </Text>
                    <View style={s.tableContainer}>
                      <View style={s.tableHeaderRow}>
                        <Text style={[s.tableHeaderCell, { width: 300 }]}>Action Item Title</Text>
                        <Text style={[s.tableHeaderCell, { width: 90 }]}>Status</Text>
                        <Text style={[s.tableHeaderCell, s.tableHeaderCellLast, { width: 75 }]}>Due Date</Text>
                      </View>
                      {user.actionItemDetails.map((action, actionIdx) => (
                        <View
                          key={`action-${userIdx}-${actionIdx}`}
                          style={[
                            s.tableRow,
                            action.status === "COMPLETED" ? s.tableRowSuccess : s.tableRowWarning,
                          ]}
                        >
                          <Text style={[s.tableCell, { width: 300 }]}>{action.title}</Text>
                          <Text style={[s.tableCell, { width: 90 }]}>
                            {action.status.replace(/_/g, " ")}
                          </Text>
                          <Text style={[s.tableCell, s.tableCellLast, { width: 75 }]}>
                            {action.dueDate}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </Page>

      {/* Section 3: Financial Data Updates */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionContainer}>
          <SectionHeader number={3} title={`Financial Data Entry Status (Week: ${weekStart} to ${weekEnd})`} />
          {data.financialDataUpdates.length === 0 ? (
            <Text style={s.emptyState}>No financial data updates to display.</Text>
          ) : (
            data.financialDataUpdates.map((scheme, schemeIdx) => (
              <View key={`finance-${schemeIdx}`} style={{ marginBottom: 8 }}>
                <View style={s.schemeSubheader}>
                  <Text style={s.schemeSubheaderText}>
                    {scheme.schemeName} ({scheme.schemeType})
                  </Text>
                </View>
                <View style={s.tableContainer}>
                  <View style={s.tableHeaderRow}>
                    <Text style={[s.tableHeaderCell, { width: 200 }]}>Component / Subscheme</Text>
                    <Text style={[s.tableHeaderCell, { width: 100, textAlign: "center" }]}>Data Updated This Week</Text>
                    <Text style={[s.tableHeaderCell, { width: 80 }]}>Last Updated</Text>
                    <Text style={[s.tableHeaderCell, s.tableHeaderCellLast, { width: 100 }]}>Updated By</Text>
                  </View>
                  {scheme.subschemes.map((sub, subIdx) => (
                    <View
                      key={`sub-${schemeIdx}-${subIdx}`}
                      style={[s.tableRow, sub.hasDataThisWeek ? s.tableRowSuccess : s.tableRowWarning]}
                    >
                      <Text style={[s.tableCell, { width: 200 }]}>
                        {sub.subschemeName ?? "Main Scheme"}
                      </Text>
                      <Text style={[s.tableCell, { width: 100 }, s.center, s.bold]}>
                        {sub.hasDataThisWeek ? "Yes" : "No"}
                      </Text>
                      <Text style={[s.tableCell, { width: 80 }]}>{sub.lastUpdated ?? "—"}</Text>
                      <Text style={[s.tableCell, s.tableCellLast, { width: 100 }]}>
                        {sub.updatedBy ?? "—"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      </Page>
    </Document>
  );
}

/**
 * Renders the pendance report as a PDF and returns a Node.js Buffer.
 * Safe to call from a Next.js Route Handler (nodejs runtime).
 */
export async function renderPendanceReportPdfBuffer(data: PendanceReportPayload): Promise<Buffer> {
  const element = React.createElement(PendanceReportPdfDocument, { data }) as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
