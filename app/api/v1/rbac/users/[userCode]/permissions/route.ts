import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type Body = {
  permissionCode: string;
  effect: "allow" | "deny" | "unset";
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ userCode: string }> }) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_PERMISSIONS");
    const auditContext = getAuditRequestContext(request);
    const { userCode } = await ctx.params;
    const body = (await request.json()) as Body;

    const user = await prisma.user.findFirst({ where: { code: userCode } });
    if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });

    const perm = await prisma.permission.findUnique({ where: { code: body.permissionCode } });
    if (!perm) return NextResponse.json({ detail: "Permission not found" }, { status: 404 });

    if (body.effect === "unset") {
      await prisma.$transaction(async (tx) => {
        await tx.userPermissionOverride
          .delete({ where: { userId_permissionId: { userId: user.id, permissionId: perm.id } } })
          .catch(() => null);
        await logAudit(
          tx,
          actor?.id,
          "rbac.permission.unset",
          "user_permission_override",
          user.id,
          { permissionCode: body.permissionCode },
          null,
          { ...auditContext, targetUserCode: userCode },
        );
      });
      return NextResponse.json({ ok: true });
    }

    const effect = body.effect;
    await prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId: user.id, permissionId: perm.id } },
        update: { effect, createdById: actor?.id ?? null },
        create: { userId: user.id, permissionId: perm.id, effect, createdById: actor?.id ?? null },
      });

      await logAudit(
        tx,
        actor?.id,
        "rbac.permission.override",
        "user_permission_override",
        user.id,
        null,
        { permissionCode: body.permissionCode, effect },
        { ...auditContext, targetUserCode: userCode },
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
