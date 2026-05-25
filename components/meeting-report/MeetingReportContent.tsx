"use client";

import { Fragment } from "react";
import clsx from "clsx";
import type {
  MeetingReportFinanceRow,
  MeetingReportPayload,
  MeetingReportSchemeRow,
} from "@/lib/meeting-report";
import {
  financialYearHeaderLine,
  formatMeetingScheduleLine,
  meetingReportTitleLine,
} from "@/lib/meeting-report-display";

function fmtCr(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "—";
  return `${p.toFixed(2)}%`;
}

function FinanceTable({
  rows,
  asOfLabel,
  fyLabel,
  title,
  hideTitle = false,
  tableWrapClassName = "",
}: {
  rows: MeetingReportFinanceRow[] | MeetingReportSchemeRow[];
  asOfLabel: string | null;
  fyLabel: string | null;
  title: string;
  hideTitle?: boolean;
  tableWrapClassName?: string;
}) {
  const asOf = asOfLabel ?? "—";
  return (
    <section className="space-y-2 break-inside-avoid">
      {!hideTitle ? (
        <h2 className="border border-black bg-[#FFD966] px-3 py-2 text-sm font-semibold text-black print:bg-[#FFD966]">
          {title}
        </h2>
      ) : null}
      <div
        className={clsx(
          "overflow-x-auto border border-black",
          hideTitle && "border-t-0",
          tableWrapClassName,
        )}
      >
        <table className="w-full min-w-[720px] border-collapse border border-black text-sm">
          <thead>
            <tr className="bg-rose-700 text-left text-xs text-white">
              <th className="border border-rose-800 px-2 py-2 font-semibold">Plan Type</th>
              <th className="border border-rose-800 px-2 py-2 font-semibold text-right">
                Budget Estimate
                <br />
                {fyLabel ?? "FY"} (In Cr.)
              </th>
              <th className="border border-rose-800 px-2 py-2 font-semibold text-right">
                Expenditure as on {asOf}
                <br />
                as per S.O. order (In Cr.)
              </th>
              <th className="border border-rose-800 px-2 py-2 font-semibold text-right">
                Expenditure as on {asOf}
                <br />
                as per IFMS (In Cr.)
              </th>
              <th className="border border-rose-800 px-2 py-2 font-semibold text-right">% as per IFMS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSchemeRow = "rowVariant" in row;
              const bold =
                isSchemeRow &&
                (row.rowVariant === "heading" ||
                  row.rowVariant === "type_total" ||
                  row.rowVariant === "section_total" ||
                  row.rowVariant === "grand_total");
              const muteHeading = "rowVariant" in row && row.rowVariant === "heading";
              const lowPct =
                "pctIfms" in row &&
                row.pctIfms !== null &&
                row.pctIfms < 15 &&
                row.rowVariant !== "heading";

              return (
                <tr key={`${row.planType}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-orange-50/40 print:bg-orange-50/60"}>
                  <td
                    className={`border border-black px-2 py-1.5 text-black ${bold ? "font-semibold" : ""} ${
                      muteHeading ? "bg-sky-100/80 font-semibold print:bg-sky-100" : ""
                    }`}
                  >
                    {row.planType}
                  </td>
                  <td
                    className={`border border-black px-2 py-1.5 text-right tabular-nums ${
                      muteHeading ? "bg-sky-100/80 print:bg-sky-100" : ""
                    }`}
                  >
                    {muteHeading ? "" : fmtCr(row.budgetEstimateCr)}
                  </td>
                  <td
                    className={`border border-black px-2 py-1.5 text-right tabular-nums ${
                      muteHeading ? "bg-sky-100/80 print:bg-sky-100" : ""
                    }`}
                  >
                    {muteHeading ? "" : fmtCr(row.soExpenditureCr)}
                  </td>
                  <td
                    className={`border border-black px-2 py-1.5 text-right tabular-nums ${muteHeading ? "bg-sky-100/80 print:bg-sky-100" : ""} ${
                      !muteHeading && row.ifmsExpenditureCr > 0 ? "text-rose-700" : ""
                    }`}
                  >
                    {muteHeading ? "" : fmtCr(row.ifmsExpenditureCr)}
                  </td>
                  <td
                    className={`border border-black px-2 py-1.5 text-right tabular-nums ${
                      muteHeading ? "bg-sky-100/80 print:bg-sky-100" : ""
                    } ${lowPct ? "bg-rose-200 font-semibold text-rose-900 print:bg-rose-200" : ""}`}
                  >
                    {muteHeading ? "" : fmtPct("pctIfms" in row ? row.pctIfms : null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SectionTitleBar({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex border border-black bg-[#FFD966] font-bold text-black">
      <div className="flex w-11 shrink-0 items-center justify-center border-r border-black px-2 py-2 text-center">{n}</div>
      <div className="flex-1 px-3 py-2">{title}</div>
    </div>
  );
}

/** Group KPI rows for section headers — payload order matches buildMeetingReport (vertical, scheme). */
function groupMeetingReportKpis(
  rows: MeetingReportPayload["kpiRows"],
): Array<{ schemeLabel: string; vertical: string; rows: MeetingReportPayload["kpiRows"] }> {
  const groups: Array<{ schemeLabel: string; vertical: string; rows: MeetingReportPayload["kpiRows"] }> =
    [];
  for (const row of rows) {
    const prev = groups[groups.length - 1];
    if (prev && prev.schemeLabel === row.schemeLabel && prev.vertical === row.vertical) {
      prev.rows.push(row);
    } else {
      groups.push({ schemeLabel: row.schemeLabel, vertical: row.vertical, rows: [row] });
    }
  }
  return groups;
}

function schemeKpiHeading(schemeLabel: string, vertical: string): string {
  const v = vertical.trim();
  return v.length > 0 ? `${schemeLabel} (${v})` : schemeLabel;
}

export type MeetingReportContentProps = {
  data: MeetingReportPayload;
  /** Base path–aware URL for the department logo used in the PDF/snapshots. */
  logoSrc: string;
};

export function MeetingReportContent({ data, logoSrc }: MeetingReportContentProps) {
  const fy = data.meeting.financialYearLabel ?? "2026-27";
  const meetingLine = meetingReportTitleLine(data.meetingOrdinalInFy, data.meeting.title);
  const fyLine = financialYearHeaderLine(data.meeting.financialYearLabel);
  const scheduleLine = formatMeetingScheduleLine(data.meeting.meetingDate);

  const presentationRows: Array<{ letter: string; label: string }> = [];
  let presentationIndex = 0;
  for (const g of data.presentationsByVertical) {
    for (const f of g.files) {
      const idx = presentationIndex++;
      const letter = idx < 26 ? String.fromCharCode(97 + idx) : String(idx + 1);
      presentationRows.push({
        letter,
        label: f.fileName,
      });
    }
  }

  return (
    <div
      className="meeting-report-root bg-white text-black"
      style={{ fontFamily: "Arial, Helvetica, system-ui, sans-serif" }}
    >
      <header className="mb-6 border-b border-black pb-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-center text-sm font-bold leading-snug sm:text-base">
            <p>Government of Odisha</p>
            <p>Housing &amp; Urban Development Department</p>
            <p>{fyLine}</p>
            <p>{meetingLine}</p>
            <p className="font-semibold">{scheduleLine}</p>
          </div>
          <div className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- runtime URL from public + basePath */}
            <img src={logoSrc} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
          </div>
        </div>
      </header>

      {/* 1 — formatted like formal agenda table */}
      <section className="mb-8 break-inside-avoid">
        <SectionTitleBar n={1} title="Proposed Presentations by Verticals" />
        <div className="border border-t-0 border-black bg-white">
          {presentationRows.length === 0 ? (
            <p className="px-3 py-3 text-sm text-neutral-600">No presentation files uploaded for this meeting.</p>
          ) : (
            presentationRows.map((row) => (
              <div key={`${row.letter}-${row.label}`} className="flex border-b border-black last:border-b-0">
                <div className="flex w-11 shrink-0 items-start justify-center border-r border-black px-2 py-2 text-sm">{row.letter}</div>
                <div className="flex-1 px-3 py-2 text-sm font-semibold text-rose-900">
                  Presentation on {row.label}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 2 */}
      <section className="mb-8 break-inside-avoid space-y-0">
        <SectionTitleBar n={2} title="Important Topics for Discussion" />
        <div className="border border-t-0 border-black bg-white px-3 py-3">
          {data.topics.length === 0 ? (
            <p className="text-sm text-neutral-600">No topics recorded.</p>
          ) : (
            <ol className="ml-6 list-decimal space-y-1 text-sm">
              {data.topics.map((t) => (
                <li key={t.id} className="text-black">
                  {t.topic}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* 3 */}
      <div className="mb-8 space-y-0">
        <SectionTitleBar n={3} title={`Financial Progress ${fy} (In Cr.)`} />
        <FinanceTable
          hideTitle
          title={`Financial Progress ${fy}`}
          rows={data.financeProgress}
          asOfLabel={data.financeAsOfLabel}
          fyLabel={fy}
        />
      </div>

      {/* 4 */}
      <div className="mb-8 space-y-6">
        <SectionTitleBar n={4} title={`Schemes wise Financial Progress ${fy} (In Cr.)`} />
        {data.schemesFinancialProgress.map((block, i) => (
          <FinanceTable
            key={block.sponsorshipKey}
            title={block.sponsorshipHeading}
            rows={block.rows}
            asOfLabel={data.financeAsOfLabel}
            fyLabel={fy}
            tableWrapClassName={i === 0 ? "border-t-0" : undefined}
          />
        ))}
      </div>

      {/* 5 */}
      <section className="mb-8 break-inside-avoid space-y-0">
        <SectionTitleBar n={5} title="Key Decisions from Last Dashboard Meetings" />
        <div className="overflow-x-auto border border-t-0 border-black">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-700">
                <th className="border-b border-black px-3 py-2 font-semibold">Decision</th>
                <th className="border-b border-black px-3 py-2 font-semibold">Action by</th>
                <th className="border-b border-black px-3 py-2 font-semibold">Timeline</th>
                <th className="border-b border-black px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.keyDecisions.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-neutral-600" colSpan={4}>
                    No meeting decisions recorded up to this meeting.
                  </td>
                </tr>
              ) : (
                data.keyDecisions.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b border-black align-top ${d.statusCarriedForward ? "bg-amber-50 print:bg-amber-50" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-black">{d.title}</p>
                      <p className="mt-1 text-xs text-neutral-600">{d.description}</p>
                      {d.sourceMeetingDate && (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">
                          Source meeting {d.sourceMeetingDate}
                        </p>
                      )}
                      {d.latestNote ? (
                        <p className="mt-2 border-l-2 border-neutral-300 pl-2 text-xs italic text-neutral-600">
                          Latest note: {d.latestNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{d.actionBy}</td>
                    <td className="px-3 py-2 tabular-nums text-neutral-700">{d.timeline}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-black">{d.statusLabel}</span>
                      {d.statusCarriedForward && (
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          Prior meeting update — not refreshed for this pack
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6 */}
      <section className="mb-8 break-inside-avoid space-y-0">
        <SectionTitleBar
          n={6}
          title="Scheme / Outcome based Key Performance Indicators (KPIs) — Weekly Update"
        />
        <div className="overflow-x-auto border border-t-0 border-black">
          <table
            className="w-full min-w-[900px] border-collapse border border-black text-xs sm:text-sm"
            aria-label="Key performance indicators by scheme and vertical"
          >
            <thead>
              <tr className="bg-[#FFD966] text-left text-black print:bg-[#FFD966]">
                <th scope="col" className="border border-black px-2 py-2 text-xs font-bold sm:text-sm">
                  #
                </th>
                <th scope="col" className="border border-black px-2 py-2 text-xs font-bold sm:text-sm">
                  KPI
                </th>
                <th scope="col" className="border border-black px-2 py-2 text-xs font-bold sm:text-sm">
                  Action by / Status
                </th>
                <th scope="col" className="border border-black px-2 py-2 text-xs font-bold sm:text-sm">
                  Numerator
                </th>
                <th scope="col" className="border border-black px-2 py-2 text-xs font-bold sm:text-sm">
                  Unit
                </th>
                <th scope="col" className="border border-black px-2 py-2 text-xs font-bold sm:text-sm">
                  Denominator
                </th>
                <th scope="col" className="border border-black px-2 py-2 text-xs font-bold sm:text-sm">
                  Unit
                </th>
                <th scope="col" className="border border-black px-2 py-2 text-xs font-bold sm:text-sm">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {data.kpiRows.length === 0 ? (
                <tr>
                  <td className="border border-black px-3 py-4 text-neutral-900" colSpan={8}>
                    No KPI definitions for this financial year.
                  </td>
                </tr>
              ) : (
                groupMeetingReportKpis(data.kpiRows).map((schemeGroup, schemeIdx) => (
                  <Fragment key={`${schemeGroup.schemeLabel}-${schemeGroup.vertical}-${schemeIdx}`}>
                    <tr>
                      <td
                        className="border border-black bg-[#F8D4C4] px-3 py-2 text-sm font-bold text-black print:bg-[#F8D4C4]"
                        colSpan={8}
                      >
                        {schemeKpiHeading(schemeGroup.schemeLabel, schemeGroup.vertical)}
                      </td>
                    </tr>
                    {schemeGroup.rows.map((k, rowInSchemeIdx) => (
                      <tr
                        key={`${schemeGroup.schemeLabel}-${schemeGroup.vertical}-${k.index}`}
                        className={`align-top ${k.warnLowPct ? "bg-rose-50 print:bg-rose-50" : ""}`}
                      >
                        <th
                          scope="row"
                          className="border border-black px-2 py-2 text-left text-sm font-normal tabular-nums text-black"
                        >
                          {rowInSchemeIdx + 1}
                        </th>
                        <td className="border border-black px-2 py-2 text-black">
                          <span className="font-medium">{k.description}</span>
                        </td>
                        <td className="border border-black px-2 py-2 text-neutral-800">
                          <span className="font-medium text-black">{k.actionBy}</span>
                          <p className="mt-1 capitalize text-neutral-900">{k.statusLabel}</p>
                        </td>
                        <td className="border border-black px-2 py-2 tabular-nums text-black">{k.numerator}</td>
                        <td className="border border-black px-2 py-2 text-neutral-800">{k.numeratorUnit || "—"}</td>
                        <td className="border border-black px-2 py-2 tabular-nums text-neutral-900">{k.denominator}</td>
                        <td className="border border-black px-2 py-2 text-neutral-800">{k.denominatorUnit || "—"}</td>
                        <td className="max-w-[220px] border border-black px-2 py-2 text-neutral-800">{k.remarks || "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.meeting.notes ? (
        <section className="text-sm text-neutral-700 print:break-inside-avoid">
          <p className="font-semibold text-black">Meeting notes</p>
          <p className="mt-2 whitespace-pre-wrap">{data.meeting.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
