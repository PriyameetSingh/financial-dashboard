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
  /** Job title / post; empty string stored as null */
  designation?: string | null;
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

    if (body.roleCode === undefined && body.designation === undefined) {
      return NextResponse.json({ detail: "Provide roleCode and/or designation" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { code: userCode, isActive: true },
      select: { id: true, code: true, email: true, name: true, designation: true, userRoles: { include: { role: true } } },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const previousRoleCodes = user.userRoles.map((entry) => entry.role.code);

    if (body.designation !== undefined) {
      const next =
        body.designation === null || body.designation === ""
          ? null
          : String(body.designation).trim().slice(0, 500) || null;
      await prisma.user.update({
        where: { id: user.id },
        data: { designation: next },
      });
      await logAudit(
        actor?.id,
        "rbac.user.designation.update",
        "user",
        user.id,
        { designation: user.designation },
        { designation: next },
        { ...auditContext, targetUserCode: user.code ?? userCode },
      );
    }

    if (body.roleCode !== undefined) {
      const role = await prisma.role.findUnique({ where: { code: body.roleCode } });
      if (!role) {
        return NextResponse.json({ detail: `Role not found: ${body.roleCode}` }, { status: 400 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      });

      const keycloakUserId = await findKeycloakUserIdByIdentity({ username: user.code, email: user.email });
      if (keycloakUserId) {
        await replaceKeycloakClientRole(keycloakUserId, body.roleCode);
      }

      await logAudit(
        actor?.id,
        "rbac.user.role.update",
        "user",
        user.id,
        { roleCodes: previousRoleCodes },
        { roleCodes: [body.roleCode], keycloakUserId: keycloakUserId ?? null },
        { ...auditContext, targetUserCode: user.code ?? userCode },
      );

      return NextResponse.json({
        ok: true,
        roleCode: body.roleCode,
        keycloakSynced: Boolean(keycloakUserId),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error instanceof KeycloakClientRoleNotFoundError) {
      return NextResponse.json({ detail: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to update user";
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
          designation: null,
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
