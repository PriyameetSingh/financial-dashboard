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
  /** Digits-only value used as Keycloak username and `User.code`. */
  phone?: string;
  department?: string | null;
  designation?: string | null;
  defaultPassword?: string;
  roleCode?: UserRole;
};

/** Keycloak username from phone: digits only (strips spaces, dashes, country code symbols). */
function usernameFromPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");
    const auditContext = getAuditRequestContext(request);
    const body = (await request.json()) as Body;

    const name = body.name?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const phone = body.phone?.trim() ?? "";
    const username = usernameFromPhone(phone);
    const department = body.department?.trim() || null;
    const designationRaw = body.designation === undefined || body.designation === null ? "" : String(body.designation).trim();
    const designation = designationRaw.slice(0, 500) || null;
    const defaultPassword = body.defaultPassword?.trim() ?? "";
    const roleCode = body.roleCode ?? UserRole.NODAL_OFFICER;

    if (!name || !email || !defaultPassword) {
      return NextResponse.json(
        { detail: "name, email, and defaultPassword are required" },
        { status: 400 },
      );
    }

    if (!designation) {
      return NextResponse.json({ detail: "designation is required" }, { status: 400 });
    }

    if (username.length < 10) {
      return NextResponse.json(
        { detail: "phone is required: enter at least 10 digits; the number (digits only) is used as the login username" },
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
          designation,
          isActive: true,
        },
        create: {
          name,
          email,
          code: username,
          department,
          designation,
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
