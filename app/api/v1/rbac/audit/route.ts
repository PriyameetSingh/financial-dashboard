import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

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

export async function GET(request: NextRequest) {
  try {
    await requirePermission("MANAGE_PERMISSIONS");

    const { searchParams } = new URL(request.url);
    const pageRaw = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 ? Math.min(pageSizeRaw, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

    const where = { actionType: "rbac.role.permission" };

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actorUser: { select: { name: true, email: true } },
        },
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

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

    return NextResponse.json({
      entries,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
