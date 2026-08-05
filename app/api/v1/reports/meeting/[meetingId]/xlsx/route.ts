import { NextRequest, NextResponse } from "next/server";
import { buildMeetingReport } from "@/lib/meeting-report";
import {
  renderMeetingReportXlsxBuffer,
  MEETING_REPORT_XLSX_MIME,
} from "@/lib/meeting-report-xlsx-server";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { resolveDataScope } from "@/lib/data-scope";
import { filterMeetingReportPayload } from "@/lib/meeting-report-filter";

export const runtime = "nodejs";

/**
 * GET /api/v1/reports/meeting/:meetingId/xlsx
 *
 * Generates a meeting report Excel workbook server-side and returns it as
 * application/vnd.openxmlformats-officedocument.spreadsheetml.sheet. Each
 * report segment is written to its own worksheet.
 *
 * Query params:
 *   download=1   — adds Content-Disposition: attachment (triggers browser save dialog)
 *                  omit for inline display / programmatic consumption
 *   monitoringLevel, priority, status — same filters as the PDF route
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ meetingId: string }> },
) {
  try {
    const user = await requireAnyPermissionAndDbUser("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
    const scope = await resolveDataScope(user);

    const { meetingId } = await ctx.params;
    const trimmed = meetingId?.trim();
    if (!trimmed) {
      return NextResponse.json({ detail: "Meeting id required" }, { status: 400 });
    }

    const payload = await buildMeetingReport(trimmed, scope);
    if (!payload) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const monitoringLevel = searchParams.get("monitoringLevel") || undefined;
    const priority = searchParams.get("priority") || undefined;
    const status = searchParams.get("status") || undefined;

    const filteredPayload = filterMeetingReportPayload(payload, {
      monitoringLevel,
      priority,
      status,
    });

    const xlsxBuffer = renderMeetingReportXlsxBuffer(filteredPayload);

    const filename = `HUDD-meeting-report-${payload.meeting.meetingDate}.xlsx`;
    const isDownload = request.nextUrl.searchParams.get("download") === "1";

    return new Response(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type": MEETING_REPORT_XLSX_MIME,
        "Content-Length": String(xlsxBuffer.byteLength),
        "Content-Disposition": isDownload
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
