import { NextRequest, NextResponse } from "next/server";
import { prisma, tenantStamped } from "@/lib/prisma";
import { getDbUserBySession } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: releaseId } = await props.params;
    const dbUser = await getDbUserBySession();
    if (!dbUser) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    // Verify release exists
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
    });

    if (!release) {
      return NextResponse.json({ detail: "Release not found" }, { status: 404 });
    }

    // Mark as seen
    await prisma.userSeenRelease.upsert({
      where: {
        userId_releaseId: {
          userId: dbUser.id,
          releaseId,
        },
      },
      update: {},
      create: tenantStamped({
        userId: dbUser.id,
        releaseId,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API Error [releases dismiss POST]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
