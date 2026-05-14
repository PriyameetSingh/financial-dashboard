import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAnyPermission("MANAGE_USERS", "MANAGE_PERMISSIONS");

    const roles = await prisma.role.findMany({
      orderBy: { code: "asc" },
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });

    return NextResponse.json({
      roles: roles.map((role: (typeof roles)[number]) => ({
        code: role.code,
        name: role.name,
        permissions: role.rolePermissions.map((rp: any) => rp.permission.code as string),
      })),
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
