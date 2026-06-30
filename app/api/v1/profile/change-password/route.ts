import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/server-auth";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import {
  verifyKeycloakUserPassword,
  findKeycloakUserIdByIdentity,
  setKeycloakUserPassword,
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

    // Check password
    const username = dbUser.code;
    if (!username) {
      return NextResponse.json({ detail: "User username code is missing" }, { status: 400 });
    }

    const isCurrentPasswordValid = await verifyKeycloakUserPassword(username, currentPassword);
    if (!isCurrentPasswordValid) {
      return NextResponse.json({ detail: "Incorrect current password" }, { status: 400 });
    }

    // Get keycloak user id
    const keycloakUserId = await findKeycloakUserIdByIdentity({ username: dbUser.code, email: dbUser.email });
    if (!keycloakUserId) {
      return NextResponse.json({ detail: "Keycloak user profile not found" }, { status: 404 });
    }

    // Set new password
    await setKeycloakUserPassword(keycloakUserId, newPassword, false);

    // Audit log
    const auditContext = getAuditRequestContext(request);
    await logAudit(
      dbUser.id,
      "rbac.user.password.change",
      "user",
      dbUser.id,
      null,
      { temporary: false },
      { ...auditContext, targetUserCode: dbUser.code }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to change password";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
