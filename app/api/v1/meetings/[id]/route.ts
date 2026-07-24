import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermission, requireAnyPermissionAndDbUser, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { deleteFile } from "@/lib/local-file-storage";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const { id } = await ctx.params;
    const meeting = await prisma.dashboardMeeting.findUnique({
      where: { id },
      include: {
        topics: { orderBy: { createdAt: "asc" } },
        actionItems: {
          where: { archived: false },
          select: { id: true, title: true, status: true, dueDate: true },
        },
        createdBy: { select: { name: true } },
        materials: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        meetingDate: meeting.meetingDate.toISOString().slice(0, 10),
        title: meeting.title,
        notes: meeting.notes,
        createdByName: meeting.createdBy?.name ?? null,
        topics: meeting.topics.map((t) => ({ id: t.id, topic: t.topic })),
        actionItems: meeting.actionItems,
        materials: meeting.materials,
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

type PatchBody = {
  meetingDate?: string;
  title?: string | null;
  notes?: string | null;
  topics?: string[];
};

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("CREATE_ACTION_ITEMS", "MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const body = (await request.json()) as PatchBody;
    const auditContext = getAuditRequestContext(request);

    const before = await prisma.dashboardMeeting.findUnique({
      where: { id },
      include: { topics: true },
    });
    if (!before) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    const meeting = await prisma.$transaction(async (tx) => {
      // Update meeting details
      const m = await tx.dashboardMeeting.update({
        where: { id },
        data: {
          meetingDate: body.meetingDate ? new Date(`${body.meetingDate}T00:00:00.000Z`) : undefined,
          title: body.title,
          notes: body.notes,
        },
      });

      // Update topics if provided
      if (body.topics !== undefined) {
        // Simple strategy: replace all topics
        await tx.meetingTopic.deleteMany({ where: { meetingId: id } });
        if (body.topics.length > 0) {
          await tx.meetingTopic.createMany({
            data: body.topics
              .filter((t) => t.trim().length > 0)
              .map((t) => ({
                meetingId: id,
                topic: t.trim(),
                createdById: actor?.id ?? null,
              })),
          });
        }
      }

      return m;
    });

    await logAudit(
      actor?.id,
      "meeting.update",
      "dashboard_meeting",
      id,
      { title: before.title, notes: before.notes, topics: before.topics.map((t) => t.topic) },
      { title: meeting.title, notes: meeting.notes, topics: body.topics ?? null },
      { ...auditContext, meetingId: id },
    );

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

    const before = await prisma.dashboardMeeting.findUnique({
      where: { id },
      include: {
        actionItems: {
          where: { archived: false },
          select: { id: true, title: true, status: true },
        },
        materials: { select: { id: true, storagePath: true } },
      },
    });
    if (!before) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    if (before.actionItems.length > 0) {
      return NextResponse.json(
        {
          detail:
            "This meeting still has active action items. Please delete or archive them first before deleting the meeting.",
          blockingActionItems: before.actionItems,
        },
        { status: 409 },
      );
    }

    // Clean up material files from local disk before the DB cascade removes the rows.
    // Failures are logged but do not block the meeting deletion.
    for (const material of before.materials) {
      try {
        await deleteFile(material.storagePath);
      } catch (err) {
        console.error(
          `[meeting.delete] Failed to remove material file ${material.storagePath} for meeting ${id}:`,
          err,
        );
      }
    }

    await prisma.dashboardMeeting.delete({ where: { id } });

    await logAudit(actor?.id, "meeting.delete", "dashboard_meeting", id, { id }, null, { ...auditContext, meetingId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
