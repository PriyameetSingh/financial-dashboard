import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type Body = {
  permissionCode: string;
  granted: boolean;
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ roleCode: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_PERMISSIONS");
    const auditContext = getAuditRequestContext(request);
    const { roleCode } = await ctx.params;
    const body = (await request.json()) as Body;

    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) return NextResponse.json({ detail: "Role not found" }, { status: 404 });

    const perm = await prisma.permission.findUnique({ where: { code: body.permissionCode } });
    if (!perm) return NextResponse.json({ detail: "Permission not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      if (body.granted) {
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      } else {
        await tx.rolePermission
          .delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } } })
          .catch(() => null);
      }

      await logAudit(
        tx,
        actor?.id,
        "rbac.role.permission",
        "role_permission",
        role.id,
        null,
        { roleCode, permissionCode: body.permissionCode, granted: body.granted },
        { ...auditContext, roleCode },
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
