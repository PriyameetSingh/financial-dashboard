import { NextRequest, NextResponse } from "next/server";
import { OfficerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { assignKeycloakClientRole, createOrFindKeycloakUser, KeycloakClientRoleNotFoundError } from "@/lib/keycloak-admin";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { UserRole } from "@/types";

export const runtime = "nodejs";

const OFFICER_TYPE_VALUES = new Set<string>(Object.values(OfficerType));

type Body = {
  name?: string;
  email?: string;
  /** Digits-only value used as Keycloak username and `User.code`. */
  phone?: string;
  department?: string | null;
  /** UUID foreign key to Designation table */
  designationId?: string;
  /** UUID foreign key to Organisation table (legacy single organisation) */
  organisationId?: string | null;
  /** Array of organisation UUIDs to associate with user (new multi-select) */
  organisationIds?: string[];
  /** UUID foreign key to Ulb table */
  ulbId?: string | null;
  /** Array of section UUIDs to associate with user */
  sectionIds?: string[];
  /** `GOVERNMENT` or `PMU` (case-insensitive). */
  officerType?: string | null;
  defaultPassword?: string;
  roleCode?: UserRole;
};

function trimToNull(raw: string | null | undefined, maxLen: number): string | null {
  const t = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!t) return null;
  return t.slice(0, maxLen) || null;
}

function parseOfficerType(raw: unknown): OfficerType | null {
  if (raw === undefined || raw === null) return null;
  const upper = String(raw).trim().toUpperCase();
  if (!OFFICER_TYPE_VALUES.has(upper)) return null;
  return upper as OfficerType;
}

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
    const designationId = body.designationId?.trim() || null;
    const organisationId = body.organisationId?.trim() || null;
    const organisationIds = Array.isArray(body.organisationIds) ? body.organisationIds.filter((id) => typeof id === "string" && id.trim()) : [];
    const ulbId = body.ulbId?.trim() || null;
    const sectionIds = Array.isArray(body.sectionIds) ? body.sectionIds.filter((id) => typeof id === "string" && id.trim()) : [];
    const officerType = parseOfficerType(body.officerType);
    const defaultPassword = body.defaultPassword?.trim() ?? "";
    const roleCode = body.roleCode ?? UserRole.NODAL_OFFICER;

    if (!name || !email || !defaultPassword) {
      return NextResponse.json(
        { detail: "name, email, and defaultPassword are required" },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { detail: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    if (username.length !== 10) {
      return NextResponse.json(
        { detail: "Phone number is required: exactly 10 digits." },
        { status: 400 },
      );
    }

    const phoneRegex = /^[+\-() \s\d]+$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { detail: "phone contains invalid characters: only digits, spaces, and +, -, (, ) are allowed" },
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
          designationId,
          organisationId,
          ulbId,
          officerType,
          isActive: true,
        },
        create: {
          name,
          email,
          code: username,
          department,
          designationId,
          organisationId,
          ulbId,
          officerType,
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

      // Handle section associations via UserSection join table
      await tx.userSection.deleteMany({ where: { userId: user.id } });
      if (sectionIds.length > 0) {
        await tx.userSection.createMany({
          data: sectionIds.map((sectionId) => ({
            userId: user.id,
            sectionId,
          })),
          skipDuplicates: true,
        });
      }

      // Handle organisation associations via UserOrganisation join table
      await tx.userOrganisation.deleteMany({ where: { userId: user.id } });
      if (organisationIds.length > 0) {
        await tx.userOrganisation.createMany({
          data: organisationIds.map((organisationId) => ({
            userId: user.id,
            organisationId,
          })),
          skipDuplicates: true,
        });
      }

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
        designationId: dbUser.designationId,
        organisationId: dbUser.organisationId,
        organisationIds,
        ulbId: dbUser.ulbId,
        sectionIds,
        officerType: dbUser.officerType,
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
          designationId: dbUser.designationId,
          organisationId: dbUser.organisationId,
          organisationIds,
          ulbId: dbUser.ulbId,
          sectionIds,
          officerType: dbUser.officerType,
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
