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
  archived?: boolean;
  isSelfApproved?: boolean;
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
  meeting: { select: { meetingDate: true, title: true } },
  performers: {
    where: { isActive: true },
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

function mapActionItem(item: ActionItemWithRelations, assignmentHistory?: any[]) {
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
    archived: item.archived,
    assignedTo: perfUsers.map((u) => u.name).join(", ") || "",
    reviewer: revUsers.length === 0 ? "Self-Approved" : (revUsers.map((u) => u.name).join(", ") || ""),
    performers: perfUsers.map((u) => ({ id: u.id, name: u.name, code: u.code, designation: u.designationRel?.name ?? "" })),
    reviewers: revUsers.map((u) => ({ id: u.id, name: u.name, code: u.code, designation: u.designationRel?.name ?? "" })),
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
    assignmentHistory: assignmentHistory ?? [],
  };
}

async function getAssignmentHistory(actionItemId: string) {
  const history = await prisma.actionItemPerformer.findMany({
    where: { actionItemId },
    orderBy: { assignedAt: "desc" },
    include: { user: { select: { id: true, name: true, code: true } } },
  });
  return history.map((h) => ({
    userId: h.userId,
    userName: h.user.name,
    userCode: h.user.code,
    assignedAt: h.assignedAt.toISOString(),
    unassignedAt: h.unassignedAt ? h.unassignedAt.toISOString() : null,
    isActive: h.isActive,
  }));
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
    const history = await getAssignmentHistory(id);
    return NextResponse.json({ item: mapActionItem(item, history) });
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
        updates: true,
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

    if (body.archived !== undefined) {
      if (current.status !== "COMPLETED") {
        return NextResponse.json({ detail: "Only completed action items can be archived" }, { status: 400 });
      }

      if (!isAssignee && !isReviewer && !canEdit) {
        return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
      }

      await prisma.actionItem.update({
        where: { id },
        data: { archived: body.archived },
      });

      await prisma.actionItemUpdate.create({
        data: {
          actionItemId: id,
          meetingId: current.meetingId,
          timestamp: new Date(),
          status: current.status,
          note: body.archived ? "Action item archived" : "Action item unarchived",
          createdById: actor.id,
        },
      });

      await logAudit(
        actor.id,
        "action_item.archive",
        "action_item",
        id,
        { archived: current.archived },
        { archived: body.archived },
        { ...auditContext, meetingId: current.meetingId, schemeId: current.schemeId },
      );

      const item = await getActionItemById(id);
      const history = await getAssignmentHistory(id);
      return NextResponse.json({ item: item ? mapActionItem(item, history) : null });
    }

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
      const history = await getAssignmentHistory(id);
      return NextResponse.json({ item: item ? mapActionItem(item, history) : null });
    }

    if (
      body.isSelfApproved !== undefined ||
      body.performerUserCodes !== undefined ||
      body.reviewerUserCodes !== undefined ||
      body.assignedToUserCode !== undefined ||
      body.reviewerUserCode !== undefined
    ) {
      if (!canEdit) {
        return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
      }

      const currentIsSelfApproved = current.reviewerUsers.length === 0;
      const isSelfApproved = body.isSelfApproved !== undefined
        ? body.isSelfApproved === true
        : (body.reviewerUserCodes !== undefined ? body.reviewerUserCodes.length === 0 : currentIsSelfApproved);

      let performerCodes = body.performerUserCodes !== undefined
        ? normalizeCodes(body.performerUserCodes)
        : [];
      if (body.performerUserCodes === undefined) {
        const currentPerformers = await prisma.actionItemPerformer.findMany({
          where: { actionItemId: id, isActive: true },
          include: { user: { select: { code: true } } },
        });
        performerCodes = currentPerformers.map((p) => p.user.code).filter((c): c is string => !!c);
      }

      let reviewerCodes = isSelfApproved
        ? []
        : (body.reviewerUserCodes !== undefined ? normalizeCodes(body.reviewerUserCodes) : []);
      if (!isSelfApproved && body.reviewerUserCodes === undefined) {
        const currentReviewers = await prisma.actionItemReviewerUser.findMany({
          where: { actionItemId: id },
          include: { user: { select: { code: true } } },
        });
        reviewerCodes = currentReviewers.map((r) => r.user.code).filter((c): c is string => !!c);
      }

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
            : "performerUserCodes and reviewerUserCodes (non-empty arrays), or legacy single-code fields, are required"
          },
          { status: 400 },
        );
      }

      if (!isSelfApproved) {
        const overlap = performerCodes.filter((c) => reviewerCodes.includes(c));
        if (overlap.length > 0) {
          return NextResponse.json(
            { detail: "Performers and reviewers must be different users" },
            { status: 400 },
          );
        }
      }

      const allCodes = [...performerCodes, ...reviewerCodes];
      const usersFound = await prisma.user.findMany({
        where: { code: { in: allCodes } },
        select: { id: true, code: true, name: true },
      });
      const performersFound = usersFound.filter((u) => u.code && performerCodes.includes(u.code));
      const reviewersFound = usersFound.filter((u) => u.code && reviewerCodes.includes(u.code));
      if (performersFound.length !== performerCodes.length || reviewersFound.length !== reviewerCodes.length) {
        return NextResponse.json({ detail: "Assignee or reviewer user not found" }, { status: 400 });
      }

      const nextPerformerIds = performerCodes.map((code) => performersFound.find((u) => u.code === code)!.id);
      const nextReviewerIds = reviewerCodes.map((code) => reviewersFound.find((u) => u.code === code)!.id);

      const prevItem = await getActionItemById(id);
      const prevAssignName = prevItem
        ? prevItem.performers.map((p) => p.user.name).join(", ") || "—"
        : "—";
      const prevReviewName = prevItem
        ? prevItem.reviewerUsers.map((r) => r.user.name).join(", ") || "—"
        : "—";

      await prisma.$transaction(async (tx) => {
        const currentlyActive = await tx.actionItemPerformer.findMany({
          where: { actionItemId: id, isActive: true },
        });
        const currentlyActiveUserIds = currentlyActive.map((p) => p.userId);

        const toUnassign = currentlyActive.filter((p) => !nextPerformerIds.includes(p.userId));
        for (const p of toUnassign) {
          await tx.actionItemPerformer.updateMany({
            where: { actionItemId: id, userId: p.userId, isActive: true },
            data: { isActive: false, unassignedAt: new Date() },
          });
        }

        for (let i = 0; i < nextPerformerIds.length; i++) {
          const userId = nextPerformerIds[i];
          if (currentlyActiveUserIds.includes(userId)) {
            await tx.actionItemPerformer.updateMany({
              where: { actionItemId: id, userId, isActive: true },
              data: { sortOrder: i },
            });
          } else {
            await tx.actionItemPerformer.create({
              data: {
                actionItemId: id,
                userId,
                isActive: true,
                assignedAt: new Date(),
                sortOrder: i,
              },
            });
          }
        }

        await tx.actionItemReviewerUser.deleteMany({ where: { actionItemId: id } });
        if (nextReviewerIds.length > 0) {
          await tx.actionItemReviewerUser.createMany({
            data: nextReviewerIds.map((userId, i) => ({ actionItemId: id, userId, sortOrder: i })),
          });
        }
      });

      await prisma.actionItemUpdate.create({
        data: {
          actionItemId: id,
          meetingId: current.meetingId,
          timestamp: new Date(),
          status: current.status,
          note: `Reassigned: performers ${prevAssignName} → ${performersFound.map((u) => u.name).join(", ")}; reviewers ${prevReviewName} → ${isSelfApproved ? "Self-Approved" : (reviewersFound.map((u) => u.name).join(", ") || "—")}`,
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
      const history = await getAssignmentHistory(id);
      return NextResponse.json({ item: item ? mapActionItem(item, history) : null });
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
      const history = await getAssignmentHistory(id);
      return NextResponse.json({ item: item ? mapActionItem(item, history) : null });
    }

    if (body.status || (body.note && body.note.trim())) {
      if (body.status === "IN_PROGRESS") {
        const systemNotes = [
          "Action item created",
          "Marked in progress",
          "Action item archived",
          "Action item unarchived",
          "Reviewer approved completion",
          "Submitted for reviewer approval",
          "Completed & reviewed automatically",
        ];
        const hasManualUpdates = current.updates.some((u) => {
          const note = u.note || "";
          if (systemNotes.includes(note)) return false;
          if (note.startsWith("Reassigned: performers")) return false;
          if (note.startsWith("Reviewer rejected: ")) return false;
          if (note.includes("Completed & reviewed automatically")) return false;
          return true;
        });

        if (current.status !== "OPEN" && current.status !== "OVERDUE" && current.status !== "UNDER_REVIEW") {
          return NextResponse.json({ detail: "Cannot transition back to In Progress state" }, { status: 400 });
        }
        if ((current.status === "OPEN" || current.status === "OVERDUE") && hasManualUpdates) {
          return NextResponse.json({ detail: "Cannot mark In Progress after updates have been added" }, { status: 400 });
        }
      }

      if (!isAssignee && !canEdit) {
        return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
      }
      let nextStatus = body.status;
      let noteTrimmed = body.note?.trim() ?? "";

      const hasOverlap = reviewerIds.size === 0 || [...performerIds].some((id) => reviewerIds.has(id));
      if (nextStatus === ActionItemStatus.UNDER_REVIEW && hasOverlap) {
        nextStatus = ActionItemStatus.COMPLETED;
        if (!noteTrimmed || noteTrimmed === "Submitted for reviewer approval") {
          noteTrimmed = "Completed & reviewed automatically";
        } else {
          noteTrimmed = `${noteTrimmed} (Completed & reviewed automatically)`;
        }
      }

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
      if (nextStatus && nextStatus !== current.status) {
        await prisma.actionItem.update({
          where: { id },
          data: { status: nextStatus },
        });
      }
      if (noteTrimmed.length > 0 && noteMeetingId) {
        await prisma.actionItemUpdate.create({
          data: {
            actionItemId: id,
            meetingId: noteMeetingId,
            timestamp: new Date(),
            status: nextStatus ?? current.status,
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
        { status: nextStatus ?? current.status },
        {
          ...auditContext,
          meetingId: noteMeetingId ?? current.meetingId,
          schemeId: current.schemeId,
        },
      );
    }

    const item = await getActionItemById(id);
    const history = await getAssignmentHistory(id);
    return NextResponse.json({ item: item ? mapActionItem(item, history) : null });
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
    const { id } = await ctx.params;

    const actor = await getDbUserBySession();
    if (!actor) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const canDelete = hasPermissionForUser(actor, "UPDATE_ACTION_ITEMS");
    if (!canDelete) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }

    const current = await prisma.actionItem.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, meetingId: true, schemeId: true },
    });

    if (!current) {
      return NextResponse.json({ detail: "Action item not found" }, { status: 404 });
    }

    const auditContext = getAuditRequestContext(request);

    await prisma.$transaction(async (tx) => {
      await tx.actionItemUpdate.deleteMany({ where: { actionItemId: id } });
      await tx.actionItemPerformer.deleteMany({ where: { actionItemId: id } });
      await tx.actionItemReviewerUser.deleteMany({ where: { actionItemId: id } });
      await tx.actionItemProof.deleteMany({ where: { actionItemId: id } });
      await tx.actionItem.delete({ where: { id } });
    });

    await logAudit(
      actor.id,
      "action_item.delete",
      "action_item",
      id,
      { title: current.title, status: current.status },
      null,
      { ...auditContext, meetingId: current.meetingId, schemeId: current.schemeId },
    );

    return NextResponse.json({ success: true, message: "Action item deleted successfully" });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
