import { NextRequest, NextResponse } from "next/server";
import { KPIWorkflowStatus, KpiEscalationFlag } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { assertKpiUpdaterForDefinition, userRoleIdsFromDbUser } from "@/lib/kpi-access";
import { hasPermissionForUser, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type Body = {
  kpiDefinitionId: string;
  financialYearLabel: string;
  measuredAt: string;
  /** Required — ties this measurement to a dashboard meeting. */
  meetingId: string;
  numeratorValue?: number | null;
  yesValue?: boolean | null;
  denominatorValue?: number | null;
  remarks?: string;
  workflowStatus?: "draft" | "submitted";
  /** Free-text bottleneck explanation (requires FLAG_KPI_ESCALATION). */
  bottleneckReason?: string | null;
  /** ACS routing flag (requires FLAG_KPI_ESCALATION). */
  escalationFlag?: "on_track" | "needs_coordination" | "needs_acs_decision" | null;
};

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermissionAndDbUser("ENTER_KPI_DATA");

    const body = (await request.json()) as Body;

    if (!body.meetingId?.trim()) {
      return NextResponse.json({ detail: "Meeting is required" }, { status: 400 });
    }
    const meeting = await prisma.dashboardMeeting.findUnique({
      where: { id: body.meetingId.trim() },
      select: { id: true },
    });
    if (!meeting) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    const definition = await prisma.kpiDefinition.findUnique({
      where: { id: body.kpiDefinitionId },
      include: {
        performers: { where: { isActive: true }, select: { userId: true } },
        reviewerUsers: { select: { userId: true } },
      },
    });
    if (!definition || (definition as any).archived) {
      return NextResponse.json({ detail: "KPI definition not found or archived" }, { status: 404 });
    }

    if (!actor) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
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

    const fy = await prisma.financialYear.findUnique({ where: { label: body.financialYearLabel } });
    if (!fy) {
      return NextResponse.json({ detail: "Financial year not found" }, { status: 404 });
    }

    const existingTarget = await prisma.kpiTarget.findUnique({
      where: {
        kpiDefinitionId_financialYearId: {
          kpiDefinitionId: definition.id,
          financialYearId: fy.id,
        },
      },
    });

    const canOverrideDenominator = hasPermissionForUser(actor, "MANAGE_SCHEMES");
    const canFlagEscalation = hasPermissionForUser(actor, "FLAG_KPI_ESCALATION");

    let target = existingTarget;
    if (!existingTarget) {
      target = await prisma.kpiTarget.create({
        data: {
          kpiDefinitionId: definition.id,
          financialYearId: fy.id,
          denominatorValue: body.denominatorValue ?? undefined,
        },
      });
    } else if (body.denominatorValue !== undefined && body.denominatorValue !== null) {
      const current = existingTarget.denominatorValue;
      const incoming = body.denominatorValue;
      const currentNum = current != null ? Number(current) : null;
      if (currentNum !== null && incoming !== currentNum && !canOverrideDenominator) {
        return NextResponse.json({ detail: "Denominator is locked for this KPI target" }, { status: 409 });
      }
      if (canOverrideDenominator || currentNum === null) {
        target = await prisma.kpiTarget.update({
          where: { id: existingTarget.id },
          data: { denominatorValue: incoming },
        });
      }
    }

    if (!target) {
      return NextResponse.json({ detail: "KPI target missing" }, { status: 500 });
    }

    const measuredAt = new Date(`${body.measuredAt}T00:00:00.000Z`);

    const existingMeasurement = await prisma.kpiMeasurement.findFirst({
      where: {
        kpiTargetId: target.id,
        measuredAt,
      },
      select: { id: true },
    });

    const auditContext = getAuditRequestContext(request);
    const beforeMeasurement = existingMeasurement
      ? await prisma.kpiMeasurement.findUnique({ where: { id: existingMeasurement.id } })
      : null;

    const requestedWorkflow = body.workflowStatus ?? "submitted";
    const isDraft = requestedWorkflow === "draft";
    const kpiHasReviewers = definition.reviewerUsers.length > 0;
    const resolvedWorkflowStatus: KPIWorkflowStatus = isDraft
      ? KPIWorkflowStatus.draft
      : kpiHasReviewers
        ? KPIWorkflowStatus.submitted
        : KPIWorkflowStatus.reviewed;

    const reviewFields =
      resolvedWorkflowStatus === KPIWorkflowStatus.draft
        ? { reviewedById: null, reviewedAt: null, reviewNote: null }
        : resolvedWorkflowStatus === KPIWorkflowStatus.reviewed
          ? { reviewedById: null, reviewedAt: new Date(), reviewNote: null }
          : { reviewedById: null, reviewedAt: null, reviewNote: null };

    const VALID_ESCALATION_FLAGS = new Set<string>(["on_track", "needs_coordination", "needs_acs_decision"]);
    const resolvedEscalationFlag: KpiEscalationFlag | null =
      canFlagEscalation &&
      body.escalationFlag &&
      VALID_ESCALATION_FLAGS.has(body.escalationFlag)
        ? (body.escalationFlag as KpiEscalationFlag)
        : null;
    const resolvedBottleneckReason: string | null =
      canFlagEscalation && body.bottleneckReason?.trim()
        ? body.bottleneckReason.trim()
        : null;

    if (existingMeasurement) {
      await prisma.kpiMeasurement.update({
        where: { id: existingMeasurement.id },
        data: {
          meetingId: meeting.id,
          numeratorValue: body.numeratorValue ?? null,
          yesValue: body.yesValue ?? null,
          workflowStatus: resolvedWorkflowStatus,
          progressStatus: "on_track",
          remarks: body.remarks,
          bottleneckReason: resolvedBottleneckReason,
          escalationFlag: resolvedEscalationFlag,
          createdById: actor.id,
          ...reviewFields,
        },
      });
    } else {
      await prisma.kpiMeasurement.create({
        data: {
          kpiTargetId: target.id,
          meetingId: meeting.id,
          measuredAt,
          numeratorValue: body.numeratorValue ?? null,
          yesValue: body.yesValue ?? null,
          workflowStatus: resolvedWorkflowStatus,
          progressStatus: "on_track",
          remarks: body.remarks,
          bottleneckReason: resolvedBottleneckReason,
          escalationFlag: resolvedEscalationFlag,
          createdById: actor.id,
          ...reviewFields,
        },
      });
    }

    const afterMeasurement = await prisma.kpiMeasurement.findFirst({
      where: { kpiTargetId: target.id, measuredAt },
    });

    await logAudit(
      actor.id,
      existingMeasurement ? "kpi.measurement.update" : "kpi.measurement.create",
      "kpi_measurement",
      afterMeasurement?.id,
      beforeMeasurement
        ? {
            numeratorValue: beforeMeasurement.numeratorValue?.toString() ?? null,
            workflowStatus: beforeMeasurement.workflowStatus,
          }
        : null,
      afterMeasurement
        ? {
            numeratorValue: afterMeasurement.numeratorValue?.toString() ?? null,
            workflowStatus: afterMeasurement.workflowStatus,
          }
        : null,
      {
        ...auditContext,
        meetingId: meeting.id,
        kpiDefinitionId: definition.id,
        schemeId: definition.schemeId,
        workflowStatus: resolvedWorkflowStatus,
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
