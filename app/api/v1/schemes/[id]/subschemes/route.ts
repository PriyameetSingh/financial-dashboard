import { NextRequest, NextResponse } from "next/server";
import { prisma, tenantStamped } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

function getPrismaErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

type Body = {
  code: string;
  name: string;
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const body = (await request.json()) as Body;

    const code = body.code?.trim().toUpperCase();
    const name = body.name?.trim();
    if (!code || !name) {
      return NextResponse.json({ detail: "code and name are required" }, { status: 400 });
    }

    const scheme = await prisma.scheme.findUnique({ where: { id }, select: { id: true, code: true } });
    if (!scheme) {
      return NextResponse.json({ detail: "Scheme not found" }, { status: 404 });
    }
    const auditContext = getAuditRequestContext(request);

    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.subscheme.create({
        data: tenantStamped({
          schemeId: id,
          code,
          name,
          createdById: actor?.id ?? null,
        }),
      });

      await logAudit(
        tx,
        actor?.id,
        "subscheme.create",
        "subscheme",
        created.id,
        null,
        { id: created.id, schemeId: created.schemeId, code: created.code, name: created.name },
        { ...auditContext, schemeId: id, schemeCode: scheme.code },
      );

      return created;
    });

    return NextResponse.json({
      subscheme: {
        id: created.id,
        schemeId: created.schemeId,
        code: created.code,
        name: created.name,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (getPrismaErrorCode(error) === "P2002") {
      return NextResponse.json({ detail: "Subscheme code already exists for this scheme" }, { status: 409 });
    }
    throw error;
  }
}
