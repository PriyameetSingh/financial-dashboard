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
  /** Job title / post; empty string stored as null */
  designation?: string | null;
  name?: string;
  email?: string;
  department?: string | null;
  organisation?: string | null;
  section?: string | null;
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
      body.organisation !== undefined ||
      body.section !== undefined ||
      body.officerType !== undefined;

    if (body.roleCode === undefined && body.designation === undefined && !hasProfileFields) {
      return NextResponse.json(
        { detail: "Provide roleCode, designation, and/or profile fields (name, email, department, …)" },
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
        designation: true,
        organisation: true,
        section: true,
        officerType: true,
        userRoles: { include: { role: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const previousRoleCodes = user.userRoles.map((entry) => entry.role.code);

    const prevProfile = {
      name: user.name,
      email: user.email,
      department: user.department,
      designation: user.designation,
      organisation: user.organisation,
      section: user.section,
      officerType: user.officerType,
    };

    const prismaData: {
      name?: string;
      email?: string;
      department?: string | null;
      designation?: string | null;
      organisation?: string | null;
      section?: string | null;
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
    if (body.organisation !== undefined) {
      prismaData.organisation = trimToNull(body.organisation ?? undefined, 500);
    }
    if (body.section !== undefined) {
      prismaData.section = trimToNull(body.section ?? undefined, 500);
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

    if (body.designation !== undefined) {
      const next =
        body.designation === null || body.designation === ""
          ? null
          : String(body.designation).trim().slice(0, 500) || null;
      prismaData.designation = next;
    }

    if (Object.keys(prismaData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: prismaData,
      });
    }

    const nextName = prismaData.name ?? user.name;
    const nextEmail = prismaData.email ?? user.email;

    if (hasProfileFields || body.designation !== undefined) {
      const nextProfile = {
        name: nextName,
        email: nextEmail,
        department: prismaData.department !== undefined ? prismaData.department : user.department,
        designation: prismaData.designation !== undefined ? prismaData.designation : user.designation,
        organisation: prismaData.organisation !== undefined ? prismaData.organisation : user.organisation,
        section: prismaData.section !== undefined ? prismaData.section : user.section,
        officerType: prismaData.officerType !== undefined ? prismaData.officerType : user.officerType,
      };
      const profileChanged =
        prevProfile.name !== nextProfile.name ||
        prevProfile.email !== nextProfile.email ||
        prevProfile.department !== nextProfile.department ||
        prevProfile.designation !== nextProfile.designation ||
        prevProfile.organisation !== nextProfile.organisation ||
        prevProfile.section !== nextProfile.section ||
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
          organisation: null,
          section: null,
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
