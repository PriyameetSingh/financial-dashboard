import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

function computeEffective(roles: { permissions: string[] }[], overrides: { code: string; effect: string }[]) {
  const roleSet = new Set(roles.flatMap((r) => r.permissions));
  const allow = overrides.filter((o) => o.effect === "allow").map((o) => o.code);
  const deny = new Set(overrides.filter((o) => o.effect === "deny").map((o) => o.code));

  const effective = new Set<string>();
  for (const p of roleSet) effective.add(p);
  for (const p of allow) effective.add(p);
  for (const p of Array.from(effective)) {
    if (deny.has(p)) effective.delete(p);
  }

  return Array.from(effective).sort();
}

export async function GET() {
  try {
    await requirePermission("MANAGE_PERMISSIONS");

    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
        permissionOverrides: { include: { permission: true } },
        schemeAssignments: {
          select: { scheme: { select: { code: true } } },
        },
      },
    });

    return NextResponse.json({
      users: users.map((u) => {
        const roles = u.userRoles.map((ur) => ({
          code: ur.role.code,
          permissions: ur.role.rolePermissions.map((rp) => rp.permission.code),
        }));

        const overrides = u.permissionOverrides.map((o) => ({
          code: o.permission.code,
          effect: o.effect,
        }));

        const assignedSchemes = [...new Set((u.schemeAssignments as { scheme: { code: string } }[]).map((sa) => sa.scheme.code))];

        return {
          code: u.code,
          name: u.name,
          email: u.email,
          department: u.department,
          designation: u.designation,
          roles: roles.map((r) => r.code),
          overrides,
          effectivePermissions: computeEffective(roles, overrides),
          assignedSchemes,
        };
      }),
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
