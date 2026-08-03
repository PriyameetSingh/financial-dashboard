import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDbUserBySession, toAuthErrorResponse } from "@/lib/server-rbac";
import { NotificationStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const dbUser = await getDbUserBySession();
    if (!dbUser) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    const mapped = toAuthErrorResponse(error);
    if (mapped) {
      return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    }
    console.error("[Notifications API] Error fetching notifications:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const dbUser = await getDbUserBySession();
    if (!dbUser) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    await prisma.notification.updateMany({
      where: {
        userId: dbUser.id,
        status: NotificationStatus.UNREAD,
      },
      data: {
        status: NotificationStatus.READ,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = toAuthErrorResponse(error);
    if (mapped) {
      return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    }
    console.error("[Notifications API] Error marking notifications as read:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
