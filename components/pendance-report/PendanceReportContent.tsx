"use client";

import { Fragment } from "react";
import clsx from "clsx";
import type { PendanceReportPayload } from "@/lib/pendance-report";
import { formatPendanceReportDate } from "@/lib/pendance-report";

function SectionTitleBar({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex border border-black bg-[#FFD966] font-bold text-black">
      <div className="flex w-11 shrink-0 items-center justify-center border-r border-black px-2 py-2 text-center">{n}</div>
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
      className="pendance-report-root bg-white text-black"
      style={{ fontFamily: "Arial, Helvetica, system-ui, sans-serif" }}
    >
      <header className="mb-6 border-b border-black pb-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-center text-sm font-bold leading-snug sm:text-base">
            <p>Government of Odisha</p>
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
        <div className="overflow-x-auto border border-t-0 border-black">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="bg-rose-700 text-left text-xs text-white">
                <th className="border border-rose-800 px-2 py-2 font-semibold">User Name</th>
                <th className="border border-rose-800 px-2 py-2 font-semibold">Department</th>
                <th className="border border-rose-800 px-2 py-2 font-semibold text-center">
                  KPIs<br />Assigned
                </th>
                <th className="border border-rose-800 px-2 py-2 font-semibold text-center">
                  KPIs<br />Submitted
                </th>
                <th className="border border-rose-800 px-2 py-2 font-semibold text-center">
                  KPIs<br />Pending
                </th>
                <th className="border border-rose-800 px-2 py-2 font-semibold text-center">
                  Action Items<br />Assigned
                </th>
                <th className="border border-rose-800 px-2 py-2 font-semibold text-center">
                  Action Items<br />Completed
                </th>
                <th className="border border-rose-800 px-2 py-2 font-semibold text-center">
                  Action Items<br />Pending
                </th>
              </tr>
            </thead>
            <tbody>
              {data.userTasks.length === 0 ? (
                <tr>
                  <td className="border border-black px-3 py-4 text-neutral-600" colSpan={8}>
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
                        "border-b border-black",
                        hasIssues ? "bg-rose-50 print:bg-rose-50" : i % 2 === 0 ? "bg-white" : "bg-orange-50/40 print:bg-orange-50/60"
                      )}
                    >
                      <td className="border border-black px-2 py-2 font-semibold text-black">{user.userName}</td>
                      <td className="border border-black px-2 py-2 text-neutral-800">{user.userDepartment}</td>
                      <td className="border border-black px-2 py-2 text-center tabular-nums">{user.assignedKpiCount}</td>
                      <td className="border border-black px-2 py-2 text-center tabular-nums">{user.submittedKpiCount}</td>
                      <td className="border border-black px-2 py-2 text-center tabular-nums font-semibold">
                        {user.pendingKpiCount > 0 ? user.pendingKpiCount : "—"}
                      </td>
                      <td className="border border-black px-2 py-2 text-center tabular-nums">{user.assignedActionItemCount}</td>
                      <td className="border border-black px-2 py-2 text-center tabular-nums">{user.completedActionItemCount}</td>
                      <td className="border border-black px-2 py-2 text-center tabular-nums font-semibold">
                        {user.pendingActionItemCount > 0 ? user.pendingActionItemCount : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Detailed User Task Breakdown */}
      <section className="mb-8 space-y-4">
        <SectionTitleBar n={2} title="Detailed User Task Breakdown" />
        {data.userTasks.length === 0 ? (
          <div className="border border-t-0 border-black bg-white px-3 py-3">
            <p className="text-sm text-neutral-600">No user tasks to display.</p>
          </div>
        ) : (
          data.userTasks.map((user, userIdx) => (
            <div key={`detail-${user.userName}-${userIdx}`} className="break-inside-avoid">
              <div className="border border-black bg-[#F8D4C4] px-3 py-2 font-bold text-black print:bg-[#F8D4C4]">
                {user.userName} ({user.userDepartment})
              </div>

              {/* KPI Details */}
              {user.kpiDetails.length > 0 && (
                <div className="mt-2">
                  <p className="mb-2 px-2 text-sm font-bold">KPI Assignments:</p>
                  <div className="overflow-x-auto border border-black">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-rose-700 text-left text-xs text-white">
                          <th className="border border-rose-800 px-2 py-2 font-semibold">KPI Description</th>
                          <th className="border border-rose-800 px-2 py-2 font-semibold">Scheme</th>
                          <th className="border border-rose-800 px-2 py-2 font-semibold text-center">Status</th>
                          <th className="border border-rose-800 px-2 py-2 font-semibold">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {user.kpiDetails.map((kpi, kpiIdx) => (
                          <tr
                            key={`kpi-${userIdx}-${kpiIdx}`}
                            className={clsx(
                              "border-b border-black",
                              kpi.hasData ? "bg-green-50 print:bg-green-50" : "bg-rose-50 print:bg-rose-50"
                            )}
                          >
                            <td className="border border-black px-2 py-2">{kpi.description}</td>
                            <td className="border border-black px-2 py-2">{kpi.schemeName}</td>
                            <td className="border border-black px-2 py-2 text-center">
                              <span
                                className={clsx(
                                  "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                                  kpi.hasData ? "bg-green-200 text-green-900" : "bg-rose-200 text-rose-900"
                                )}
                              >
                                {kpi.hasData ? "Submitted" : "Pending"}
                              </span>
                            </td>
                            <td className="border border-black px-2 py-2">{kpi.lastUpdated ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Item Details */}
              {user.actionItemDetails.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 px-2 text-sm font-bold">Action Items:</p>
                  <div className="overflow-x-auto border border-black">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-rose-700 text-left text-xs text-white">
                          <th className="border border-rose-800 px-2 py-2 font-semibold">Action Item Title</th>
                          <th className="border border-rose-800 px-2 py-2 font-semibold">Status</th>
                          <th className="border border-rose-800 px-2 py-2 font-semibold">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {user.actionItemDetails.map((action, actionIdx) => (
                          <tr
                            key={`action-${userIdx}-${actionIdx}`}
                            className={clsx(
                              "border-b border-black",
                              action.status === "COMPLETED" ? "bg-green-50 print:bg-green-50" : "bg-rose-50 print:bg-rose-50"
                            )}
                          >
                            <td className="border border-black px-2 py-2">{action.title}</td>
                            <td className="border border-black px-2 py-2">
                              <span
                                className={clsx(
                                  "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                                  action.status === "COMPLETED"
                                    ? "bg-green-200 text-green-900"
                                    : "bg-amber-200 text-amber-900"
                                )}
                              >
                                {action.status.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="border border-black px-2 py-2 tabular-nums">{action.dueDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
          <div className="border border-t-0 border-black bg-white px-3 py-3">
            <p className="text-sm text-neutral-600">No financial data updates to display.</p>
          </div>
        ) : (
          data.financialDataUpdates.map((scheme, schemeIdx) => (
            <div key={`finance-${schemeIdx}`} className="break-inside-avoid">
              <div className="border border-black bg-[#F8D4C4] px-3 py-2 font-bold text-black print:bg-[#F8D4C4]">
                {scheme.schemeName} ({scheme.schemeType})
              </div>
              <div className="overflow-x-auto border border-t-0 border-black">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-rose-700 text-left text-xs text-white">
                      <th className="border border-rose-800 px-2 py-2 font-semibold">Component / Subscheme</th>
                      <th className="border border-rose-800 px-2 py-2 font-semibold text-center">
                        Data Updated This Week
                      </th>
                      <th className="border border-rose-800 px-2 py-2 font-semibold">Last Updated</th>
                      <th className="border border-rose-800 px-2 py-2 font-semibold">Updated By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheme.subschemes.map((sub, subIdx) => (
                      <tr
                        key={`sub-${schemeIdx}-${subIdx}`}
                        className={clsx(
                          "border-b border-black",
                          sub.hasDataThisWeek ? "bg-green-50 print:bg-green-50" : "bg-rose-50 print:bg-rose-50"
                        )}
                      >
                        <td className="border border-black px-2 py-2">{sub.subschemeName ?? "Main Scheme"}</td>
                        <td className="border border-black px-2 py-2 text-center">
                          <span
                            className={clsx(
                              "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                              sub.hasDataThisWeek ? "bg-green-200 text-green-900" : "bg-rose-200 text-rose-900"
                            )}
                          >
                            {sub.hasDataThisWeek ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="border border-black px-2 py-2">{sub.lastUpdated ?? "—"}</td>
                        <td className="border border-black px-2 py-2">{sub.updatedBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
