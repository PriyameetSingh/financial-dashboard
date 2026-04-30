import { NextRequest, NextResponse } from "next/server";
import { ActionItemPriority, ActionItemStatus, ActionItemType, Prisma } from "@prisma/client";
import { parseListLimit } from "@/lib/list-query-limit";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermission, requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

type ActionItemWithRelations = Prisma.ActionItemGetPayload<{
  include: {
    scheme: { select: { code: true; verticalName: true } };
    vertical: { select: { name: true } };
    performers: { include: { user: { select: { id: true; name: true; code: true } } }; orderBy: { sortOrder: "asc" } };
    reviewerUsers: { include: { user: { select: { id: true; name: true; code: true } } }; orderBy: { sortOrder: "asc" } };
    updates: {
      orderBy: { timestamp: "asc" };
      include: { createdBy: { select: { name: true } } };
    };
    proofs: { include: { file: { select: { name: true; url: true } } } };
  };
}>;

function mapActionItem(item: ActionItemWithRelations) {
  const now = Date.now();
  const dueTime = item.dueDate.getTime();
  const overdueDays = dueTime < now ? Math.floor((now - dueTime) / (24 * 60 * 60 * 1000)) : undefined;

  const perfUsers = item.performers.map((p) => p.user);
  const revUsers = item.reviewerUsers.map((r) => r.user);

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    vertical: item.vertical?.name ?? item.scheme?.verticalName ?? "",
    priority: item.priority,
    dueDate: toIsoDate(item.dueDate),
    status: item.status,
    assignedTo: perfUsers.map((u) => u.name).join(", ") || "",
    reviewer: revUsers.map((u) => u.name).join(", ") || "",
    performers: perfUsers.map((u) => ({ id: u.id, name: u.name, code: u.code })),
    reviewers: revUsers.map((u) => ({ id: u.id, name: u.name, code: u.code })),
    assignedToUserIds: perfUsers.map((u) => u.id),
    reviewerUserIds: revUsers.map((u) => u.id),
    assignedToUserCode: perfUsers[0]?.code ?? null,
    reviewerUserCode: revUsers[0]?.code ?? null,
    schemeId: item.scheme?.code ?? "",
    daysOverdue: overdueDays,
    updates: item.updates.map((update) => ({
      id: update.id,
      timestamp: toIsoDate(update.timestamp),
      actor: update.createdBy?.name ?? "",
      status: update.status,
      note: update.note,
    })),
    proofFiles: item.proofs.map((proof) => ({
      name: proof.file.name,
      link: proof.file.url,
    })),
  };
}

const actionInclude = {
  scheme: { select: { code: true, verticalName: true } },
  vertical: { select: { name: true } },
  performers: {
    orderBy: { sortOrder: "asc" as const },
    include: { user: { select: { id: true, name: true, code: true } } },
  },
  reviewerUsers: {
    orderBy: { sortOrder: "asc" as const },
    include: { user: { select: { id: true, name: true, code: true } } },
  },
  updates: {
    orderBy: { timestamp: "asc" as const },
    include: {
      createdBy: { select: { name: true } },
    },
  },
  proofs: {
    include: {
      file: { select: { name: true, url: true } },
    },
  },
} satisfies Prisma.ActionItemInclude;

export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const take = parseListLimit(new URL(request.url).searchParams);

    const items = await prisma.actionItem.findMany({
      include: actionInclude,
      orderBy: [{ dueDate: "asc" }, { title: "asc" }],
      take,
    });

    return NextResponse.json({
      items: items.map(mapActionItem),
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

function normalizeCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  const out: string[] = [];
  for (const c of codes) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
}

type CreateBody = {
  meetingId?: string | null;
  schemeCode?: string | null;
  subschemeCode?: string | null;
  title: string;
  description: string;
  priority: ActionItemPriority;
  dueDate: string;
  /** Prefer these; at least one code each when used. */
  performerUserCodes?: string[];
  reviewerUserCodes?: string[];
  /** Legacy single-code fields (wrapped into one-element arrays). */
  assignedToUserCode?: string;
  reviewerUserCode?: string;
  itemType?: ActionItemType;
};

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("CREATE_ACTION_ITEMS");

    const body = (await request.json()) as CreateBody;
    const auditContext = getAuditRequestContext(request);

    let performerCodes = normalizeCodes(body.performerUserCodes);
    let reviewerCodes = normalizeCodes(body.reviewerUserCodes);
    if (performerCodes.length === 0 && body.assignedToUserCode?.trim()) {
      performerCodes = [body.assignedToUserCode.trim()];
    }
    if (reviewerCodes.length === 0 && body.reviewerUserCode?.trim()) {
      reviewerCodes = [body.reviewerUserCode.trim()];
    }

    if (performerCodes.length === 0 || reviewerCodes.length === 0) {
      return NextResponse.json(
        { detail: "performerUserCodes and reviewerUserCodes (non-empty arrays), or legacy assignedToUserCode and reviewerUserCode, are required" },
        { status: 400 },
      );
    }

    const overlap = performerCodes.filter((c) => reviewerCodes.includes(c));
    if (overlap.length > 0) {
      return NextResponse.json({ detail: "A user cannot be both a performer and a reviewer on the same item" }, { status: 400 });
    }

    let scheme = null;
    if (body.schemeCode) {
      scheme = await prisma.scheme.findUnique({
        where: { code: body.schemeCode },
        include: { subschemes: true },
      });
      if (!scheme) {
        return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
      }
    }

    let subschemeId: string | null = null;
    if (body.subschemeCode?.trim()) {
      if (!scheme) {
        return NextResponse.json({ detail: "Cannot specify a subscheme without a scheme" }, { status: 400 });
      }
      const code = body.subschemeCode.trim();
      const sub = scheme.subschemes.find((s) => s.code.toUpperCase() === code.toUpperCase());
      if (!sub) {
        return NextResponse.json({ detail: "Subscheme not found" }, { status: 404 });
      }
      subschemeId = sub.id;
    }

    let meeting = null;
    if (body.meetingId) {
      meeting = await prisma.dashboardMeeting.findUnique({ where: { id: body.meetingId } });
      if (!meeting) {
        return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
      }
    }

    const performers = await prisma.user.findMany({
      where: { code: { in: performerCodes } },
      select: { id: true, code: true },
    });
    const reviewers = await prisma.user.findMany({
      where: { code: { in: reviewerCodes } },
      select: { id: true, code: true },
    });
    if (performers.length !== performerCodes.length || reviewers.length !== reviewerCodes.length) {
      return NextResponse.json({ detail: "One or more performer or reviewer user codes were not found" }, { status: 400 });
    }

    const performerIds = performerCodes.map((code) => performers.find((u) => u.code === code)!.id);
    const reviewerIds = reviewerCodes.map((code) => reviewers.find((u) => u.code === code)!.id);

    const idSet = new Set([...performerIds, ...reviewerIds]);
    if (idSet.size !== performerIds.length + reviewerIds.length) {
      return NextResponse.json({ detail: "Performers and reviewers must be distinct users" }, { status: 400 });
    }

    const dueDate = new Date(`${body.dueDate}T00:00:00.000Z`);

    let verticalId: string | null = null;
    if (scheme) {
      const v = await prisma.vertical.findFirst({
        where: { name: scheme.verticalName },
        select: { id: true },
      });
      verticalId = v?.id ?? null;
    }

    const created = await prisma.actionItem.create({
      data: {
        meetingId: body.meetingId ?? null,
        schemeId: scheme?.id ?? null,
        subschemeId,
        verticalId,
        itemType: body.itemType ?? ActionItemType.action_item,
        title: body.title.trim(),
        description: body.description.trim(),
        priority: body.priority,
        dueDate,
        status: ActionItemStatus.OPEN,
        createdById: actor?.id ?? null,
        performers: {
          create: performerIds.map((userId, i) => ({ userId, sortOrder: i })),
        },
        reviewerUsers: {
          create: reviewerIds.map((userId, i) => ({ userId, sortOrder: i })),
        },
      },
    });

    await prisma.actionItemUpdate.create({
      data: {
        actionItemId: created.id,
        timestamp: new Date(),
        status: ActionItemStatus.OPEN,
        note: "Action item created",
        createdById: actor?.id ?? null,
      },
    });

    await logAudit(
      actor?.id,
      "action_item.create",
      "action_item",
      created.id,
      null,
      { id: created.id, title: created.title, schemeId: scheme?.id ?? null, meetingId: body.meetingId ?? null },
      { ...auditContext, meetingId: body.meetingId ?? null, schemeId: scheme?.id ?? null },
    );

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
