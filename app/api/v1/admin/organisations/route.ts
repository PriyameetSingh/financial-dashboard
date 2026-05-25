import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAnyPermissionAndDbUser("MANAGE_USERS", "MANAGE_PERMISSIONS");

    const organisations = await prisma.organisation.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ organisations });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
