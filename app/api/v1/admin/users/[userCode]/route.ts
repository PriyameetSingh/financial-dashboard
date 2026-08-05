import { NextRequest, NextResponse } from "next/server";
import { OfficerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import {
  deleteKeycloakUserById,
  findKeycloakUserIdByIdentity,
  KeycloakClientRoleNotFoundError,
  replaceKeycloakClientRole,
  updateKeycloakUserProfile,
} from "@/lib/keycloak-admin";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { UserRole } from "@/types";

export const runtime = "nodejs";

const OFFICER_TYPE_VALUES = new Set<string>(Object.values(OfficerType));

type PatchBody = {
  roleCode?: UserRole;
  name?: string;
  email?: string;
  department?: string | null;
  /** UUID foreign key to Designation table */
  designationId?: string | null;
  /** UUID foreign key to Organisation table (legacy single organisation) */
  organisationId?: string | null;
  /** Array of organisation UUIDs to associate with user (new multi-select) */
  organisationIds?: string[];
  /** UUID foreign key to Ulb table */
  ulbId?: string | null;
  /** Array of section UUIDs to associate with user */
  sectionIds?: string[];
  officerType?: string | null;
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

function tombstoneValue(seed: string, id: string): string {
  return `${seed}-${id.slice(0, 8)}-${Date.now()}`;
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ userCode: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");
    const auditContext = getAuditRequestContext(request);
    const { userCode } = await ctx.params;
    const body = (await request.json()) as PatchBody;

    const hasProfileFields =
      body.name !== undefined ||
      body.email !== undefined ||
      body.department !== undefined ||
      body.officerType !== undefined ||
      body.designationId !== undefined ||
      body.organisationId !== undefined ||
      body.organisationIds !== undefined ||
      body.ulbId !== undefined ||
      body.sectionIds !== undefined;

    if (body.roleCode === undefined && !hasProfileFields) {
      return NextResponse.json(
        { detail: "Provide roleCode, designationId, and/or profile fields (name, email, department, …)" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findFirst({
      where: { code: userCode, isActive: true },
      select: {
        id: true,
        code: true,
        email: true,
        name: true,
        department: true,
        designationId: true,
        organisationId: true,
        ulbId: true,
        officerType: true,
        userRoles: { include: { role: true } },
        userSections: { select: { sectionId: true } },
        userOrganisations: { select: { organisationId: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const previousRoleCodes = user.userRoles.map((entry) => entry.role.code);
    const previousSectionIds = user.userSections.map((us) => us.sectionId);
    const previousOrganisationIds = user.userOrganisations.map((uo) => uo.organisationId);

    const prevProfile = {
      name: user.name,
      email: user.email,
      department: user.department,
      designationId: user.designationId,
      organisationId: user.organisationId,
      organisationIds: previousOrganisationIds,
      ulbId: user.ulbId,
      sectionIds: previousSectionIds,
      officerType: user.officerType,
    };

    const prismaData: {
      name?: string;
      email?: string;
      department?: string | null;
      designationId?: string | null;
      organisationId?: string | null;
      ulbId?: string | null;
      officerType?: OfficerType | null;
    } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 500);
      if (!name) {
        return NextResponse.json({ detail: "name cannot be empty" }, { status: 400 });
      }
      prismaData.name = name;
    }

    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase().slice(0, 500);
      if (!email) {
        return NextResponse.json({ detail: "email cannot be empty" }, { status: 400 });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ detail: "Please enter a valid email address." }, { status: 400 });
      }
      if (email !== user.email) {
        const taken = await prisma.user.findFirst({
          where: { email, id: { not: user.id } },
          select: { id: true },
        });
        if (taken) {
          return NextResponse.json({ detail: "Another user already uses this email." }, { status: 400 });
        }
      }
      prismaData.email = email;
    }

    if (body.department !== undefined) {
      prismaData.department = trimToNull(body.department ?? undefined, 500);
    }
    if (body.officerType !== undefined) {
      if (body.officerType === null || body.officerType === "") {
        prismaData.officerType = null;
      } else {
        const ot = parseOfficerType(body.officerType);
        if (!ot) {
          return NextResponse.json({ detail: "officerType must be GOVERNMENT, PMU, or null" }, { status: 400 });
        }
        prismaData.officerType = ot;
      }
    }

    if (body.designationId !== undefined) {
      prismaData.designationId = body.designationId === null || body.designationId === "" ? null : body.designationId.trim();
    }

    if (body.organisationId !== undefined) {
      prismaData.organisationId = body.organisationId === null || body.organisationId === "" ? null : body.organisationId.trim();
    }

    if (body.ulbId !== undefined) {
      prismaData.ulbId = body.ulbId === null || body.ulbId === "" ? null : body.ulbId.trim();
    }

    const shouldUpdateSections = body.sectionIds !== undefined;
    const nextSectionIds = shouldUpdateSections && Array.isArray(body.sectionIds) 
      ? body.sectionIds.filter((id) => typeof id === "string" && id.trim())
      : previousSectionIds;

    const shouldUpdateOrganisations = body.organisationIds !== undefined;
    const nextOrganisationIds = shouldUpdateOrganisations && Array.isArray(body.organisationIds)
      ? body.organisationIds.filter((id) => typeof id === "string" && id.trim())
      : previousOrganisationIds;

    const nextName = prismaData.name ?? user.name;
    const nextEmail = prismaData.email ?? user.email;

    const nextProfile = {
      name: nextName,
      email: nextEmail,
      department: prismaData.department !== undefined ? prismaData.department : user.department,
      designationId: prismaData.designationId !== undefined ? prismaData.designationId : user.designationId,
      organisationId: prismaData.organisationId !== undefined ? prismaData.organisationId : user.organisationId,
      organisationIds: nextOrganisationIds,
      ulbId: prismaData.ulbId !== undefined ? prismaData.ulbId : user.ulbId,
      sectionIds: nextSectionIds,
      officerType: prismaData.officerType !== undefined ? prismaData.officerType : user.officerType,
    };
    const sectionIdsChanged = JSON.stringify([...previousSectionIds].sort()) !== JSON.stringify([...nextSectionIds].sort());
    const organisationIdsChanged = JSON.stringify([...previousOrganisationIds].sort()) !== JSON.stringify([...nextOrganisationIds].sort());
    const profileChanged =
      prevProfile.name !== nextProfile.name ||
      prevProfile.email !== nextProfile.email ||
      prevProfile.department !== nextProfile.department ||
      prevProfile.designationId !== nextProfile.designationId ||
      prevProfile.organisationId !== nextProfile.organisationId ||
      organisationIdsChanged ||
      prevProfile.ulbId !== nextProfile.ulbId ||
      sectionIdsChanged ||
      prevProfile.officerType !== nextProfile.officerType;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(prismaData).length > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: prismaData,
        });
      }

      if (shouldUpdateSections) {
        await tx.userSection.deleteMany({ where: { userId: user.id } });
        if (nextSectionIds.length > 0) {
          await tx.userSection.createMany({
            data: nextSectionIds.map((sectionId) => ({
              userId: user.id,
              sectionId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (shouldUpdateOrganisations) {
        await tx.userOrganisation.deleteMany({ where: { userId: user.id } });
        if (nextOrganisationIds.length > 0) {
          await tx.userOrganisation.createMany({
            data: nextOrganisationIds.map((organisationId) => ({
              userId: user.id,
              organisationId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (hasProfileFields && profileChanged) {
        await logAudit(
          tx,
          actor?.id,
          "rbac.user.profile.update",
          "user",
          user.id,
          prevProfile,
          nextProfile,
          { ...auditContext, targetUserCode: user.code ?? userCode },
        );
      }
    });

    const keycloakUserIdForProfile = await findKeycloakUserIdByIdentity({ username: user.code, email: user.email });
    if (keycloakUserIdForProfile && (prismaData.name !== undefined || prismaData.email !== undefined)) {
      await updateKeycloakUserProfile(keycloakUserIdForProfile, {
        fullName: prismaData.name !== undefined ? prismaData.name : undefined,
        email: prismaData.email !== undefined ? prismaData.email : undefined,
      });
    }

    if (body.roleCode !== undefined) {
      const role = await prisma.role.findUnique({ where: { code: body.roleCode } });
      if (!role) {
        return NextResponse.json({ detail: `Role not found: ${body.roleCode}` }, { status: 400 });
      }

      const keycloakUserIdForRole = await findKeycloakUserIdByIdentity({
        username: user.code,
        email: nextEmail,
      });

      await prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });

        await logAudit(
          tx,
          actor?.id,
          "rbac.user.role.update",
          "user",
          user.id,
          { roleCodes: previousRoleCodes },
          { roleCodes: [body.roleCode], keycloakUserId: keycloakUserIdForRole ?? null },
          { ...auditContext, targetUserCode: user.code ?? userCode },
        );
      });

      if (keycloakUserIdForRole) {
        await replaceKeycloakClientRole(keycloakUserIdForRole, body.roleCode);
      }

      return NextResponse.json({
        ok: true,
        roleCode: body.roleCode,
        keycloakSynced: Boolean(keycloakUserIdForRole),
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

    // DB-first for DELETE: tombstone the user (and write the audit row) in a single
    // transaction FIRST, then attempt the Keycloak delete as a best-effort cleanup.
    // Compensating re-create of a deleted Keycloak user is impossible without the
    // user's plaintext password, so we cannot use the "Keycloak-first + compensate"
    // pattern here. Residual: if the Keycloak delete fails, an orphan IdP user
    // remains — but it is DB-gated (DB isActive=false), so it cannot be used to log in.
    const keycloakUserId = await findKeycloakUserIdByIdentity({ username: user.code, email: user.email });

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userPermissionOverride.deleteMany({ where: { userId: user.id } });
      await tx.userSection.deleteMany({ where: { userId: user.id } });
      await tx.userOrganisation.deleteMany({ where: { userId: user.id } });
      await tx.schemeAssignment.updateMany({ where: { userId: user.id }, data: { userId: null } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          isActive: false,
          code: tombstoneValue("deleted-user", user.id),
          email: `${tombstoneValue("deleted", user.id)}@local.invalid`,
          name: `${user.name} (Deleted)`,
          department: null,
          designationId: null,
          organisationId: null,
          ulbId: null,
          officerType: null,
        },
      });

      await logAudit(
        tx,
        actor?.id,
        "rbac.user.delete",
        "user",
        user.id,
        { code: user.code, email: user.email, name: user.name },
        { keycloakUserId: keycloakUserId ?? null, isActive: false },
        { ...auditContext, targetUserCode: user.code ?? userCode },
      );
    });

    let keycloakSynced = false;
    if (keycloakUserId) {
      try {
        await deleteKeycloakUserById(keycloakUserId);
        keycloakSynced = true;
      } catch (keycloakError) {
        // DB user is tombstoned but Keycloak user lingers — surface loudly, never swallow.
        console.error(
          `[admin.users.delete] DB user ${user.id} tombstoned but Keycloak delete failed for ${keycloakUserId}; orphan IdP user remains (DB-gated, cannot log in). Error:`,
          keycloakError,
        );
        keycloakSynced = false;
      }
    }

    return NextResponse.json({ ok: true, keycloakSynced });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    const message = error instanceof Error ? error.message : "Unable to delete user";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
