import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { getAuditRequestContext, logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_PERMISSIONS");
    const { id } = await ctx.params;
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim() ?? "";

    if (!name) {
      return NextResponse.json({ detail: "name cannot be empty" }, { status: 400 });
    }

    const existing = await prisma.section.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!existing) {
      return NextResponse.json({ detail: "Section not found" }, { status: 404 });
    }

    const auditContext = getAuditRequestContext(request);

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.section.update({
        where: { id },
        data: { name },
        select: { id: true, name: true },
      });

      await logAudit(
        tx,
        actor?.id ?? null,
        "UPDATE",
        "Section",
        updated.id,
        { name: existing.name },
        { name: updated.name },
        auditContext
      );

      return updated;
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ detail: "A section with this name already exists" }, { status: 409 });
    }
    throw error;
  }
}
