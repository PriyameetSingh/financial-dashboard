import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/server-auth";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import {
  verifyKeycloakUserPassword,
  findKeycloakUserIdByIdentity,
  setKeycloakUserPassword,
  logoutKeycloakUser,
} from "@/lib/keycloak-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { detail: "currentPassword and newPassword are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { detail: "New password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    // Find user in DB
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { code: sessionUser.id },
          { email: sessionUser.email }
        ],
        isActive: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json({ detail: "User record not found in database" }, { status: 404 });
    }

    // Check if account is currently locked out for password changes
    if (dbUser.passwordChangeLockedUntil && new Date() < dbUser.passwordChangeLockedUntil) {
      return NextResponse.json(
        { detail: "Too many failed attempts. Password change has been locked for a day. Please contact admin to reset your password if needed." },
        { status: 403 }
      );
    }

    // Check password
    const username = dbUser.code;
    if (!username) {
      return NextResponse.json({ detail: "User username code is missing" }, { status: 400 });
    }

    const isCurrentPasswordValid = await verifyKeycloakUserPassword(username, currentPassword);
    if (!isCurrentPasswordValid) {
      // Increment failed attempts
      let failedAttempts = dbUser.passwordChangeFailedAttempts + 1;

      // If the last lockout has expired, we treat this as a fresh failure series
      if (dbUser.passwordChangeLockedUntil && new Date() >= dbUser.passwordChangeLockedUntil) {
        failedAttempts = 1;
      }

      const updates: { passwordChangeFailedAttempts: number; passwordChangeLockedUntil?: Date | null } = {
        passwordChangeFailedAttempts: failedAttempts,
      };

      if (failedAttempts >= 5) {
        // Lock for 24 hours (1 day)
        const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        updates.passwordChangeLockedUntil = lockedUntil;
      }

      await prisma.user.update({
        where: { id: dbUser.id },
        data: updates,
      });

      if (failedAttempts >= 5) {
        return NextResponse.json(
          { detail: "Too many failed attempts. Password change has been locked for a day. Please contact admin to reset your password if needed." },
          { status: 403 }
        );
      }

      const remaining = 5 - failedAttempts;
      return NextResponse.json(
        { detail: `Incorrect current password. ${remaining} attempt(s) remaining before lockout.` },
        { status: 400 }
      );
    }

    // Get keycloak user id
    const keycloakUserId = await findKeycloakUserIdByIdentity({ username: dbUser.code, email: dbUser.email });
    if (!keycloakUserId) {
      return NextResponse.json({ detail: "Keycloak user profile not found" }, { status: 404 });
    }

    // Set new password
    await setKeycloakUserPassword(keycloakUserId, newPassword, false);

    // Invalidate Keycloak sessions
    await logoutKeycloakUser(keycloakUserId);

    // Invalidate local DB sessions by setting sessionsInvalidatedAt timestamp, and reset lockout state
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        sessionsInvalidatedAt: new Date(),
        passwordChangeFailedAttempts: 0,
        passwordChangeLockedUntil: null,
      },
    });

    // Audit log
    const auditContext = getAuditRequestContext(request);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dbUser.id },
        data: {
          sessionsInvalidatedAt: new Date(),
          passwordChangeFailedAttempts: 0,
          passwordChangeLockedUntil: null,
        },
      });

      await logAudit(
        tx,
        dbUser.id,
        "rbac.user.password.change",
        "user",
        dbUser.id,
        null,
        { temporary: false },
        { ...auditContext, targetUserCode: dbUser.code }
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to change password";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
