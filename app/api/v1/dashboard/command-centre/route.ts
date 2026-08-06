import { NextRequest, NextResponse } from "next/server";
import { getCommandCentreDashboard } from "@/lib/command-centre-dashboard";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { resolveDataScope } from "@/lib/data-scope";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAnyPermissionAndDbUser("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
    const scope = await resolveDataScope(user);
    const meetingId = request.nextUrl.searchParams.get("meetingId") ?? request.nextUrl.searchParams.get("meeting");
    const data = await getCommandCentreDashboard(user, scope, { meetingId: meetingId || undefined });
    return NextResponse.json(data);
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
