import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { assertKpiUpdaterForDefinition, userRoleIdsFromDbUser } from "@/lib/kpi-access";
import { hasPermissionForUser, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type Body = {
  kpiDefinitionId: string;
  financialYearLabel: string;
  measuredAt: string;
  numeratorValue?: number | null;
  yesValue?: boolean | null;
  denominatorValue?: number | null;
  remarks?: string;
  workflowStatus?: "draft" | "submitted";
};

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermissionAndDbUser("ENTER_KPI_DATA");

    const body = (await request.json()) as Body;

    const definition = await prisma.kpiDefinition.findUnique({
      where: { id: body.kpiDefinitionId },
      include: { performers: { select: { userId: true } } },
    });
    if (!definition) {
      return NextResponse.json({ detail: "KPI definition not found" }, { status: 404 });
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

    if (existingMeasurement) {
      await prisma.kpiMeasurement.update({
        where: { id: existingMeasurement.id },
        data: {
          numeratorValue: body.numeratorValue ?? null,
          yesValue: body.yesValue ?? null,
          workflowStatus: body.workflowStatus ?? "submitted",
          progressStatus: "on_track",
          remarks: body.remarks,
          createdById: actor.id,
        },
      });
    } else {
      await prisma.kpiMeasurement.create({
        data: {
          kpiTargetId: target.id,
          measuredAt,
          numeratorValue: body.numeratorValue ?? null,
          yesValue: body.yesValue ?? null,
          workflowStatus: body.workflowStatus ?? "submitted",
          progressStatus: "on_track",
          remarks: body.remarks,
          createdById: actor.id,
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
        kpiDefinitionId: definition.id,
        schemeId: definition.schemeId,
        workflowStatus: body.workflowStatus ?? "submitted",
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
