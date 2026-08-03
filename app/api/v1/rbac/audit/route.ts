import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type AuditEntry = {
  id: string;
  occurredAt: string;
  actorName: string | null;
  actorEmail: string | null;
  roleCode: string | null;
  permissionCode: string;
  granted: boolean;
};

type RolePermissionAfter = {
  roleCode?: string;
  permissionCode?: string;
  granted?: boolean;
} | null;

type RolePermissionMetadata = {
  roleCode?: string;
} | null;

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export async function GET() {
  try {
    await requirePermission("MANAGE_PERMISSIONS");

    const rows = await prisma.auditLog.findMany({
      where: { actionType: "rbac.role.permission" },
      include: {
        actorUser: { select: { name: true, email: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });

    const entries: AuditEntry[] = rows.map((row) => {
      const after = asObject(row.after) as RolePermissionAfter;
      const metadata = asObject(row.metadata) as RolePermissionMetadata;
      const roleCode = metadata?.roleCode ?? after?.roleCode ?? null;
      const permissionCode = after?.permissionCode ?? "";
      const granted = Boolean(after?.granted);
      return {
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actorName: row.actorUser?.name ?? null,
        actorEmail: row.actorUser?.email ?? null,
        roleCode,
        permissionCode,
        granted,
      };
    });

    return NextResponse.json({ entries });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
