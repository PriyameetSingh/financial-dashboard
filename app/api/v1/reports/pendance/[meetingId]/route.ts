import { NextRequest, NextResponse } from "next/server";
import { buildPendanceReport } from "@/lib/pendance-report";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
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

    return NextResponse.json(payload);
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
