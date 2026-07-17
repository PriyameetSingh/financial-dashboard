import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDbUserBySession } from "@/lib/server-rbac";
import { NotificationStatus } from "@prisma/client";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const dbUser = await getDbUserBySession();
    if (!dbUser) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json();
    const status = body.status as NotificationStatus;

    if (!status || !Object.values(NotificationStatus).includes(status)) {
      return NextResponse.json(
        { detail: "Invalid or missing notification status" },
        { status: 400 }
      );
    }

    // Find notification and ensure it belongs to the user
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: dbUser.id,
      },
    });

    if (!notification) {
      return NextResponse.json(
        { detail: "Notification not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ notification: updated });
  } catch (error) {
    console.error("[Notifications API] Error updating notification:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
