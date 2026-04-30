import { NextRequest, NextResponse } from "next/server";
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

type PatchBody = {
  performerUserIds?: string[] | null;
  reviewerUserIds?: string[] | null;
  assignedToId?: string | null;
  reviewerId?: string | null;
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
      body.reviewerId === undefined
    ) {
      return NextResponse.json({ detail: "performerUserIds and reviewerUserIds are required" }, { status: 400 });
    }

    if (performerUserIds.length === 0 || reviewerUserIds.length === 0) {
      return NextResponse.json(
        { detail: "At least one performer and one reviewer must be set (active user ids)" },
        { status: 400 },
      );
    }

    const overlap = performerUserIds.filter((uid) => reviewerUserIds.includes(uid));
    if (overlap.length > 0) {
      return NextResponse.json({ detail: "Performers and reviewers must not include the same user" }, { status: 400 });
    }

    const existing = await prisma.kpiDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        schemeId: true,
        description: true,
        scheme: { select: { code: true } },
        performers: { select: { userId: true } },
        reviewerUsers: { select: { userId: true } },
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

    const before = {
      performerUserIds: existing.performers.map((p) => p.userId),
      reviewerUserIds: existing.reviewerUsers.map((r) => r.userId),
    };

    const updated = await prisma.$transaction(async (tx) => {
      await tx.kpiDefinitionPerformer.deleteMany({ where: { kpiDefinitionId: id } });
      await tx.kpiDefinitionReviewerUser.deleteMany({ where: { kpiDefinitionId: id } });
      await tx.kpiDefinitionPerformer.createMany({
        data: performerUserIds.map((userId, i) => ({ kpiDefinitionId: id, userId, sortOrder: i })),
      });
      await tx.kpiDefinitionReviewerUser.createMany({
        data: reviewerUserIds.map((userId, i) => ({ kpiDefinitionId: id, userId, sortOrder: i })),
      });
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
        },
      });
    });

    await logAudit(
      actor?.id,
      "kpi_definition.assignments",
      "kpi_definition",
      id,
      before,
      { performerUserIds, reviewerUserIds },
      { ...auditContext, schemeId: existing.schemeId, schemeCode: existing.scheme.code },
    );

    return NextResponse.json({
      ok: true,
      assignedToUserId: updated.performers[0]?.userId ?? null,
      assignedToName: updated.performers.map((p) => p.user.name).join(", ") || null,
      reviewerUserId: updated.reviewerUsers[0]?.userId ?? null,
      reviewerName: updated.reviewerUsers.map((r) => r.user.name).join(", ") || null,
      performerUserIds,
      reviewerUserIds,
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
