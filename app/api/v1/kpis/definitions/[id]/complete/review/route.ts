import { NextRequest, NextResponse } from "next/server";
import { KpiCompletionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { assertKpiReviewerForDefinition, userRoleIdsFromDbUser } from "@/lib/kpi-access";
import { hasPermissionForUser, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { NotificationService } from "@/lib/services/NotificationService";
import { ActionItemPriority } from "@prisma/client";

export const runtime = "nodejs";

type Body = {
  decision: "approve" | "reject";
  note?: string;
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("APPROVE_KPI");

    const { id } = await ctx.params;
    const body = (await request.json()) as Body;

    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json({ detail: "decision must be 'approve' or 'reject'" }, { status: 400 });
    }
    if (body.decision === "reject" && !body.note?.trim()) {
      return NextResponse.json({ detail: "Rejection requires a note" }, { status: 400 });
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

    if (!actor) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    if (definition.completionStatus !== "pending_review") {
      return NextResponse.json(
        { detail: "KPI does not have a pending completion request to review" },
        { status: 409 },
      );
    }

    const roleIds = userRoleIdsFromDbUser(actor);
    const canManageSchemes = hasPermissionForUser(actor, "MANAGE_SCHEMES");
    await assertKpiReviewerForDefinition(
      {
        schemeId: definition.schemeId,
        reviewerUserIds: definition.reviewerUsers.map((r) => r.userId),
      },
      actor.id,
      roleIds,
      { canManageSchemes },
    );

    const auditContext = getAuditRequestContext(request);
    const now = new Date();
    const note = body.note?.trim() || null;
    const nextStatus: KpiCompletionStatus =
      body.decision === "approve" ? KpiCompletionStatus.completed : KpiCompletionStatus.rejected;

    const before = {
      completionStatus: definition.completionStatus,
      completionNote: definition.completionNote,
      completionReviewedById: definition.completionReviewedById,
    };

    const updated = await prisma.kpiDefinition.update({
      where: { id },
      data: {
        completionStatus: nextStatus,
        completionReviewedAt: now,
        completionReviewedById: actor.id,
        completionReviewNote: note,
      },
    });

    await logAudit(
      actor.id,
      "kpi_definition.review_completion",
      "kpi_definition",
      id,
      before,
      {
        completionStatus: updated.completionStatus,
        decision: body.decision,
        note,
      },
      {
        ...auditContext,
        schemeId: definition.schemeId,
        schemeCode: definition.scheme.code,
        kpiDefinitionId: id,
        decision: body.decision,
      },
    );

    // Notify the requester of the decision.
    if (definition.completionRequestedById) {
      await NotificationService.trigger({
        userId: definition.completionRequestedById,
        title: body.decision === "approve"
          ? "KPI Completion Approved"
          : "KPI Completion Request Rejected",
        content: body.decision === "approve"
          ? `Your completion request for KPI "${definition.description}" has been approved.`
          : `Your completion request for KPI "${definition.description}" was rejected. Reason: "${note ?? ""}"`,
        type: "KPI_COMPLETION_DECISION",
        priority: ActionItemPriority.Medium,
        link: "/kpis",
        metadata: { kpiDefinitionId: id },
      });
    }

    return NextResponse.json({
      ok: true,
      completionStatus: updated.completionStatus,
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
