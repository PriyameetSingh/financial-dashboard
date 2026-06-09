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
};

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const body = (await request.json()) as PatchBody;

    let performerUserIds = normalizeUuidList(body.performerUserIds);
    let reviewerUserIds = normalizeUuidList(body.reviewerUserIds);
    if (performerUserIds.length === 0 && typeof body.assignedToId === "string" && body.assignedToId.trim()) {
      performerUserIds = [body.assignedToId.trim()];
    }
    if (reviewerUserIds.length === 0 && typeof body.reviewerId === "string" && body.reviewerId.trim()) {
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
      body.archived === undefined
    ) {
      return NextResponse.json({ detail: "At least one field to update is required" }, { status: 400 });
    }

    const isAssignmentUpdate = body.performerUserIds !== undefined || body.reviewerUserIds !== undefined || body.assignedToId !== undefined || body.reviewerId !== undefined;
    if (isAssignmentUpdate && performerUserIds.length === 0) {
      return NextResponse.json(
        { detail: "At least one performer must be set (active user ids)" },
        { status: 400 },
      );
    }

    if (reviewerUserIds.length > 0) {
      const overlap = performerUserIds.filter((uid) => reviewerUserIds.includes(uid));
      if (overlap.length > 0) {
        return NextResponse.json({ detail: "Performers and reviewers must not include the same user" }, { status: 400 });
      }
    }

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
        performers: { select: { userId: true } },
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
        await tx.kpiDefinitionPerformer.deleteMany({ where: { kpiDefinitionId: id } });
        await tx.kpiDefinitionReviewerUser.deleteMany({ where: { kpiDefinitionId: id } });
        await tx.kpiDefinitionPerformer.createMany({
          data: performerUserIds.map((userId, i) => ({ kpiDefinitionId: id, userId, sortOrder: i })),
        });
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

    return NextResponse.json({
      ok: true,
      assignedToUserId: updated.performers[0]?.userId ?? null,
      assignedToName: updated.performers.map((p) => p.user.name).join(", ") || null,
      reviewerUserId: updated.reviewerUsers[0]?.userId ?? null,
      reviewerName: updated.reviewerUsers.map((r) => r.user.name).join(", ") || null,
      performerUserIds: updated.performers.map((p) => p.userId),
      reviewerUserIds: updated.reviewerUsers.map((r) => r.userId),
      description: updated.description,
      monitoringLevel: updated.monitoringLevel,
      denominatorValue: (updated as any).targets?.[0]?.denominatorValue ? Number((updated as any).targets[0].denominatorValue) : null,
      archived: updated.archived,
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
