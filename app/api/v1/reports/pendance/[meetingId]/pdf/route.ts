import { NextRequest, NextResponse } from "next/server";
import { buildPendanceReport } from "@/lib/pendance-report";
import { renderPendanceReportPdfBuffer } from "@/lib/pendance-report-pdf-server";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

/**
 * GET /api/v1/reports/pendance/:meetingId/pdf
 *
 * Generates a pendance report PDF server-side and returns it as application/pdf.
 * The response can be streamed directly to a browser for download, or consumed
 * programmatically (e.g. by an agent to email/chat the file).
 *
 * Query params:
 *   download=1   — adds Content-Disposition: attachment (triggers browser save dialog)
 *                  omit for inline display / programmatic consumption
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ meetingId: string }> },
) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const { meetingId } = await ctx.params;
    const trimmed = meetingId?.trim();
    if (!trimmed) {
      return NextResponse.json({ detail: "Meeting id required" }, { status: 400 });
    }

    const payload = await buildPendanceReport(trimmed);
    if (!payload) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    const pdfBuffer = await renderPendanceReportPdfBuffer(payload);

    const filename = `HUDD-pendance-report-${payload.meeting.meetingDate}.pdf`;
    const isDownload = request.nextUrl.searchParams.get("download") === "1";

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBuffer.byteLength),
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
