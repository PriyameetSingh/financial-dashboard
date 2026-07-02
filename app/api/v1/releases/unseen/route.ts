import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDbUserBySession } from "@/lib/server-rbac";
import { getSessionUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await getDbUserBySession();
    if (!dbUser) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    // Role check: Only TASU users should see the "What's new" notification
    const isTasu =
      dbUser.userRoles.some((ur) => ur.role.code === "TASU") ||
      sessionUser.role === "TASU";

    if (!isTasu) {
      return NextResponse.json({ releases: [] });
    }

    // Fetch releases that this user hasn't seen/dismissed yet
    const unseen = await prisma.release.findMany({
      where: {
        seenBy: {
          none: {
            userId: dbUser.id,
          },
        },
      },
      include: {
        entries: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ releases: unseen });
  } catch (error) {
    console.error("API Error [releases/unseen GET]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
