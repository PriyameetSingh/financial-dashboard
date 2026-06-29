import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { getAuditRequestContext, logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_PERMISSIONS");
    const { id } = await ctx.params;
    const body = (await request.json()) as { code?: string; name?: string };

    const existing = await prisma.vertical.findUnique({
      where: { id },
      select: { id: true, code: true, name: true },
    });

    if (!existing) {
      return NextResponse.json({ detail: "Vertical not found" }, { status: 404 });
    }

    const code = body.code !== undefined ? body.code.trim() : existing.code;
    const name = body.name !== undefined ? body.name.trim() : existing.name;

    if (!code) {
      return NextResponse.json({ detail: "code cannot be empty" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ detail: "name cannot be empty" }, { status: 400 });
    }

    const auditContext = getAuditRequestContext(request);

    const updated = await prisma.vertical.update({
      where: { id },
      data: { code, name },
      select: { id: true, code: true, name: true },
    });

    await logAudit(
      actor?.id ?? null,
      "UPDATE",
      "Vertical",
      updated.id,
      { code: existing.code, name: existing.name },
      { code: updated.code, name: updated.name },
      auditContext
    );

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ detail: "A vertical with this code already exists" }, { status: 409 });
    }
    throw error;
  }
}
