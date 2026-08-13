import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

async function loadKpi(id: string) {
  return prisma.kpiDefinition.findUnique({
    where: { id },
    include: {
      scheme: { select: { id: true, code: true, name: true } },
      performers: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
      reviewerUsers: {
        orderBy: { sortOrder: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const auditContext = getAuditRequestContext(request);

    const before = await loadKpi(id);
    if (!before) {
      return NextResponse.json({ detail: "KPI not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.kpiDefinitionPerformer.deleteMany({ where: { kpiDefinitionId: id } });
      await tx.kpiDefinitionReviewerUser.deleteMany({ where: { kpiDefinitionId: id } });
      await tx.kpiTarget.deleteMany({ where: { kpiDefinitionId: id } });
      await tx.kpiDefinition.delete({ where: { id } });

      await logAudit(
        tx,
        actor?.id,
        "kpi_definition.delete",
        "kpi_definition",
        id,
        {
          description: before.description,
          category: before.category,
          kpiType: before.kpiType,
          monitoringLevel: before.monitoringLevel,
          schemeId: before.schemeId,
          subschemeId: before.subschemeId,
        },
        null,
        { ...auditContext, schemeId: before.schemeId, schemeCode: before.scheme.code },
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
