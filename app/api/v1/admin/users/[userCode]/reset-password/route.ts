import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { findKeycloakUserIdByIdentity, setKeycloakUserPassword, logoutKeycloakUser } from "@/lib/keycloak-admin";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ userCode: string }> }
) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_USERS");
    const { userCode } = await ctx.params;
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ detail: "password is required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { detail: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findFirst({
      where: { code: userCode, isActive: true },
    });

    if (!targetUser) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const keycloakUserId = await findKeycloakUserIdByIdentity({
      username: targetUser.code,
      email: targetUser.email,
    });

    if (!keycloakUserId) {
      return NextResponse.json({ detail: "Keycloak user profile not found" }, { status: 404 });
    }

    // Set new password (temporary: true so they are forced to change it on next login)
    await setKeycloakUserPassword(keycloakUserId, password, true);

    // Invalidate Keycloak sessions
    await logoutKeycloakUser(keycloakUserId);

    // Invalidate local DB sessions by setting sessionsInvalidatedAt timestamp, and reset password lockout counters
    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        sessionsInvalidatedAt: new Date(),
        passwordChangeFailedAttempts: 0,
        passwordChangeLockedUntil: null,
      },
    });

    const auditContext = getAuditRequestContext(request);
    await logAudit(
      actor?.id,
      "rbac.user.password.reset",
      "user",
      targetUser.id,
      null,
      { temporary: true },
      { ...auditContext, targetUserCode: userCode }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    const message = error instanceof Error ? error.message : "Unable to reset user password";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
