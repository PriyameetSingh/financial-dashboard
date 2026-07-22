import { NextRequest, NextResponse } from "next/server";
import { KpiCompletionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { assertKpiUpdaterForDefinition, userRoleIdsFromDbUser } from "@/lib/kpi-access";
import { hasPermissionForUser, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { NotificationService } from "@/lib/services/NotificationService";
import { ActionItemPriority } from "@prisma/client";

export const runtime = "nodejs";

type Body = {
  note?: string;
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("ENTER_KPI_DATA");

    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as Body;

    if (!actor) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const definition = await prisma.kpiDefinition.findUnique({
      where: { id },
      include: {
        performers: { where: { isActive: true }, select: { userId: true } },
        reviewerUsers: { select: { userId: true } },
        scheme: { select: { code: true } },
      },
    });

    if (!definition || (definition as any).archived) {
      return NextResponse.json({ detail: "KPI definition not found or archived" }, { status: 404 });
    }

    if (definition.completionStatus === "completed") {
      return NextResponse.json({ detail: "KPI is already marked complete" }, { status: 409 });
    }
    if (definition.completionStatus === "pending_review") {
      return NextResponse.json({ detail: "A completion request is already pending review" }, { status: 409 });
    }

    const roleIds = userRoleIdsFromDbUser(actor);
    const canManageSchemes = hasPermissionForUser(actor, "MANAGE_SCHEMES");
    await assertKpiUpdaterForDefinition(
      {
        schemeId: definition.schemeId,
        performerUserIds: definition.performers.map((p) => p.userId),
      },
      actor.id,
      roleIds,
      { canManageSchemes },
    );

    const auditContext = getAuditRequestContext(request);
    const note = body.note?.trim() || null;
    const now = new Date();

    const hasReviewers = definition.reviewerUsers.length > 0;
    const isSelfApproved = !hasReviewers;
    // Self-approved KPIs and scheme managers auto-complete; reviewed KPIs go to pending review.
    const nextStatus: KpiCompletionStatus = isSelfApproved || canManageSchemes
      ? KpiCompletionStatus.completed
      : KpiCompletionStatus.pending_review;

    const before = {
      completionStatus: definition.completionStatus,
      completionNote: definition.completionNote,
    };

    const updated = await prisma.kpiDefinition.update({
      where: { id },
      data: {
        completionStatus: nextStatus,
        completionNote: note,
        completionRequestedAt: now,
        completionRequestedById: actor.id,
        ...(nextStatus === KpiCompletionStatus.completed
          ? {
              completionReviewedAt: now,
              completionReviewedById: actor.id,
              completionReviewNote: null,
            }
          : {}),
      },
    });

    await logAudit(
      actor.id,
      nextStatus === KpiCompletionStatus.completed
        ? "kpi_definition.complete_auto"
        : "kpi_definition.request_completion",
      "kpi_definition",
      id,
      before,
      {
        completionStatus: updated.completionStatus,
        completionNote: note,
      },
      {
        ...auditContext,
        schemeId: definition.schemeId,
        schemeCode: definition.scheme.code,
        kpiDefinitionId: id,
        autoApproved: nextStatus === KpiCompletionStatus.completed,
      },
    );

    // Notify reviewers when a completion request needs their review.
    if (nextStatus === KpiCompletionStatus.pending_review) {
      for (const reviewer of definition.reviewerUsers) {
        await NotificationService.trigger({
          userId: reviewer.userId,
          title: "KPI Completion Requested for Review",
          content: `A completion request has been submitted for KPI: "${definition.description}"`,
          type: "KPI_COMPLETION_REVIEW",
          priority: ActionItemPriority.Medium,
          link: "/kpis",
          metadata: { kpiDefinitionId: id },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      completionStatus: updated.completionStatus,
      autoApproved: nextStatus === KpiCompletionStatus.completed,
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
