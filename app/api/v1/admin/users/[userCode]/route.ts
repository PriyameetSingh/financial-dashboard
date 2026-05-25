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
  /** UUID foreign key to Organisation table */
  organisationId?: string | null;
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
      },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const previousRoleCodes = user.userRoles.map((entry) => entry.role.code);
    const previousSectionIds = user.userSections.map((us) => us.sectionId);

    const prevProfile = {
      name: user.name,
      email: user.email,
      department: user.department,
      designationId: user.designationId,
      organisationId: user.organisationId,
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
    });

    const nextName = prismaData.name ?? user.name;
    const nextEmail = prismaData.email ?? user.email;

    if (hasProfileFields) {
      const nextProfile = {
        name: nextName,
        email: nextEmail,
        department: prismaData.department !== undefined ? prismaData.department : user.department,
        designationId: prismaData.designationId !== undefined ? prismaData.designationId : user.designationId,
        organisationId: prismaData.organisationId !== undefined ? prismaData.organisationId : user.organisationId,
        ulbId: prismaData.ulbId !== undefined ? prismaData.ulbId : user.ulbId,
        sectionIds: nextSectionIds,
        officerType: prismaData.officerType !== undefined ? prismaData.officerType : user.officerType,
      };
      const sectionIdsChanged = JSON.stringify([...previousSectionIds].sort()) !== JSON.stringify([...nextSectionIds].sort());
      const profileChanged =
        prevProfile.name !== nextProfile.name ||
        prevProfile.email !== nextProfile.email ||
        prevProfile.department !== nextProfile.department ||
        prevProfile.designationId !== nextProfile.designationId ||
        prevProfile.organisationId !== nextProfile.organisationId ||
        prevProfile.ulbId !== nextProfile.ulbId ||
        sectionIdsChanged ||
        prevProfile.officerType !== nextProfile.officerType;
      if (profileChanged) {
        await logAudit(
          actor?.id,
          "rbac.user.profile.update",
          "user",
          user.id,
          prevProfile,
          nextProfile,
          { ...auditContext, targetUserCode: user.code ?? userCode },
        );
      }
    }

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

      await prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      });

      const keycloakUserIdForRole = await findKeycloakUserIdByIdentity({
        username: user.code,
        email: nextEmail,
      });
      if (keycloakUserIdForRole) {
        await replaceKeycloakClientRole(keycloakUserIdForRole, body.roleCode);
      }

      await logAudit(
        actor?.id,
        "rbac.user.role.update",
        "user",
        user.id,
        { roleCodes: previousRoleCodes },
        { roleCodes: [body.roleCode], keycloakUserId: keycloakUserIdForRole ?? null },
        { ...auditContext, targetUserCode: user.code ?? userCode },
      );

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

    const keycloakUserId = await findKeycloakUserIdByIdentity({ username: user.code, email: user.email });
    if (keycloakUserId) {
      await deleteKeycloakUserById(keycloakUserId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userPermissionOverride.deleteMany({ where: { userId: user.id } });
      await tx.userSection.deleteMany({ where: { userId: user.id } });
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
