import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/server-auth";
import { getEffectivePermissionCodesFromUserId, toAuthErrorResponse } from "@/lib/server-rbac";
import { isSessionInvalidated } from "@/lib/session-invalidation";
import { Permission, UserRole } from "@/types";

export const runtime = "nodejs";

/** Explicit select so `designation` and other scalars are present on the inferred type. */
const rbacMeUserSelect = {
  id: true,
  code: true,
  name: true,
  email: true,
  department: true,
  designationId: true,
  organisationId: true,
  ulbId: true,
  officerType: true,
  sessionsInvalidatedAt: true,
  userRoles: {
    include: { role: { select: { code: true } } },
  },
  designationRel: {
    select: { id: true, name: true },
  },
  organisationRel: {
    select: { id: true, name: true },
  },
  ulbRel: {
    select: { id: true, name: true },
  },
  userSections: {
    include: {
      section: {
        select: { id: true, name: true },
      },
    },
  },
} as const;

const USER_ROLE_VALUES = new Set<string>(Object.values(UserRole));
const PERMISSION_VALUES = new Set<string>(Object.values(Permission));

function parseUserRole(code: string | null | undefined, context: { source: string; userId: string }): UserRole {
  if (code && USER_ROLE_VALUES.has(code)) return code as UserRole;
  if (code) {
    console.warn("[rbac/me] Invalid role, falling back to NODAL_OFFICER", {
      source: context.source,
      userId: context.userId,
      receivedRole: code,
      acceptedRoles: [...USER_ROLE_VALUES],
    });
  } else {
    console.warn("[rbac/me] Missing role, falling back to NODAL_OFFICER", {
      source: context.source,
      userId: context.userId,
    });
  }
  return UserRole.NODAL_OFFICER;
}

function codesToPermissions(codes: Iterable<string>): Permission[] {
  const out: Permission[] = [];
  for (const code of codes) {
    if (PERMISSION_VALUES.has(code)) out.push(code as Permission);
  }
  return out;
}

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const dbUserByCode = await prisma.user.findFirst({
      where: { code: { equals: sessionUser.id, mode: "insensitive" } },
      select: rbacMeUserSelect,
    });
    const dbUser =
      dbUserByCode ??
      (sessionUser.email
        ? await prisma.user.findFirst({
            where: { email: { equals: sessionUser.email, mode: "insensitive" } },
            select: rbacMeUserSelect,
          })
        : null);

    if (dbUser && isSessionInvalidated(dbUser.sessionsInvalidatedAt, sessionUser.iat)) {
      return NextResponse.json({ detail: "Session invalidated" }, { status: 401 });
    }

    if (!dbUser) {
      console.warn("[rbac/me] DB user not found for session identity", {
        sessionUserId: sessionUser.id,
        sessionEmail: sessionUser.email ?? null,
      });
      return NextResponse.json(
        {
          detail:
            "Your single sign-on account is not registered in this dashboard. Please contact your departmental IT administrator to have your account provisioned.",
          code: "ACCOUNT_NOT_REGISTERED",
        },
        { status: 401 },
      );
    }

    const sessionRoleFallback =
      dbUser.userRoles.length === 0 && sessionUser.role ? sessionUser.role : null;

    const [schemeRows, effectiveCodes] = await Promise.all([
      prisma.schemeAssignment.findMany({
        where: { userId: dbUser.id },
        select: { scheme: { select: { code: true } } },
      }),
      getEffectivePermissionCodesFromUserId(dbUser.id, sessionRoleFallback),
    ]);

    const assignedSchemes = [...new Set(schemeRows.map((r) => r.scheme.code))];

    const roleCodes = dbUser.userRoles.map((ur) => ur.role.code).sort();
    const primaryRole = parseUserRole(roleCodes[0] ?? sessionUser.role, {
      source: roleCodes[0] ? "database" : "session",
      userId: dbUser.code ?? sessionUser.id,
    });

    const permissions = codesToPermissions(effectiveCodes);

    return NextResponse.json({
      user: {
        id: dbUser.code ?? sessionUser.id,
        dbId: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: primaryRole,
        department: dbUser.department ?? "",
        designationId: dbUser.designationId ?? null,
        designationName: (dbUser.designationRel as { id: string; name: string } | null)?.name ?? null,
        organisationId: dbUser.organisationId ?? null,
        organisationName: (dbUser.organisationRel as { id: string; name: string } | null)?.name ?? null,
        ulbId: dbUser.ulbId ?? null,
        ulbName: (dbUser.ulbRel as { id: string; name: string } | null)?.name ?? null,
        sections: (dbUser.userSections as Array<{ section: { id: string; name: string } }>).map((us) => ({
          id: us.section.id,
          name: us.section.name,
        })),
        officerType: dbUser.officerType ?? null,
        assignedSchemes,
        permissions,
      },
    });
  } catch (error) {
    const mapped = toAuthErrorResponse(error);
    if (mapped) {
      return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    }
    throw error;
  }
}
