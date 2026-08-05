import { NextRequest, NextResponse } from "next/server";
import { parseListLimit } from "@/lib/list-query-limit";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermission, requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const take = parseListLimit(new URL(request.url).searchParams);

    const meetings = await prisma.dashboardMeeting.findMany({
      orderBy: { meetingDate: "desc" },
      include: {
        topics: { orderBy: { createdAt: "asc" } },
        actionItems: {
          where: { archived: false },
          select: { id: true, title: true, status: true },
        },
        createdBy: { select: { name: true } },
        materials: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
        },
      },
      take,
    });

    return NextResponse.json({
      meetings: meetings.map((m) => ({
        id: m.id,
        meetingDate: m.meetingDate.toISOString().slice(0, 10),
        title: m.title,
        notes: m.notes,
        createdByName: m.createdBy?.name ?? null,
        topics: m.topics.map((t) => ({ id: t.id, topic: t.topic })),
        actionItems: m.actionItems,
        materials: m.materials,
      })),
      limit: take,
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

type Body = {
  meetingDate: string;
  title?: string | null;
  notes?: string | null;
  topics?: Array<{ topic: string }>;
  actionItemIds?: string[];
  financialYearId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("CREATE_ACTION_ITEMS", "MANAGE_SCHEMES");

    const body = (await request.json()) as Body;
    const meetingDate = new Date(`${body.meetingDate}T00:00:00.000Z`);
    const auditContext = getAuditRequestContext(request);

    const meeting = await prisma.$transaction(async (tx) => {
      const meeting = await tx.dashboardMeeting.create({
        data: {
          meetingDate,
          title: body.title ?? null,
          notes: body.notes ?? null,
          financialYearId: body.financialYearId ?? null,
          createdById: actor?.id ?? null,
          topics: body.topics?.length
            ? {
                create: body.topics.map((t) => ({
                  topic: t.topic,
                  createdById: actor?.id ?? null,
                })),
              }
            : undefined,
        },
      });

      if (body.actionItemIds?.length) {
        await tx.actionItem.updateMany({
          where: { id: { in: body.actionItemIds } },
          data: { meetingId: meeting.id },
        });
      }

      await logAudit(
        tx,
        actor?.id,
        "meeting.create",
        "dashboard_meeting",
        meeting.id,
        null,
        { id: meeting.id, meetingDate: meeting.meetingDate.toISOString() },
        { ...auditContext, meetingId: meeting.id },
      );

      return meeting;
    });

    return NextResponse.json({ id: meeting.id }, { status: 201 });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
