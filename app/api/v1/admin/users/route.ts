import { NextRequest, NextResponse } from "next/server";
import { OfficerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { assignKeycloakClientRole, createOrFindKeycloakUser, deleteKeycloakUserById, KeycloakClientRoleNotFoundError } from "@/lib/keycloak-admin";
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

    const role = await prisma.role.findFirst({ where: { code: roleCode } });
    if (!role) {
      return NextResponse.json({ detail: `Role not found: ${roleCode}` }, { status: 400 });
    }

    // Validate email uniqueness
    const existingUserByEmail = await prisma.user.findFirst({
      where: { email },
    });
    if (existingUserByEmail) {
      return NextResponse.json(
        { detail: "Email address already exists." },
        { status: 400 },
      );
    }

    // Validate phone number (code) uniqueness
    const existingUserByCode = await prisma.user.findFirst({
      where: { code: username },
    });
    if (existingUserByCode) {
      return NextResponse.json(
        { detail: "Phone number is already registered." },
        { status: 400 },
      );
    }

    const keycloak = await createOrFindKeycloakUser({
      username,
      email,
      fullName: name,
      password: defaultPassword,
    });
    await assignKeycloakClientRole(keycloak.id, roleCode);

    // Keycloak user is created BEFORE the Prisma transaction. A DB failure here
    // would orphan a Keycloak user with no DB record. We cannot make this atomic
    // across two systems with a single DB transaction, so on transaction failure
    // we run a COMPENSATING action: if we created a fresh Keycloak user, delete it.
    // (If `keycloak.created === false`, the user pre-existed and we only added a
    // client-role mapping we cannot safely revert without knowing prior roles —
    // see residual failure modes in the fix summary.)
    let dbUser;
    try {
      dbUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
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
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
          },
        });

        // Handle section associations via UserSection join table
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
        if (organisationIds.length > 0) {
          await tx.userOrganisation.createMany({
            data: organisationIds.map((organisationId) => ({
              userId: user.id,
              organisationId,
            })),
            skipDuplicates: true,
          });
        }

        await logAudit(
          tx,
          actor?.id,
          "rbac.user.create",
          "user",
          user.id,
          null,
          {
            code: user.code,
            email: user.email,
            roleCode,
            designationId: user.designationId,
            organisationId: user.organisationId,
            organisationIds,
            ulbId: user.ulbId,
            sectionIds,
            officerType: user.officerType,
          },
          {
            ...auditContext,
            keycloakUserId: keycloak.id,
            keycloakCreated: keycloak.created,
          },
        );

        return user;
      });
    } catch (txError) {
      if (keycloak.created) {
        try {
          await deleteKeycloakUserById(keycloak.id);
          console.error(
            `[admin.users.create] DB transaction failed; compensating Keycloak user ${keycloak.id} deleted. Original error:`,
            txError,
          );
        } catch (compensationError) {
          // Compensation itself failed — surface loudly, never swallow.
          console.error(
            `[admin.users.create] COMPENSATION FAILED: could not delete orphan Keycloak user ${keycloak.id}. Manual cleanup required. Original error:`,
            txError,
            "Compensation error:",
            compensationError,
          );
          return NextResponse.json(
            {
              detail: `User creation failed and Keycloak compensation also failed: orphan Keycloak user ${keycloak.id} requires manual cleanup.`,
            },
            { status: 500 },
          );
        }
      } else {
        console.error(
          `[admin.users.create] DB transaction failed for pre-existing Keycloak user ${keycloak.id}; client-role assignment could not be reverted automatically. Original error:`,
          txError,
        );
      }
      throw txError;
    }

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
