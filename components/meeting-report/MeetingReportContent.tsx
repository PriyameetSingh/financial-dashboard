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
import { tenantConfig } from "@/lib/tenant-config";
import { formatNumber } from "@/lib/tenant-config/format";
import { TableScroll } from "@/components/nocturne";

function fmtCr(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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
  // Currency unit and SO/IFMS vocabulary come from tenant config; under the
  // Odisha defaults this renders exactly as before ("(In Cr.)", "S.O.", "IFMS").
  const { currencyUnit: unit, labels } = tenantConfig();
  return (
    <section className="space-y-2 break-inside-avoid">
      {!hideTitle ? (
        <h2 className="border ax-doc-rule ax-doc-band px-3 py-2 text-sm font-semibold">
          {title}
        </h2>
      ) : null}
      <TableScroll
        label={title}
        className={clsx("overflow-x-auto border ax-doc-rule", hideTitle && "border-t-0", tableWrapClassName)}
      >
        <table className="w-full min-w-[720px] border-collapse border ax-doc-rule text-sm">
          <thead>
            <tr className="ax-doc-header text-left text-xs">
              <th className="border ax-doc-header-rule px-2 py-2 font-semibold">Plan Type</th>
              <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-right">
                Budget Estimate
                <br />
                {fyLabel ?? "FY"} (In {unit}.)
              </th>
              <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-right">
                Expenditure as on {asOf}
                <br />
                as per {labels.soExpenditureFormal} order (In {unit}.)
              </th>
              <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-right">
                Expenditure as on {asOf}
                <br />
                as per {labels.ifmsExpenditureFormal} (In {unit}.)
              </th>
              <th className="border ax-doc-header-rule px-2 py-2 font-semibold text-right">% as per {labels.ifmsExpenditureFormal}</th>
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
                <tr key={`${row.planType}-${i}`} className={i % 2 === 0 ? "ax-doc-paper" : "ax-doc-zebra "}>
                  <td
                    className={`border ax-doc-rule px-2 py-1.5  ${bold ? "font-semibold" : ""} ${
                      muteHeading ? "ax-doc-subtotal font-semibold " : ""
                    }`}
                  >
                    {row.planType}
                  </td>
                  <td
                    className={`border ax-doc-rule px-2 py-1.5 text-right tabular-nums ${
                      muteHeading ? "ax-doc-subtotal " : ""
                    }`}
                  >
                    {muteHeading ? "" : fmtCr(row.budgetEstimateCr)}
                  </td>
                  <td
                    className={`border ax-doc-rule px-2 py-1.5 text-right tabular-nums ${
                      muteHeading ? "ax-doc-subtotal " : ""
                    }`}
                  >
                    {muteHeading ? "" : fmtCr(row.soExpenditureCr)}
                  </td>
                  <td
                    className={`border ax-doc-rule px-2 py-1.5 text-right tabular-nums ${muteHeading ? "ax-doc-subtotal " : ""} ${
                      !muteHeading && row.ifmsExpenditureCr > 0 ? "ax-doc-quiet" : ""
                    }`}
                  >
                    {muteHeading ? "" : fmtCr(row.ifmsExpenditureCr)}
                  </td>
                  <td
                    className={`border ax-doc-rule px-2 py-1.5 text-right tabular-nums ${
                      muteHeading ? "ax-doc-subtotal " : ""
                    } ${lowPct ? "ax-doc-attention font-semibold " : ""}`}
                  >
                    {muteHeading ? "" : fmtPct("pctIfms" in row ? row.pctIfms : null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

function SectionTitleBar({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex border ax-doc-rule ax-doc-band font-bold">
      <div className="flex w-11 shrink-0 items-center justify-center border-r ax-doc-rule px-2 py-2 text-center">{n}</div>
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
      className="meeting-report-root ax-doc-paper"
      style={{ fontFamily: "Arial, Helvetica, system-ui, sans-serif" }}
    >
      <header className="mb-6 border-b ax-doc-rule pb-4">
        <div className="flex flex-col items-center gap-3">
          <div className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- runtime URL from public + basePath */}
            <img src={logoSrc} alt="" width={80} height={80} className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
          </div>
          <div className="min-w-0 text-center text-sm font-bold leading-snug sm:text-base">
            <p>{tenantConfig().pdfHeaderLine}</p>
            <p>Housing &amp; Urban Development Department</p>
            <p>{fyLine}</p>
            <p>{meetingLine}</p>
            <p className="font-semibold">{scheduleLine}</p>
          </div>
        </div>
      </header>

      {/* 1 */}
      <section className="mb-8 break-inside-avoid space-y-0">
        <SectionTitleBar n={1} title="Important Topics for Discussion" />
        <div className="border border-t-0 ax-doc-rule ax-doc-paper px-3 py-3">
          {data.topics.length === 0 && presentationRows.length === 0 ? (
            <p className="text-sm ax-doc-quiet">No topics or presentations recorded.</p>
          ) : (
            <ol className="ml-6 list-decimal space-y-1 text-sm">
              {data.topics.map((t) => (
                <li key={t.id} className="">
                  {t.topic}
                </li>
              ))}
              {presentationRows.length > 0 && (
                <li className="font-semibold">
                  Proposed Presentations
                  <ul className="ml-6 list-disc font-normal space-y-1 mt-1">
                    {presentationRows.map((row) => (
                      <li key={`${row.letter}-${row.label}`}>
                        {row.label}
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ol>
          )}
        </div>
      </section>

      {/* 2 */}
      <div className="mb-8 space-y-0">
        <SectionTitleBar n={2} title={`Financial Progress ${fy} (In ${tenantConfig().currencyUnit}.)`} />
        <FinanceTable
          hideTitle
          title={`Financial Progress ${fy}`}
          rows={data.financeProgress}
          asOfLabel={data.financeAsOfLabel}
          fyLabel={fy}
        />
      </div>

      {/* 3 */}
      <div className="mb-8 space-y-6">
        <SectionTitleBar n={3} title={`Schemes wise Financial Progress ${fy} (In ${tenantConfig().currencyUnit}.)`} />
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

      {/* 4 */}
      <section className="mb-8 break-inside-avoid space-y-0">
        <SectionTitleBar n={4} title="Key Decisions from Last Dashboard Meetings" />
        <TableScroll label="Key decisions from last dashboard meetings" className="overflow-x-auto border border-t-0 ax-doc-rule">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b ax-doc-rule ax-doc-zebra text-left text-xs uppercase tracking-wide ax-doc-quiet">
                <th className="border-b ax-doc-rule px-3 py-2 font-semibold">Decision</th>
                <th className="border-b ax-doc-rule px-3 py-2 font-semibold">Action by</th>
                <th className="border-b ax-doc-rule px-3 py-2 font-semibold">Timeline</th>
                <th className="border-b ax-doc-rule px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.keyDecisions.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 ax-doc-quiet" colSpan={4}>
                    No meeting decisions recorded up to this meeting.
                  </td>
                </tr>
              ) : (
                data.keyDecisions.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b ax-doc-rule align-top ${d.statusCarriedForward ? "ax-doc-carried " : ""}`}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{d.title}</p>
                      <p className="mt-1 text-xs ax-doc-quiet">{d.description}</p>
                      {d.sourceMeetingDate && (
                        <p className="mt-1 text-[10px] uppercase tracking-wide ax-doc-quiet">
                          Source meeting {d.sourceMeetingDate}
                        </p>
                      )}
                      {d.latestNote ? (
                        <p className="mt-2 border-l-2 ax-doc-rule pl-2 text-xs italic ax-doc-quiet">
                          Latest note: {d.latestNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 ax-doc-quiet">{d.actionBy}</td>
                    <td className="px-3 py-2 tabular-nums ax-doc-quiet">{d.timeline}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{d.statusLabel}</span>
                      {d.statusCarriedForward && (
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide">
                          Prior meeting update — not refreshed for this pack
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {/* 5 */}
      <section className="mb-8 break-inside-avoid space-y-0">
        <SectionTitleBar
          n={5}
          title="Scheme / Outcome based Key Performance Indicators (KPIs) — Weekly Update"
        />
        <TableScroll label="Key performance indicators" className="overflow-x-auto border border-t-0 ax-doc-rule">
          <table
            className="w-full min-w-[900px] border-collapse border ax-doc-rule text-xs sm:text-sm"
            aria-label="Key performance indicators by scheme and vertical"
          >
            <thead>
              <tr className="ax-doc-band text-left">
                <th scope="col" className="border ax-doc-rule px-2 py-2 text-xs font-bold sm:text-sm">
                  #
                </th>
                <th scope="col" className="border ax-doc-rule px-2 py-2 text-xs font-bold sm:text-sm">
                  KPI
                </th>
                <th scope="col" className="border ax-doc-rule px-2 py-2 text-xs font-bold sm:text-sm">
                  Action by / Status
                </th>
                <th scope="col" className="border ax-doc-rule px-2 py-2 text-xs font-bold sm:text-sm">
                  Numerator
                </th>
                <th scope="col" className="border ax-doc-rule px-2 py-2 text-xs font-bold sm:text-sm">
                  Unit
                </th>
                <th scope="col" className="border ax-doc-rule px-2 py-2 text-xs font-bold sm:text-sm">
                  Denominator
                </th>
                <th scope="col" className="border ax-doc-rule px-2 py-2 text-xs font-bold sm:text-sm">
                  Unit
                </th>
                <th scope="col" className="border ax-doc-rule px-2 py-2 text-xs font-bold sm:text-sm">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {data.kpiRows.length === 0 ? (
                <tr>
                  <td className="border ax-doc-rule px-3 py-4" colSpan={8}>
                    No KPI definitions for this financial year.
                  </td>
                </tr>
              ) : (
                groupMeetingReportKpis(data.kpiRows).map((schemeGroup, schemeIdx) => (
                  <Fragment key={`${schemeGroup.schemeLabel}-${schemeGroup.vertical}-${schemeIdx}`}>
                    <tr>
                      <td
                        className="border ax-doc-rule ax-doc-group px-3 py-2 text-sm font-bold"
                        colSpan={8}
                      >
                        {schemeKpiHeading(schemeGroup.schemeLabel, schemeGroup.vertical)}
                      </td>
                    </tr>
                    {schemeGroup.rows.map((k, rowInSchemeIdx) => (
                      <tr
                        key={`${schemeGroup.schemeLabel}-${schemeGroup.vertical}-${k.index}`}
                        className={`align-top ${k.warnLowPct ? "ax-doc-row-attention" : ""}`}
                      >
                        <th
                          scope="row"
                          className="border ax-doc-rule px-2 py-2 text-left text-sm font-normal tabular-nums"
                        >
                          {rowInSchemeIdx + 1}
                        </th>
                        <td className="border ax-doc-rule px-2 py-2">
                          <span className="font-medium">{k.description}</span>
                        </td>
                        <td className="border ax-doc-rule px-2 py-2">
                          <span className="font-medium">{k.actionBy}</span>
                          <p className="mt-1 capitalize">{k.statusLabel}</p>
                        </td>
                        <td className="border ax-doc-rule px-2 py-2 tabular-nums">{k.numerator}</td>
                        <td className="border ax-doc-rule px-2 py-2">{k.numeratorUnit || "—"}</td>
                        <td className="border ax-doc-rule px-2 py-2 tabular-nums">{k.denominator}</td>
                        <td className="border ax-doc-rule px-2 py-2">{k.denominatorUnit || "—"}</td>
                        <td className="max-w-[220px] border ax-doc-rule px-2 py-2">{k.remarks || "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {data.meeting.notes ? (
        <section className="text-sm ax-doc-quiet print:break-inside-avoid">
          <p className="font-semibold">Meeting notes</p>
          <p className="mt-2 whitespace-pre-wrap">{data.meeting.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
