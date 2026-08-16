"use client";

import { Fragment } from "react";
import clsx from "clsx";
import type { PendanceReportPayload } from "@/lib/pendance-report";
import { formatPendanceReportDate } from "@/lib/pendance-report-display";
import { tenantConfig } from "@/lib/tenant-config";
import { TableScroll } from "@/components/nocturne";

function SectionTitleBar({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex border ax-doc-rule ax-doc-band font-bold">
      <div className="flex w-11 shrink-0 items-center justify-center border-r ax-doc-rule px-2 py-2 text-center">{n}</div>
      <div className="flex-1 px-3 py-2">{title}</div>
    </div>
  );
}

export type PendanceReportContentProps = {
  data: PendanceReportPayload;
  logoSrc: string;
};

export function PendanceReportContent({ data, logoSrc }: PendanceReportContentProps) {
  const meetingDate = formatPendanceReportDate(data.meeting.meetingDate);
  const weekStart = formatPendanceReportDate(data.weekStartDate);
  const weekEnd = formatPendanceReportDate(data.weekEndDate);

  return (
    <div
      className="pendance-report-root ax-doc-paper"
      style={{ fontFamily: "Arial, Helvetica, system-ui, sans-serif" }}
    >
      <header className="mb-6 border-b ax-doc-rule pb-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-center text-sm font-bold leading-snug sm:text-base">
            <p>{tenantConfig().pdfHeaderLine}</p>
            <p>Housing &amp; Urban Development Department</p>
            <p className="mt-2 text-base">Pendance Report — User Adoption & Data Entry Status</p>
            <p className="mt-1 text-sm">
              Meeting Date: {meetingDate}
              {data.meeting.title ? ` — ${data.meeting.title}` : ""}
            </p>
            <p className="text-sm">
              Week Period: {weekStart} to {weekEnd}
            </p>
          </div>
          <div className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- runtime URL from public + basePath */}
            <img src={logoSrc} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
          </div>
        </div>
      </header>

      {/* Section 1: User Tasks Summary */}
      <section className="mb-8 break-inside-avoid space-y-0">
        <SectionTitleBar n={1} title="User Task Assignment & Completion Status" />
        <TableScroll label="Officer pendency summary" className="overflow-x-auto border border-t-0 ax-doc-rule">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="ax-doc-header text-left text-xs">
                <th className="border ax-doc-header-rule px-2 py-2 font-semibold">User Name</th>
                <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Department</th>
                <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-center">
                  KPIs<br />Assigned
                </th>
                <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-center">
                  KPIs<br />Submitted
                </th>
                <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-center">
                  KPIs<br />Pending
                </th>
                <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-center">
                  Action Items<br />Assigned
                </th>
                <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-center">
                  Action Items<br />Completed
                </th>
                <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-center">
                  Action Items<br />Pending
                </th>
              </tr>
            </thead>
            <tbody>
              {data.userTasks.length === 0 ? (
                <tr>
                  <td className="border ax-doc-rule px-3 py-4 ax-doc-quiet" colSpan={8}>
                    No users with assigned tasks found.
                  </td>
                </tr>
              ) : (
                data.userTasks.map((user, i) => {
                  const hasIssues = user.pendingKpiCount > 0 || user.pendingActionItemCount > 0;
                  return (
                    <tr
                      key={`${user.userName}-${i}`}
                      className={clsx(
 "border-b ax-doc-rule",
                        hasIssues ? "ax-doc-row-attention" : i % 2 === 0 ? "ax-doc-paper" : "ax-doc-zebra"
                      )}
                    >
                      <td className="border ax-doc-rule px-2 py-2 font-semibold">{user.userName}</td>
                      <td className="border ax-doc-rule px-2 py-2">{user.userDepartment}</td>
                      <td className="border ax-doc-rule px-2 py-2 text-center tabular-nums">{user.assignedKpiCount}</td>
                      <td className="border ax-doc-rule px-2 py-2 text-center tabular-nums">{user.submittedKpiCount}</td>
                      <td className="border ax-doc-rule px-2 py-2 text-center tabular-nums font-semibold">
                        {user.pendingKpiCount > 0 ? user.pendingKpiCount : "—"}
                      </td>
                      <td className="border ax-doc-rule px-2 py-2 text-center tabular-nums">{user.assignedActionItemCount}</td>
                      <td className="border ax-doc-rule px-2 py-2 text-center tabular-nums">{user.completedActionItemCount}</td>
                      <td className="border ax-doc-rule px-2 py-2 text-center tabular-nums font-semibold">
                        {user.pendingActionItemCount > 0 ? user.pendingActionItemCount : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {/* Section 2: Detailed User Task Breakdown */}
      <section className="mb-8 space-y-4">
        <SectionTitleBar n={2} title="Detailed User Task Breakdown" />
        {data.userTasks.length === 0 ? (
          <div className="border border-t-0 ax-doc-rule ax-doc-paper px-3 py-3">
            <p className="text-sm ax-doc-quiet">No user tasks to display.</p>
          </div>
        ) : (
          data.userTasks.map((user, userIdx) => (
            <div key={`detail-${user.userName}-${userIdx}`} className="break-inside-avoid">
              <div className="border ax-doc-rule ax-doc-group px-3 py-2 font-bold">
                {user.userName} ({user.userDepartment})
              </div>

              {/* KPI Details */}
              {user.kpiDetails.length > 0 && (
                <div className="mt-2">
                  <p className="mb-2 px-2 text-sm font-bold">KPI Assignments:</p>
                  <TableScroll label="KPI pendency by officer" className="overflow-x-auto border ax-doc-rule">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="ax-doc-header text-left text-xs">
                          <th className="border ax-doc-header-rule px-2 py-2 font-semibold">KPI Description</th>
                          <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Scheme</th>
                          <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-center">Status</th>
                          <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {user.kpiDetails.map((kpi, kpiIdx) => (
                          <tr
                            key={`kpi-${userIdx}-${kpiIdx}`}
                            className={clsx(
 "border-b ax-doc-rule",
                              kpi.hasData ? "ax-doc-row-done" : "ax-doc-row-attention"
                            )}
                          >
                            <td className="border ax-doc-rule px-2 py-2">{kpi.description}</td>
                            <td className="border ax-doc-rule px-2 py-2">{kpi.schemeName}</td>
                            <td className="border ax-doc-rule px-2 py-2 text-center">
                              <span
                                className={clsx(
 "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                                  kpi.hasData ? "ax-doc-done " : "ax-doc-attention "
                                )}
                              >
                                {kpi.hasData ? "Submitted" : "Pending"}
                              </span>
                            </td>
                            <td className="border ax-doc-rule px-2 py-2">{kpi.lastUpdated ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </div>
              )}

              {/* Action Item Details */}
              {user.actionItemDetails.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 px-2 text-sm font-bold">Action Items:</p>
                  <TableScroll label="Action item pendency by officer" className="overflow-x-auto border ax-doc-rule">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="ax-doc-header text-left text-xs">
                          <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Action Item Title</th>
                          <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Status</th>
                          <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {user.actionItemDetails.map((action, actionIdx) => (
                          <tr
                            key={`action-${userIdx}-${actionIdx}`}
                            className={clsx(
 "border-b ax-doc-rule",
                              action.status === "COMPLETED" ? "ax-doc-row-done" : "ax-doc-row-attention"
                            )}
                          >
                            <td className="border ax-doc-rule px-2 py-2">{action.title}</td>
                            <td className="border ax-doc-rule px-2 py-2">
                              <span
                                className={clsx(
 "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                                  action.status === "COMPLETED"
                                    ? "ax-doc-done "
                                    : "ax-doc-pending "
                                )}
                              >
                                {action.status.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="border ax-doc-rule px-2 py-2 tabular-nums">{action.dueDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {/* Section 3: Financial Data Updates */}
      <section className="mb-8 space-y-4">
        <SectionTitleBar n={3} title={`Financial Data Entry Status (Week: ${weekStart} to ${weekEnd})`} />
        {data.financialDataUpdates.length === 0 ? (
          <div className="border border-t-0 ax-doc-rule ax-doc-paper px-3 py-3">
            <p className="text-sm ax-doc-quiet">No financial data updates to display.</p>
          </div>
        ) : (
          data.financialDataUpdates.map((scheme, schemeIdx) => (
            <div key={`finance-${schemeIdx}`} className="break-inside-avoid">
              <div className="border ax-doc-rule ax-doc-group px-3 py-2 font-bold">
                {scheme.schemeName} ({scheme.schemeType})
              </div>
              <TableScroll label="Financial data updates" className="overflow-x-auto border border-t-0 ax-doc-rule">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="ax-doc-header text-left text-xs">
                      <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Component / Subscheme</th>
                      <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-center">
                        Data Updated This Week
                      </th>
                      <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Last Updated</th>
                      <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Updated By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheme.subschemes.map((sub, subIdx) => (
                      <tr
                        key={`sub-${schemeIdx}-${subIdx}`}
                        className={clsx(
 "border-b ax-doc-rule",
                          sub.hasDataThisWeek ? "ax-doc-row-done" : "ax-doc-row-attention"
                        )}
                      >
                        <td className="border ax-doc-rule px-2 py-2">{sub.subschemeName ?? "Main Scheme"}</td>
                        <td className="border ax-doc-rule px-2 py-2 text-center">
                          <span
                            className={clsx(
 "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                              sub.hasDataThisWeek ? "ax-doc-done " : "ax-doc-attention "
                            )}
                          >
                            {sub.hasDataThisWeek ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="border ax-doc-rule px-2 py-2">{sub.lastUpdated ?? "—"}</td>
                        <td className="border ax-doc-rule px-2 py-2">{sub.updatedBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
