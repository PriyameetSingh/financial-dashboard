import { NextRequest, NextResponse } from "next/server";
import { KpiMonitoringLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

function normalizeUuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
}

function parseMonitoringLevel(value: unknown): KpiMonitoringLevel | null {
  if (value === "CS" || value === "ACS" || value === "CM") return value;
  return null;
}

type PatchBody = {
  performerUserIds?: string[] | null;
  reviewerUserIds?: string[] | null;
  assignedToId?: string | null;
  reviewerId?: string | null;
  description?: string | null;
  monitoringLevel?: string | null;
  denominatorValue?: number | null;
  archived?: boolean | null;
  isSelfApproved?: boolean | null;
};

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const body = (await request.json()) as PatchBody;

    const fy = await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } });

    const existing = await prisma.kpiDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        schemeId: true,
        description: true,
        monitoringLevel: true,
        archived: true,
        scheme: { select: { code: true } },
        performers: { where: { isActive: true }, select: { userId: true } },
        reviewerUsers: { select: { userId: true } },
        targets: fy
          ? {
              where: { financialYearId: fy.id },
              take: 1,
            }
          : false,
      },
    });

    if (!existing) {
      return NextResponse.json({ detail: "KPI definition not found" }, { status: 404 });
    }

    const currentIsSelfApproved = existing.reviewerUsers.length === 0;
    const isSelfApproved = body.isSelfApproved !== undefined
      ? body.isSelfApproved === true
      : (body.reviewerUserIds !== undefined && body.reviewerUserIds !== null ? body.reviewerUserIds.length === 0 : currentIsSelfApproved);

    let performerUserIds = body.performerUserIds !== undefined ? normalizeUuidList(body.performerUserIds) : [];
    if (body.performerUserIds === undefined) {
      performerUserIds = existing.performers.map((p) => p.userId);
    }
    if (performerUserIds.length === 0 && typeof body.assignedToId === "string" && body.assignedToId.trim()) {
      performerUserIds = [body.assignedToId.trim()];
    }

    let reviewerUserIds = isSelfApproved
      ? []
      : (body.reviewerUserIds !== undefined ? normalizeUuidList(body.reviewerUserIds) : []);
    if (!isSelfApproved && body.reviewerUserIds === undefined) {
      reviewerUserIds = existing.reviewerUsers.map((r) => r.userId);
    }
    if (!isSelfApproved && reviewerUserIds.length === 0 && typeof body.reviewerId === "string" && body.reviewerId.trim()) {
      reviewerUserIds = [body.reviewerId.trim()];
    }

    if (
      body.performerUserIds === undefined &&
      body.reviewerUserIds === undefined &&
      body.assignedToId === undefined &&
      body.reviewerId === undefined &&
      body.description === undefined &&
      body.monitoringLevel === undefined &&
      body.denominatorValue === undefined &&
      body.archived === undefined &&
      body.isSelfApproved === undefined
    ) {
      return NextResponse.json({ detail: "At least one field to update is required" }, { status: 400 });
    }

    const isAssignmentUpdate =
      body.performerUserIds !== undefined ||
      body.reviewerUserIds !== undefined ||
      body.assignedToId !== undefined ||
      body.reviewerId !== undefined ||
      body.isSelfApproved !== undefined;

    if (isAssignmentUpdate && performerUserIds.length === 0) {
      return NextResponse.json(
        { detail: "At least one performer must be set (active user ids)" },
        { status: 400 },
      );
    }

    if (isAssignmentUpdate && !isSelfApproved && reviewerUserIds.length === 0) {
      return NextResponse.json(
        { detail: "At least one reviewer must be set (active user ids) when not self-approved" },
        { status: 400 },
      );
    }

    if (!isSelfApproved && reviewerUserIds.length > 0) {
      const overlap = performerUserIds.filter((uid) => reviewerUserIds.includes(uid));
      if (overlap.length > 0) {
        return NextResponse.json({ detail: "Performers and reviewers must not include the same user" }, { status: 400 });
      }
    }

    const allIds = [...performerUserIds, ...reviewerUserIds];
    const usersFound = await prisma.user.findMany({
      where: { id: { in: allIds }, isActive: true },
      select: { id: true, name: true },
    });
    if (usersFound.length !== allIds.length) {
      return NextResponse.json({ detail: "Assignee or reviewer user not found or inactive" }, { status: 400 });
    }

    const auditContext = getAuditRequestContext(request);
    const newDescription = typeof body.description === "string" && body.description.trim() ? body.description.trim() : undefined;
    const newMonitoringLevel = body.monitoringLevel !== undefined ? parseMonitoringLevel(body.monitoringLevel) : undefined;
    const newDenominatorValue = body.denominatorValue !== undefined ? (body.denominatorValue === null ? null : Number(body.denominatorValue)) : undefined;

    const before = {
      performerUserIds: existing.performers.map((p) => p.userId),
      reviewerUserIds: existing.reviewerUsers.map((r) => r.userId),
      description: existing.description,
      monitoringLevel: existing.monitoringLevel,
      denominatorValue: (existing as any).targets?.[0]?.denominatorValue ? Number((existing as any).targets[0].denominatorValue) : null,
      archived: existing.archived,
    };

    const updated = await prisma.$transaction(async (tx) => {
      if (isAssignmentUpdate) {
        const currentlyActive = await tx.kpiDefinitionPerformer.findMany({
          where: { kpiDefinitionId: id, isActive: true },
        });
        const currentlyActiveUserIds = currentlyActive.map((p) => p.userId);

        const toUnassign = currentlyActive.filter((p) => !performerUserIds.includes(p.userId));
        for (const p of toUnassign) {
          await tx.kpiDefinitionPerformer.updateMany({
            where: { kpiDefinitionId: id, userId: p.userId, isActive: true },
            data: { isActive: false, unassignedAt: new Date() },
          });
        }

        for (let i = 0; i < performerUserIds.length; i++) {
          const userId = performerUserIds[i];
          if (currentlyActiveUserIds.includes(userId)) {
            await tx.kpiDefinitionPerformer.updateMany({
              where: { kpiDefinitionId: id, userId, isActive: true },
              data: { sortOrder: i },
            });
          } else {
            await tx.kpiDefinitionPerformer.create({
              data: {
                kpiDefinitionId: id,
                userId,
                isActive: true,
                assignedAt: new Date(),
                sortOrder: i,
              },
            });
          }
        }

        await tx.kpiDefinitionReviewerUser.deleteMany({ where: { kpiDefinitionId: id } });
        if (reviewerUserIds.length > 0) {
          await tx.kpiDefinitionReviewerUser.createMany({
            data: reviewerUserIds.map((userId, i) => ({ kpiDefinitionId: id, userId, sortOrder: i })),
          });
        }
      }
      if (newDescription !== undefined || newMonitoringLevel !== undefined || body.archived !== undefined) {
        await tx.kpiDefinition.update({
          where: { id },
          data: {
            ...(newDescription !== undefined ? { description: newDescription } : {}),
            ...(newMonitoringLevel !== undefined ? { monitoringLevel: newMonitoringLevel } : {}),
            ...(body.archived !== undefined ? { archived: body.archived === null ? false : body.archived } : {}),
          },
        });
      }
      if (newDenominatorValue !== undefined && fy) {
        const target = (existing as any).targets?.[0];
        if (target) {
          await tx.kpiTarget.update({
            where: { id: target.id },
            data: { denominatorValue: newDenominatorValue },
          });
        } else {
          await tx.kpiTarget.create({
            data: {
              kpiDefinitionId: id,
              financialYearId: fy.id,
              denominatorValue: newDenominatorValue,
            },
          });
        }
      }
      return tx.kpiDefinition.findUniqueOrThrow({
        where: { id },
        include: {
          performers: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            include: { user: { select: { id: true, name: true } } },
          },
          reviewerUsers: {
            orderBy: { sortOrder: "asc" },
            include: { user: { select: { id: true, name: true } } },
          },
          targets: fy
            ? {
                where: { financialYearId: fy.id },
                include: {
                  measurements: {
                    orderBy: { measuredAt: "desc" },
                    include: { createdBy: { select: { id: true, name: true } } },
                    take: 1,
                  },
                },
                take: 1,
              }
            : false,
        },
      });
    });

    await logAudit(
      actor?.id,
      "kpi_definition.update",
      "kpi_definition",
      id,
      before,
      {
        performerUserIds,
        reviewerUserIds,
        description: newDescription ?? null,
        monitoringLevel: newMonitoringLevel ?? null,
        denominatorValue: newDenominatorValue ?? null,
        archived: body.archived !== undefined ? body.archived : null,
      },
      { ...auditContext, schemeId: existing.schemeId, schemeCode: existing.scheme.code },
    );

    const history = await getKpiAssignmentHistory(id);

    return NextResponse.json({
      ok: true,
      assignedToUserId: updated.performers[0]?.userId ?? null,
      assignedToName: updated.performers.map((p) => p.user.name).join(", ") || null,
      reviewerUserId: updated.reviewerUsers.length === 0 ? "Self-Approved" : (updated.reviewerUsers[0]?.userId ?? null),
      reviewerName: updated.reviewerUsers.length === 0 ? "Self-Approved" : (updated.reviewerUsers.map((r) => r.user.name).join(", ") || null),
      performerUserIds: updated.performers.map((p) => p.userId),
      reviewerUserIds: updated.reviewerUsers.map((r) => r.userId),
      isSelfApproved: updated.reviewerUsers.length === 0,
      description: updated.description,
      monitoringLevel: updated.monitoringLevel,
      denominatorValue: (updated as any).targets?.[0]?.denominatorValue ? Number((updated as any).targets[0].denominatorValue) : null,
      archived: updated.archived,
      assignmentHistory: history,
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

async function getKpiAssignmentHistory(kpiDefinitionId: string) {
  const history = await prisma.kpiDefinitionPerformer.findMany({
    where: { kpiDefinitionId },
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
