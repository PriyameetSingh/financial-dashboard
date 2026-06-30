import { NextRequest, NextResponse } from "next/server";
import { buildMeetingReport } from "@/lib/meeting-report";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";
import { filterMeetingReportPayload } from "@/lib/meeting-report-filter";

export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const { meetingId } = await ctx.params;
    const trimmed = meetingId?.trim();
    if (!trimmed) {
      return NextResponse.json({ detail: "Meeting id required" }, { status: 400 });
    }

    const payload = await buildMeetingReport(trimmed);
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

    return NextResponse.json(filteredPayload);
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
