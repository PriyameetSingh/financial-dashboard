import { NextRequest, NextResponse } from "next/server";
import { prisma, tenantStamped } from "@/lib/prisma";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { getAuditRequestContext, logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");

    const designations = await prisma.designation.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ designations });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser("MANAGE_PERMISSIONS");
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim() ?? "";

    if (!name) {
      return NextResponse.json({ detail: "name is required" }, { status: 400 });
    }

    const auditContext = getAuditRequestContext(request);

    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.designation.create({
        data: tenantStamped({ name }),
        select: { id: true, name: true },
      });

      await logAudit(
        tx,
        actor?.id ?? null,
        "CREATE",
        "Designation",
        created.id,
        null,
        { name: created.name },
        auditContext
      );

      return created;
    });

    return NextResponse.json(created);
  } catch (error: unknown) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ detail: "A designation with this name already exists" }, { status: 409 });
    }
    throw error;
  }
}

