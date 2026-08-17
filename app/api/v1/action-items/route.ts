import { NextRequest, NextResponse } from "next/server";
import { ActionItemPriority, ActionItemStatus, ActionItemType, Prisma } from "@prisma/client";
import { parseListLimit } from "@/lib/list-query-limit";
import { prisma, tenantStamped } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { resolveDataScope } from "@/lib/data-scope";
import { actionItemWhere } from "@/lib/data-access/scope-where";
import { NotificationService } from "@/lib/services/NotificationService";

export const runtime = "nodejs";

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

type ActionItemWithRelations = Prisma.ActionItemGetPayload<{
  include: {
    scheme: { select: { code: true; verticalName: true } };
    vertical: { select: { name: true } };
    meeting: { select: { meetingDate: true; title: true } };
    performers: { include: { user: { select: { id: true; name: true; code: true } } }; orderBy: { sortOrder: "asc" } };
    reviewerUsers: { include: { user: { select: { id: true; name: true; code: true } } }; orderBy: { sortOrder: "asc" } };
    updates: {
      orderBy: { timestamp: "asc" };
      include: { createdBy: { select: { name: true } } };
    };
    proofs: { include: { file: { select: { name: true; url: true } } } };
  };
}>;

function mapActionItem(item: ActionItemWithRelations, latestMeetingId: string | null) {
  const now = Date.now();
  const dueTime = item.dueDate.getTime();
  const overdueDays = dueTime < now ? Math.floor((now - dueTime) / (24 * 60 * 60 * 1000)) : undefined;

  const perfUsers = item.performers.map((p) => p.user);
  const revUsers = item.reviewerUsers.map((r) => r.user);

  const hasUpdateForLatestMeeting =
    latestMeetingId != null
      ? item.updates.some((update) => update.meetingId === latestMeetingId)
      : false;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    vertical: item.vertical?.name ?? item.scheme?.verticalName ?? "",
    priority: item.priority,
    dueDate: toIsoDate(item.dueDate),
    createdAt: item.createdAt.toISOString(),
    status: item.status,
    archived: item.archived,
    assignedTo: perfUsers.map((u) => u.name).join(", ") || "",
    reviewer: revUsers.length === 0 ? "Self-Approved" : (revUsers.map((u) => u.name).join(", ") || ""),
    performers: perfUsers.map((u) => ({ id: u.id, name: u.name, code: u.code })),
    reviewers: revUsers.map((u) => ({ id: u.id, name: u.name, code: u.code })),
    assignedToUserIds: perfUsers.map((u) => u.id),
    reviewerUserIds: revUsers.map((u) => u.id),
    assignedToUserCode: perfUsers[0]?.code ?? null,
    reviewerUserCode: revUsers[0]?.code ?? null,
    isSelfApproved: revUsers.length === 0,
    schemeId: item.scheme?.code ?? "",
    meetingId: item.meetingId,
    meetingDate: item.meeting ? toIsoDate(item.meeting.meetingDate) : null,
    meetingTitle: item.meeting ? item.meeting.title : null,
    daysOverdue: overdueDays,
    hasUpdateForLatestMeeting,
    updates: item.updates.map((update) => ({
      id: update.id,
      meetingId: update.meetingId,
      timestamp: update.timestamp.toISOString(),
      actor: update.createdBy?.name ?? "",
      createdById: update.createdById,
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
  meeting: { select: { meetingDate: true, title: true } },
  performers: {
    where: { isActive: true },
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
    const user = await requireAnyPermissionAndDbUser("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
    const scope = await resolveDataScope(user);

    const take = parseListLimit(new URL(request.url).searchParams);

    const latestMeeting = await prisma.dashboardMeeting.findFirst({
      orderBy: { meetingDate: "desc" },
      select: { id: true },
    });
    const latestMeetingId = latestMeeting?.id ?? null;

    const archivedParam = new URL(request.url).searchParams.get("archived") === "true";

    const items = await prisma.actionItem.findMany({
      where: { ...actionItemWhere(scope), archived: archivedParam },
      include: actionInclude,
      orderBy: [{ dueDate: "asc" }, { title: "asc" }],
      take,
    });

    return NextResponse.json({
      items: items.map((item) => mapActionItem(item as ActionItemWithRelations, latestMeetingId)),
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
  isSelfApproved?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("CREATE_ACTION_ITEMS");

    const body = (await request.json()) as CreateBody;
    const auditContext = getAuditRequestContext(request);

    const isSelfApproved = body.isSelfApproved === true;
    let performerCodes = normalizeCodes(body.performerUserCodes);
    let reviewerCodes = isSelfApproved ? [] : normalizeCodes(body.reviewerUserCodes);
    if (performerCodes.length === 0 && body.assignedToUserCode?.trim()) {
      performerCodes = [body.assignedToUserCode.trim()];
    }
    if (!isSelfApproved && reviewerCodes.length === 0 && body.reviewerUserCode?.trim()) {
      reviewerCodes = [body.reviewerUserCode.trim()];
    }

    if (performerCodes.length === 0 || (!isSelfApproved && reviewerCodes.length === 0)) {
      return NextResponse.json(
        { detail: isSelfApproved 
          ? "performerUserCodes (non-empty array) is required when self-approved" 
          : "performerUserCodes and reviewerUserCodes (non-empty arrays), or legacy assignedToUserCode and reviewerUserCode, are required" 
        },
        { status: 400 },
      );
    }

    if (!isSelfApproved) {
      const overlap = performerCodes.filter((c) => reviewerCodes.includes(c));
      if (overlap.length > 0) {
        return NextResponse.json(
          { detail: "Assigned officer and reviewer must not be the same person" },
          { status: 400 },
        );
      }
    }


    let scheme = null;
    if (body.schemeCode) {
      scheme = await prisma.scheme.findFirst({
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


    const dueDate = new Date(`${body.dueDate}T00:00:00.000Z`);

    // The scheme's vertical, read from its RELATION rather than re-derived by
    // matching its display string against the vertical catalog. The string match
    // this replaces would silently yield null on any spelling drift between the
    // two tables, quietly dropping the item out of every vertical-scoped view.
    const verticalId: string | null = scheme?.verticalId ?? null;

    const created = await prisma.$transaction(async (tx) => {
      const actionItem = await tx.actionItem.create({
        data: tenantStamped({
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
            create: tenantStamped(performerIds.map((userId, i) => ({ userId, sortOrder: i }))),
          },
          reviewerUsers: {
            create: tenantStamped(reviewerIds.map((userId, i) => ({ userId, sortOrder: i }))),
          },
        }),
      });

      await tx.actionItemUpdate.create({
        data: tenantStamped({
          actionItemId: actionItem.id,
          timestamp: new Date(),
          status: ActionItemStatus.OPEN,
          note: "Action item created",
          createdById: actor?.id ?? null,
        }),
      });

      await logAudit(
        tx,
        actor?.id,
        "action_item.create",
        "action_item",
        actionItem.id,
        null,
        { id: actionItem.id, title: actionItem.title, schemeId: scheme?.id ?? null, meetingId: body.meetingId ?? null },
        { ...auditContext, meetingId: body.meetingId ?? null, schemeId: scheme?.id ?? null },
      );

      return actionItem;
    });

    // Trigger notifications for all assigned performers
    for (const performerId of performerIds) {
      await NotificationService.trigger({
        userId: performerId,
        title: "New Action Item Assigned",
        content: `You have been assigned the action item: "${created.title}"`,
        type: "ACTION_ITEM_ASSIGNED",
        priority: created.priority,
        link: `/action-items/${created.id}`,
        metadata: { actionItemId: created.id },
      });
    }

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
