import { NextRequest, NextResponse } from "next/server";
import { prisma, tenantStamped } from "@/lib/prisma";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { getAuditRequestContext, logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");

    const verticals = await prisma.vertical.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ verticals });
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
    const body = (await request.json()) as { code?: string; name?: string };
    const code = body.code?.trim() ?? "";
    const name = body.name?.trim() ?? "";

    if (!code) {
      return NextResponse.json({ detail: "code is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ detail: "name is required" }, { status: 400 });
    }

    const auditContext = getAuditRequestContext(request);

    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.vertical.create({
        data: tenantStamped({ code, name }),
        select: { id: true, code: true, name: true },
      });

      await logAudit(
        tx,
        actor?.id ?? null,
        "CREATE",
        "Vertical",
        created.id,
        null,
        { code: created.code, name: created.name },
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
      return NextResponse.json({ detail: "A vertical with this code already exists" }, { status: 409 });
    }
    throw error;
  }
}
