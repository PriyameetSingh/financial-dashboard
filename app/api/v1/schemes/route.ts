import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { isValidAssignment, mapSchemeView, parseSponsorshipType } from "@/lib/scheme-api";
import { requireAnyPermission, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

function getPrismaErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

type AssignmentInput = {
  assignmentKind: "dashboard_owner" | "kpi_owner_1" | "kpi_owner_2" | "action_item_owner_1" | "action_item_owner_2";
  sortOrder?: number;
  subschemeId?: string | null;
  userId?: string | null;
  roleId?: string | null;
};

type Body = {
  code: string;
  name: string;
  verticalName: string;
  sponsorshipType: "STATE" | "CENTRAL" | "CENTRAL_SECTOR";
  subschemes?: Array<{ code: string; name: string }>;
  assignments?: AssignmentInput[];
};

async function getReferenceData() {
  const [roles, users] = await Promise.all([
    prisma.role.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, email: true } }),
  ]);
  return { roles, users };
}

export async function GET() {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const [schemes, reference] = await Promise.all([
      prisma.scheme.findMany({
        include: {
          subschemes: { orderBy: { name: "asc" } },
          assignments: {
            orderBy: [{ assignmentKind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              user: { select: { id: true, name: true } },
              role: { select: { id: true, code: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      getReferenceData(),
    ]);

    return NextResponse.json({
      schemes: schemes.map(mapSchemeView),
      reference,
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const body = (await request.json()) as Body;
    const code = body.code?.trim().toUpperCase();
    const name = body.name?.trim();
    const verticalName = body.verticalName?.trim();
    const sponsorshipType = parseSponsorshipType(body.sponsorshipType);

    if (!code || !name || !verticalName || !sponsorshipType) {
      return NextResponse.json({ detail: "code, name, verticalName, and sponsorshipType are required" }, { status: 400 });
    }
    const auditContext = getAuditRequestContext(request);

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const scheme = await tx.scheme.create({
        data: {
          code,
          name,
          verticalName,
          sponsorshipType,
          createdById: actor?.id ?? null,
        },
      });

      if (body.subschemes?.length) {
        await tx.subscheme.createMany({
          data: body.subschemes
            .map((item) => ({ code: item.code.trim().toUpperCase(), name: item.name.trim() }))
            .filter((item) => item.code && item.name)
            .map((item) => ({
              schemeId: scheme.id,
              code: item.code,
              name: item.name,
              createdById: actor?.id ?? null,
            })),
        });
      }

      if (body.assignments?.length) {
        await tx.schemeAssignment.createMany({
          data: body.assignments
            .filter(isValidAssignment)
            .map((assignment) => ({
              schemeId: scheme.id,
              subschemeId: assignment.subschemeId ?? null,
              assignmentKind: assignment.assignmentKind,
              userId: assignment.userId ?? null,
              roleId: assignment.roleId ?? null,
              sortOrder: assignment.sortOrder ?? 0,
            })),
        });
      }

      return tx.scheme.findUniqueOrThrow({
        where: { id: scheme.id },
        include: {
          subschemes: { orderBy: { name: "asc" } },
          assignments: {
            orderBy: [{ assignmentKind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              user: { select: { id: true, name: true } },
              role: { select: { id: true, code: true } },
            },
          },
        },
      });
    });

    await logAudit(
      actor?.id,
      "scheme.create",
      "scheme",
      created.id,
      null,
      mapSchemeView(created),
      { ...auditContext, schemeId: created.id },
    );

    return NextResponse.json({ scheme: mapSchemeView(created) }, { status: 201 });
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
