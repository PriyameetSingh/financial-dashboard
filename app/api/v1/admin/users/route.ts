import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { assignKeycloakClientRole, createOrFindKeycloakUser, KeycloakClientRoleNotFoundError } from "@/lib/keycloak-admin";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { UserRole } from "@/types";

export const runtime = "nodejs";

type Body = {
  name?: string;
  email?: string;
  username?: string;
  department?: string | null;
  defaultPassword?: string;
  roleCode?: UserRole;
};

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

function usernameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  return normalizeUsername(localPart);
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");
    const auditContext = getAuditRequestContext(request);
    const body = (await request.json()) as Body;

    const name = body.name?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const usernameRaw = body.username?.trim() || usernameFromEmail(email);
    const username = normalizeUsername(usernameRaw);
    const department = body.department?.trim() || null;
    const defaultPassword = body.defaultPassword?.trim() ?? "";
    const roleCode = body.roleCode ?? UserRole.VIEWER;

    if (!name || !email || !username || !defaultPassword) {
      return NextResponse.json(
        { detail: "name, email, username (or derivable email), and defaultPassword are required" },
        { status: 400 },
      );
    }

    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      return NextResponse.json({ detail: `Role not found: ${roleCode}` }, { status: 400 });
    }

    const keycloak = await createOrFindKeycloakUser({
      username,
      email,
      fullName: name,
      password: defaultPassword,
    });
    await assignKeycloakClientRole(keycloak.id, roleCode);

    const dbUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        update: {
          name,
          code: username,
          department,
          isActive: true,
        },
        create: {
          name,
          email,
          code: username,
          department,
          isActive: true,
        },
      });

      // "Set role" semantics: keep the selected role as the single primary role.
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      return user;
    });

    await logAudit(
      actor?.id,
      "rbac.user.create",
      "user",
      dbUser.id,
      null,
      {
        code: dbUser.code,
        email: dbUser.email,
        roleCode,
      },
      {
        ...auditContext,
        keycloakUserId: keycloak.id,
        keycloakCreated: keycloak.created,
      },
    );

    return NextResponse.json(
      {
        user: {
          id: dbUser.id,
          code: dbUser.code,
          name: dbUser.name,
          email: dbUser.email,
          department: dbUser.department,
          roleCode,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }

    if (error instanceof KeycloakClientRoleNotFoundError) {
      return NextResponse.json({ detail: error.message }, { status: 400 });
    }

    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ detail: "A user with this email or username already exists" }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Unable to create user";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
