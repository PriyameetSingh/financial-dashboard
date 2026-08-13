import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { isValidAssignment, mapSchemeView, parseSponsorshipType } from "@/lib/scheme-api";
import { requireAnyPermission, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

type AssignmentInput = {
  id?: string;
  assignmentKind: "dashboard_owner" | "kpi_owner_1" | "kpi_owner_2" | "action_item_owner_1" | "action_item_owner_2";
  sortOrder?: number;
  subschemeId?: string | null;
  userId?: string | null;
  roleId?: string | null;
};

type Body = {
  code?: string;
  name?: string;
  verticalName?: string;
  sponsorshipType?: "STATE" | "CENTRAL" | "CENTRAL_SECTOR" | "NON_FINANCIAL";
  assignments?: AssignmentInput[];
  archived?: boolean;
};

export const runtime = "nodejs";

function getPrismaErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

async function loadScheme(id: string) {
  return prisma.scheme.findUnique({
    where: { id },
    include: {
      subschemes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      assignments: {
        orderBy: [{ assignmentKind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          user: { select: { id: true, name: true } },
          role: { select: { id: true, code: true } },
        },
      },
    },
  });
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const { id } = await ctx.params;
    const scheme = await loadScheme(id);
    if (!scheme) {
      return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
    }

    return NextResponse.json({ scheme: mapSchemeView(scheme) });
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
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const body = (await request.json()) as Body;
    const auditContext = getAuditRequestContext(request);

    const before = await loadScheme(id);
    if (!before) {
      return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
    }

    const sponsorshipType = body.sponsorshipType ? parseSponsorshipType(body.sponsorshipType) : undefined;
    if (body.sponsorshipType && !sponsorshipType) {
      return NextResponse.json({ detail: "Invalid sponsorshipType" }, { status: 400 });
    }
    if (body.verticalName !== undefined && !body.verticalName.trim()) {
      return NextResponse.json({ detail: "verticalName cannot be empty" }, { status: 400 });
    }

    const after = await prisma.$transaction(async (tx) => {
      await tx.scheme.update({
        where: { id },
        data: {
          code: body.code?.trim().toUpperCase(),
          name: body.name?.trim(),
          verticalName: body.verticalName?.trim(),
          ...(sponsorshipType !== undefined && sponsorshipType !== null ? { sponsorshipType } : {}),
          ...(body.archived !== undefined ? { archived: body.archived } : {}),
        },
      });

      if (body.assignments) {
        await tx.schemeAssignment.deleteMany({ where: { schemeId: id } });
        const rows = body.assignments
          .filter(isValidAssignment)
          .map((assignment) => ({
            schemeId: id,
            assignmentKind: assignment.assignmentKind,
            sortOrder: assignment.sortOrder ?? 0,
            subschemeId: assignment.subschemeId ?? null,
            userId: assignment.userId ?? null,
            roleId: assignment.roleId ?? null,
          }));

        if (rows.length > 0) {
          await tx.schemeAssignment.createMany({ data: rows });
        }
      }

      const after = await tx.scheme.findUniqueOrThrow({
        where: { id },
        include: {
          subschemes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
          assignments: {
            orderBy: [{ assignmentKind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              user: { select: { id: true, name: true } },
              role: { select: { id: true, code: true } },
            },
          },
        },
      });

      await logAudit(
        tx,
        actor?.id,
        "scheme.update",
        "scheme",
        id,
        mapSchemeView(before),
        mapSchemeView(after),
        { ...auditContext, schemeId: id },
      );

      return after;
    });

    return NextResponse.json({ scheme: mapSchemeView(after) });
  } catch (error: unknown) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (getPrismaErrorCode(error) === "P2002") {
      return NextResponse.json({ detail: "Scheme code already exists" }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const auditContext = getAuditRequestContext(request);

    const before = await loadScheme(id);
    if (!before) {
      return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.schemeAssignment.deleteMany({ where: { schemeId: id } });
      await tx.kpiDefinition.deleteMany({ where: { schemeId: id } });
      await tx.subscheme.deleteMany({ where: { schemeId: id } });
      await tx.scheme.delete({ where: { id } });

      // Shift sortOrder of remaining schemes with higher indices down by 1
      await tx.scheme.updateMany({
        where: {
          sortOrder: { gt: before.sortOrder },
        },
        data: {
          sortOrder: { decrement: 1 },
        },
      });

      await logAudit(
        tx,
        actor?.id,
        "scheme.delete",
        "scheme",
        id,
        mapSchemeView(before),
        null,
        { ...auditContext, schemeId: id },
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
