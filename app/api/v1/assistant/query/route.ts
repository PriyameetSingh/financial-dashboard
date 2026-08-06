import { NextRequest, NextResponse } from "next/server";
import { answerAssistantQuery } from "@/lib/assistant-query";
import type { AssistantMeetingContext } from "@/lib/assistant-types";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { resolveDataScope } from "@/lib/data-scope";

export const runtime = "nodejs";

type Body = {
  query: string;
  meetingContext?: AssistantMeetingContext;
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireAnyPermissionAndDbUser("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
    const scope = await resolveDataScope(user);

    const body = (await request.json()) as Body;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ detail: "Missing query" }, { status: 400 });
    }

    let ctx: AssistantMeetingContext | null = null;
    if (body.meetingContext && typeof body.meetingContext.meetingId === "string") {
      ctx = {
        meetingId: body.meetingContext.meetingId,
        meetingDate: body.meetingContext.meetingDate ?? "",
        title: body.meetingContext.title ?? null,
        financialYearLabel: body.meetingContext.financialYearLabel ?? "",
      };
    }

    const answer = await answerAssistantQuery(query, ctx, scope);
    return NextResponse.json({ answer });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
