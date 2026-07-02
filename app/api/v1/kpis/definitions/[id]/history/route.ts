import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}

function mapWorkflowStatus(status: string): "draft" | "submitted_pending" | "approved" | "rejected" {
  if (status === "reviewed") return "approved";
  if (status === "submitted") return "submitted_pending";
  if (status === "rejected") return "rejected";
  return "draft";
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    throw error;
  }

  const { id } = await ctx.params;

  const definition = await prisma.kpiDefinition.findUnique({
    where: { id },
    include: {
      scheme: { select: { name: true, verticalName: true } },
      targets: {
        include: {
          financialYear: true,
          measurements: {
            orderBy: { measuredAt: "desc" },
            include: {
              createdBy: { select: { id: true, name: true } },
              reviewedBy: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { financialYear: { endDate: "desc" } },
      },
    },
  });

  if (!definition) {
    return NextResponse.json({ detail: "KPI definition not found" }, { status: 404 });
  }

  const measurements = definition.targets.flatMap((target) =>
    target.measurements.map((m) => ({
      id: m.id,
      financialYear: target.financialYear.label,
      measuredAt: m.measuredAt.toISOString().slice(0, 10),
      numeratorValue: toNumber(m.numeratorValue),
      yesValue: m.yesValue,
      denominatorValue: toNumber(target.denominatorValue),
      workflowStatus: mapWorkflowStatus(m.workflowStatus),
      remarks: m.remarks ?? null,
      bottleneckReason: m.bottleneckReason ?? null,
      escalationFlag: m.escalationFlag ?? null,
      submittedBy: m.createdBy?.name ?? null,
      reviewedBy: m.reviewedBy?.name ?? null,
      reviewedAt: m.reviewedAt ? m.reviewedAt.toISOString().slice(0, 10) : null,
      reviewNote: m.reviewNote ?? null,
    })),
  );

  return NextResponse.json({
    kpi: {
      id: definition.id,
      description: definition.description,
      type: definition.kpiType,
      category: definition.category,
      unit: definition.numeratorUnit ?? definition.denominatorUnit ?? "value",
      numeratorUnit: definition.numeratorUnit,
      denominatorUnit: definition.denominatorUnit,
      scheme: definition.scheme.name,
      vertical: definition.scheme.verticalName,
    },
    measurements,
  });
}
