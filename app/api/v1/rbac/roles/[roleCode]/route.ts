import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ roleCode: string }> }
) {
  try {
    await requireAnyPermission("MANAGE_PERMISSIONS");

    const { roleCode } = await ctx.params;
    const body = await request.json();
    const { name, code } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ detail: "Name is required" }, { status: 400 });
    }

    const data: Record<string, string> = { name };
    if (code && typeof code === "string") {
      const newCode = code.trim().toUpperCase();
      if (newCode !== roleCode) {
        const existing = await prisma.role.findUnique({ where: { code: newCode } });
        if (existing) {
          return NextResponse.json({ detail: "Role code already exists" }, { status: 409 });
        }
        data.code = newCode;
      }
    }

    const updatedRole = await prisma.role.update({
      where: { code: roleCode },
      data,
    });

    return NextResponse.json({
      role: {
        code: updatedRole.code,
        name: updatedRole.name,
      },
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    const message = error instanceof Error ? error.message : "Unable to update role";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
