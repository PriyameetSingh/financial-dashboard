import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import {
  deleteKeycloakUserById,
  findKeycloakUserIdByIdentity,
  KeycloakClientRoleNotFoundError,
  replaceKeycloakClientRole,
} from "@/lib/keycloak-admin";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { UserRole } from "@/types";

export const runtime = "nodejs";

type PatchBody = {
  roleCode?: UserRole;
};

function tombstoneValue(seed: string, id: string): string {
  return `${seed}-${id.slice(0, 8)}-${Date.now()}`;
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ userCode: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");
    const auditContext = getAuditRequestContext(request);
    const { userCode } = await ctx.params;
    const body = (await request.json()) as PatchBody;

    const roleCode = body.roleCode;
    if (!roleCode) {
      return NextResponse.json({ detail: "roleCode is required" }, { status: 400 });
    }

    const [user, role] = await Promise.all([
      prisma.user.findFirst({
        where: { code: userCode, isActive: true },
        select: { id: true, code: true, email: true, name: true, userRoles: { include: { role: true } } },
      }),
      prisma.role.findUnique({ where: { code: roleCode } }),
    ]);

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }
    if (!role) {
      return NextResponse.json({ detail: `Role not found: ${roleCode}` }, { status: 400 });
    }

    const previousRoleCodes = user.userRoles.map((entry) => entry.role.code);

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    });

    const keycloakUserId = await findKeycloakUserIdByIdentity({ username: user.code, email: user.email });
    if (keycloakUserId) {
      await replaceKeycloakClientRole(keycloakUserId, roleCode);
    }

    await logAudit(
      actor?.id,
      "rbac.user.role.update",
      "user",
      user.id,
      { roleCodes: previousRoleCodes },
      { roleCodes: [roleCode], keycloakUserId: keycloakUserId ?? null },
      { ...auditContext, targetUserCode: user.code ?? userCode },
    );

    return NextResponse.json({ ok: true, roleCode, keycloakSynced: Boolean(keycloakUserId) });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error instanceof KeycloakClientRoleNotFoundError) {
      return NextResponse.json({ detail: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to update user role";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ userCode: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");
    const auditContext = getAuditRequestContext(request);
    const { userCode } = await ctx.params;

    const user = await prisma.user.findFirst({
      where: { code: userCode, isActive: true },
      select: { id: true, code: true, email: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }
    if (actor?.id && actor.id === user.id) {
      return NextResponse.json({ detail: "You cannot delete your own account." }, { status: 400 });
    }

    const keycloakUserId = await findKeycloakUserIdByIdentity({ username: user.code, email: user.email });
    if (keycloakUserId) {
      await deleteKeycloakUserById(keycloakUserId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userPermissionOverride.deleteMany({ where: { userId: user.id } });
      await tx.schemeAssignment.updateMany({ where: { userId: user.id }, data: { userId: null } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          isActive: false,
          code: tombstoneValue("deleted-user", user.id),
          email: `${tombstoneValue("deleted", user.id)}@local.invalid`,
          name: `${user.name} (Deleted)`,
          department: null,
        },
      });
    });

    await logAudit(
      actor?.id,
      "rbac.user.delete",
      "user",
      user.id,
      { code: user.code, email: user.email, name: user.name },
      { keycloakUserId: keycloakUserId ?? null, isActive: false },
      { ...auditContext, targetUserCode: user.code ?? userCode },
    );

    return NextResponse.json({ ok: true, keycloakSynced: Boolean(keycloakUserId) });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    const message = error instanceof Error ? error.message : "Unable to delete user";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
