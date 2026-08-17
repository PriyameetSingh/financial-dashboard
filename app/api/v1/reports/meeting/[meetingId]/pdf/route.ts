import { NextRequest, NextResponse } from "next/server";
import { tenantConfig } from "@/lib/tenant-config";
import { withRequestTenantScope } from "@/lib/tenant-context";
import { buildMeetingReport } from "@/lib/meeting-report";
import { renderMeetingReportPdfBuffer } from "@/lib/meeting-report-pdf-server";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { resolveDataScope } from "@/lib/data-scope";
import { filterMeetingReportPayload } from "@/lib/meeting-report-filter";

export const runtime = "nodejs";

/**
 * GET /api/v1/reports/meeting/:meetingId/pdf
 *
 * Generates a meeting report PDF server-side and returns it as application/pdf.
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
    return await withRequestTenantScope(async () => {
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

    const pdfBuffer = await renderMeetingReportPdfBuffer(filteredPayload);

    // Tenant-visible on every download; discharges backlog D1-D3.
    const filename = `${tenantConfig().reportFilenamePrefix}-meeting-report-${payload.meeting.meetingDate}.pdf`;
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
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
