import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { getAuditRequestContext, logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");

    const sections = await prisma.section.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ sections });
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

    const created = await prisma.section.create({
      data: { name },
      select: { id: true, name: true },
    });

    await logAudit(
      actor?.id ?? null,
      "CREATE",
      "Section",
      created.id,
      null,
      { name: created.name },
      auditContext
    );

    return NextResponse.json(created);
  } catch (error: unknown) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ detail: "A section with this name already exists" }, { status: 409 });
    }
    throw error;
  }
}

