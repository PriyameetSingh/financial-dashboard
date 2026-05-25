import { NextRequest, NextResponse } from "next/server";
import { ActionItemStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { getDbUserBySession, hasPermissionForUser, requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type Body = {
  status?: ActionItemStatus;
  note?: string;
  /** Required when posting a `note` — links the update to a meeting. */
  meetingId?: string;
  reviewerDecision?: "approve" | "reject";
  rejectionReason?: string;
  performerUserCodes?: string[];
  reviewerUserCodes?: string[];
  assignedToUserCode?: string;
  reviewerUserCode?: string;
  /** ISO date string (YYYY-MM-DD) to update the due date. */
  dueDate?: string;
  /** ID of an existing ActionItemUpdate whose note text should be edited. */
  updateId?: string;
  /** Replacement text for the update identified by `updateId`. */
  updateNote?: string;
  title?: string;
  description?: string;
  priority?: string;
};

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
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

const actionInclude = {
  scheme: { select: { code: true, verticalName: true } },
  vertical: { select: { name: true } },
  meeting: { select: { meetingDate: true } },
  performers: {
    orderBy: { sortOrder: "asc" as const },
    include: { user: { select: { id: true, name: true, code: true, designationId: true, designationRel: { select: { name: true } } } } },
  },
  reviewerUsers: {
    orderBy: { sortOrder: "asc" as const },
    include: { user: { select: { id: true, name: true, code: true, designationId: true, designationRel: { select: { name: true } } } } },
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

type ActionItemWithRelations = Prisma.ActionItemGetPayload<{ include: typeof actionInclude }>;

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
    createdAt: item.createdAt.toISOString(),
    status: item.status,
    assignedTo: perfUsers.map((u) => u.name).join(", ") || "",
    reviewer: revUsers.map((u) => u.name).join(", ") || "",
    performers: perfUsers.map((u) => ({ id: u.id, name: u.name, code: u.code, designation: u.designationRel?.name ?? "" })),
    reviewers: revUsers.map((u) => ({ id: u.id, name: u.name, code: u.code, designation: u.designationRel?.name ?? "" })),
    assignedToUserIds: perfUsers.map((u) => u.id),
    reviewerUserIds: revUsers.map((u) => u.id),
    assignedToUserCode: perfUsers[0]?.code ?? null,
    reviewerUserCode: revUsers[0]?.code ?? null,
    schemeId: item.scheme?.code ?? "",
    meetingId: item.meetingId,
    meetingDate: item.meeting ? toIsoDate(item.meeting.meetingDate) : null,
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

async function getActionItemById(id: string) {
  return prisma.actionItem.findUnique({
    where: { id },
    include: actionInclude,
  });
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const { id } = await ctx.params;
    const item = await getActionItemById(id);
    if (!item) {
      return NextResponse.json({ detail: "Action item not found" }, { status: 404 });
    }
    return NextResponse.json({ item: mapActionItem(item) });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as Body;

    const current = await prisma.actionItem.findUnique({
      where: { id },
      include: {
        performers: { select: { userId: true } },
        reviewerUsers: { select: { userId: true } },
      },
    });
    if (!current) {
      return NextResponse.json({ detail: "Action item not found" }, { status: 404 });
    }

    const actor = await getDbUserBySession();
    if (!actor) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const auditContext = getAuditRequestContext(request);
    const beforeStatus = current.status;

    const performerIds = new Set(current.performers.map((p) => p.userId));
    const reviewerIds = new Set(current.reviewerUsers.map((r) => r.userId));
    const isAssignee = performerIds.has(actor.id);
    const isReviewer = reviewerIds.has(actor.id);
    const canApprove = hasPermissionForUser(actor, "APPROVE_ACTION_ITEMS");
    const canEdit =
      hasPermissionForUser(actor, "UPDATE_ACTION_ITEMS") ||
      hasPermissionForUser(actor, "CREATE_ACTION_ITEMS");

    if (body.reviewerDecision === "approve" || body.reviewerDecision === "reject") {
      if (!isReviewer && !canApprove) {
        return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
      }
      if (body.reviewerDecision === "reject" && !body.rejectionReason?.trim()) {
        return NextResponse.json({ detail: "Rejection reason is required" }, { status: 400 });
      }
      const nextStatus = body.reviewerDecision === "approve" ? ActionItemStatus.COMPLETED : ActionItemStatus.IN_PROGRESS;
      await prisma.actionItem.update({
        where: { id },
        data: { status: nextStatus },
      });
      await prisma.actionItemUpdate.create({
        data: {
          actionItemId: id,
          meetingId: body.meetingId?.trim() ?? current.meetingId,
          timestamp: new Date(),
          status: nextStatus,
          note:
            body.reviewerDecision === "approve"
              ? "Reviewer approved completion"
              : `Reviewer rejected: ${body.rejectionReason}`,
          createdById: actor.id,
        },
      });
      await logAudit(
        actor.id,
        "action_item.review",
        "action_item",
        id,
        { status: beforeStatus },
        { status: nextStatus, decision: body.reviewerDecision },
        { ...auditContext, meetingId: current.meetingId, schemeId: current.schemeId },
      );
      const item = await getActionItemById(id);
      return NextResponse.json({ item: item ? mapActionItem(item) : null });
    }

    if (
      body.performerUserCodes !== undefined ||
      body.reviewerUserCodes !== undefined ||
      body.assignedToUserCode !== undefined ||
      body.reviewerUserCode !== undefined
    ) {
      if (!canEdit) {
        return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
      }

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
          { detail: "performerUserCodes and reviewerUserCodes (non-empty arrays), or legacy single-code fields, are required" },
          { status: 400 },
        );
      }

      const performers = await prisma.user.findMany({
        where: { code: { in: performerCodes } },
        select: { id: true, code: true, name: true },
      });
      const reviewers = await prisma.user.findMany({
        where: { code: { in: reviewerCodes } },
        select: { id: true, code: true, name: true },
      });
      if (performers.length !== performerCodes.length || reviewers.length !== reviewerCodes.length) {
        return NextResponse.json({ detail: "Assignee or reviewer user not found" }, { status: 400 });
      }

      const nextPerformerIds = performerCodes.map((code) => performers.find((u) => u.code === code)!.id);
      const nextReviewerIds = reviewerCodes.map((code) => reviewers.find((u) => u.code === code)!.id);
      const combined = new Set([...nextPerformerIds, ...nextReviewerIds]);
      if (combined.size !== nextPerformerIds.length + nextReviewerIds.length) {
        return NextResponse.json({ detail: "Performers and reviewers must be distinct users" }, { status: 400 });
      }

      const prevItem = await getActionItemById(id);
      const prevAssignName = prevItem
        ? prevItem.performers.map((p) => p.user.name).join(", ") || "—"
        : "—";
      const prevReviewName = prevItem
        ? prevItem.reviewerUsers.map((r) => r.user.name).join(", ") || "—"
        : "—";

      await prisma.$transaction(async (tx) => {
        await tx.actionItemPerformer.deleteMany({ where: { actionItemId: id } });
        await tx.actionItemReviewerUser.deleteMany({ where: { actionItemId: id } });
        await tx.actionItemPerformer.createMany({
          data: nextPerformerIds.map((userId, i) => ({ actionItemId: id, userId, sortOrder: i })),
        });
        await tx.actionItemReviewerUser.createMany({
          data: nextReviewerIds.map((userId, i) => ({ actionItemId: id, userId, sortOrder: i })),
        });
      });

      await prisma.actionItemUpdate.create({
        data: {
          actionItemId: id,
          meetingId: current.meetingId,
          timestamp: new Date(),
          status: current.status,
          note: `Reassigned: performers ${prevAssignName} → ${performers.map((u) => u.name).join(", ")}; reviewers ${prevReviewName} → ${reviewers.map((u) => u.name).join(", ")}`,
          createdById: actor.id,
        },
      });
      await logAudit(
        actor.id,
        "action_item.update",
        "action_item",
        id,
        { performerIds: [...performerIds], reviewerIds: [...reviewerIds] },
        { performerIds: nextPerformerIds, reviewerIds: nextReviewerIds },
        { ...auditContext, meetingId: current.meetingId, schemeId: current.schemeId },
      );
      const item = await getActionItemById(id);
      return NextResponse.json({ item: item ? mapActionItem(item) : null });
    }

    if (
      body.dueDate ||
      (body.updateId && body.updateNote !== undefined) ||
      body.title !== undefined ||
      body.description !== undefined ||
      body.priority !== undefined
    ) {
      if (!canEdit) {
        return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
      }

      const VALID_PRIORITIES = ["Critical", "High", "Medium", "Low"];
      const fieldData: Record<string, unknown> = {};
      if (body.title !== undefined) {
        const t = body.title.trim();
        if (!t) return NextResponse.json({ detail: "title must not be empty" }, { status: 400 });
        fieldData.title = t;
      }
      if (body.description !== undefined) {
        fieldData.description = body.description.trim();
      }
      if (body.priority !== undefined) {
        if (!VALID_PRIORITIES.includes(body.priority)) {
          return NextResponse.json({ detail: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` }, { status: 400 });
        }
        fieldData.priority = body.priority;
      }
      if (Object.keys(fieldData).length > 0) {
        await prisma.actionItem.update({ where: { id }, data: fieldData });
        const beforeFields: Record<string, string | null> = Object.fromEntries(
          Object.keys(fieldData).map((k) => {
            const v = (current as Record<string, unknown>)[k];
            return [k, v != null ? String(v) : null];
          }),
        );
        const afterFields: Record<string, string> = Object.fromEntries(
          Object.entries(fieldData).map(([k, v]) => [k, String(v)]),
        );
        await logAudit(
          actor.id,
          "action_item.update",
          "action_item",
          id,
          beforeFields,
          afterFields,
          { ...auditContext, meetingId: current.meetingId, schemeId: current.schemeId },
        );
      }

      if (body.dueDate) {
        const parsed = new Date(body.dueDate);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ detail: "Invalid dueDate" }, { status: 400 });
        }
        await prisma.actionItem.update({ where: { id }, data: { dueDate: parsed } });
        await logAudit(
          actor.id,
          "action_item.update",
          "action_item",
          id,
          { dueDate: toIsoDate(current.dueDate) },
          { dueDate: body.dueDate },
          { ...auditContext, meetingId: current.meetingId, schemeId: current.schemeId },
        );
      }

      if (body.updateId) {
        const noteTrimmed = (body.updateNote ?? "").trim();
        if (!noteTrimmed) {
          return NextResponse.json({ detail: "updateNote must not be empty" }, { status: 400 });
        }
        const existing = await prisma.actionItemUpdate.findUnique({ where: { id: body.updateId } });
        if (!existing || existing.actionItemId !== id) {
          return NextResponse.json({ detail: "Update not found" }, { status: 404 });
        }
        await prisma.actionItemUpdate.update({
          where: { id: body.updateId },
          data: { note: noteTrimmed },
        });
        await logAudit(
          actor.id,
          "action_item.update_edit",
          "action_item_update",
          body.updateId,
          { note: existing.note },
          { note: noteTrimmed },
          { ...auditContext, meetingId: current.meetingId, schemeId: current.schemeId },
        );
      }

      const item = await getActionItemById(id);
      return NextResponse.json({ item: item ? mapActionItem(item) : null });
    }

    if (body.status || (body.note && body.note.trim())) {
      if (!isAssignee && !canEdit) {
        return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
      }
      const noteTrimmed = body.note?.trim() ?? "";
      let noteMeetingId: string | null = null;
      if (noteTrimmed.length > 0) {
        if (!body.meetingId?.trim()) {
          return NextResponse.json({ detail: "Meeting is required to post an update" }, { status: 400 });
        }
        const meeting = await prisma.dashboardMeeting.findUnique({
          where: { id: body.meetingId.trim() },
          select: { id: true },
        });
        if (!meeting) {
          return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
        }
        noteMeetingId = meeting.id;
      }
      if (body.status && body.status !== current.status) {
        await prisma.actionItem.update({
          where: { id },
          data: { status: body.status },
        });
      }
      if (noteTrimmed.length > 0 && noteMeetingId) {
        await prisma.actionItemUpdate.create({
          data: {
            actionItemId: id,
            meetingId: noteMeetingId,
            timestamp: new Date(),
            status: body.status ?? current.status,
            note: noteTrimmed,
            createdById: actor.id,
          },
        });
      }
      await logAudit(
        actor.id,
        "action_item.update",
        "action_item",
        id,
        { status: beforeStatus },
        { status: body.status ?? current.status },
        {
          ...auditContext,
          meetingId: noteMeetingId ?? current.meetingId,
          schemeId: current.schemeId,
        },
      );
    }

    const item = await getActionItemById(id);
    return NextResponse.json({ item: item ? mapActionItem(item) : null });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
