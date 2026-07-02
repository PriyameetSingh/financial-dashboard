import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";
import { syncReleases } from "@/lib/release-sync";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    await syncReleases();

    const current = await prisma.release.findFirst({
      where: { isCurrent: true },
      include: {
        entries: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ release: current });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("API Error [releases/current GET]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
