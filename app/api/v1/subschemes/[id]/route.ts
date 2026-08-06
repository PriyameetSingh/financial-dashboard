import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  code?: string;
  name?: string;
  sortOrder?: number;
};

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const body = (await request.json()) as Body;
    const auditContext = getAuditRequestContext(request);

    const before = await prisma.subscheme.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ detail: "Subscheme not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.subscheme.update({
        where: { id },
        data: {
          code: body.code?.trim().toUpperCase(),
          name: body.name?.trim(),
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
        },
      });

      await logAudit(
        tx,
        actor?.id,
        "subscheme.update",
        "subscheme",
        id,
        { id: before.id, schemeId: before.schemeId, code: before.code, name: before.name, sortOrder: before.sortOrder },
        { id: updated.id, schemeId: updated.schemeId, code: updated.code, name: updated.name, sortOrder: updated.sortOrder },
        { ...auditContext, schemeId: updated.schemeId },
      );

      return updated;
    });

    return NextResponse.json({
      subscheme: {
        id: updated.id,
        schemeId: updated.schemeId,
        code: updated.code,
        name: updated.name,
      },
    });
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

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_SCHEMES");

    const { id } = await ctx.params;
    const auditContext = getAuditRequestContext(request);

    const before = await prisma.subscheme.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ detail: "Subscheme not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.subscheme.delete({ where: { id } });

      await logAudit(
        tx,
        actor?.id,
        "subscheme.delete",
        "subscheme",
        id,
        { id: before.id, schemeId: before.schemeId, code: before.code, name: before.name },
        null,
        { ...auditContext, schemeId: before.schemeId },
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
