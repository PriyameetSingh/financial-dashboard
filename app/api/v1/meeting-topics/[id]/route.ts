import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermissionAndDbUser, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type Body = {
  topic?: string;
};

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("CREATE_ACTION_ITEMS", "MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const body = (await request.json()) as Body;
    const auditContext = getAuditRequestContext(request);

    const before = await prisma.meetingTopic.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ detail: "Topic not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.meetingTopic.update({
        where: { id },
        data: { topic: body.topic?.trim() ?? before.topic },
      });

      await logAudit(
        tx,
        actor?.id,
        "meeting.topic.update",
        "meeting_topic",
        id,
        { topic: before.topic },
        { topic: updated.topic },
        { ...auditContext, meetingId: before.meetingId },
      );

      return updated;
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const auditContext = getAuditRequestContext(request);

    const before = await prisma.meetingTopic.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ detail: "Topic not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.meetingTopic.delete({ where: { id } });

      await logAudit(tx, actor?.id, "meeting.topic.delete", "meeting_topic", id, { topic: before.topic }, null, {
        ...auditContext,
        meetingId: before.meetingId,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
