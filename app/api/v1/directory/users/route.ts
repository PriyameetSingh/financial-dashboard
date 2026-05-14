import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";
import { Permission, UserRole } from "@/types";

export const runtime = "nodejs";

const ROLE_VALUES = new Set<string>(Object.values(UserRole));

function parseRole(code: string | null | undefined): UserRole {
  if (code && ROLE_VALUES.has(code)) return code as UserRole;
  return UserRole.NODAL_OFFICER;
}

/**
 * Active users for assignee/reviewer pickers (action items, meetings, etc.).
 * Requires at least one of the listed permissions.
 */
export async function GET() {
  try {
    await requireAnyPermission(
      Permission.CREATE_ACTION_ITEMS,
      Permission.UPDATE_ACTION_ITEMS,
      Permission.MANAGE_USERS,
      Permission.MANAGE_PERMISSIONS,
    );

    const rows = await prisma.user.findMany({
      where: { isActive: true, code: { not: null } },
      orderBy: { name: "asc" },
      select: {
        code: true,
        name: true,
        email: true,
        department: true,
        designation: true,
        organisation: true,
        section: true,
        officerType: true,
        userRoles: {
          take: 1,
          orderBy: { roleId: "asc" },
          select: { role: { select: { code: true } } },
        },
        schemeAssignments: {
          select: { scheme: { select: { code: true } } },
        },
      },
    });

    const users = rows
      .filter((r): r is typeof r & { code: string } => Boolean(r.code))
      .map((r) => {
        const roleCode = r.userRoles[0]?.role.code;
        const assignedSchemes = [...new Set(r.schemeAssignments.map((sa) => sa.scheme.code))];
        return {
          id: r.code,
          name: r.name,
          email: r.email,
          role: parseRole(roleCode),
          department: r.department ?? "",
          designation: r.designation?.trim() || "",
          organisation: r.organisation ?? "",
          section: r.section ?? "",
          officerType: r.officerType ?? null,
          assignedSchemes,
        };
      });

    return NextResponse.json({ users });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
