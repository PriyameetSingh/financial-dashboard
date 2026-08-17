import { NextRequest, NextResponse } from "next/server";
import { prisma, tenantStamped } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type Body = {
  topic: string;
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("CREATE_ACTION_ITEMS", "MANAGE_SCHEMES");

    const { id: meetingId } = await ctx.params;
    const body = (await request.json()) as Body;
    const topic = body.topic?.trim();
    if (!topic) {
      return NextResponse.json({ detail: "topic is required" }, { status: 400 });
    }

    const meeting = await prisma.dashboardMeeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }
    const auditContext = getAuditRequestContext(request);

    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.meetingTopic.create({
        data: tenantStamped({
          meetingId,
          topic,
          createdById: actor?.id ?? null,
        }),
      });

      await logAudit(
        tx,
        actor?.id,
        "meeting.topic.create",
        "meeting_topic",
        created.id,
        null,
        { id: created.id, topic: created.topic },
        { ...auditContext, meetingId },
      );

      return created;
    });

    return NextResponse.json({ topic: { id: created.id, topic: created.topic } }, { status: 201 });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
