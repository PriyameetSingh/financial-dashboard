import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { NotificationService } from "@/lib/services/NotificationService";
import { ActionItemPriority } from "@prisma/client";

export const runtime = "nodejs";

type ManualNotificationBody = {
  recipientUserId: string;
  title: string;
  content: string;
  priority?: ActionItemPriority;
  link?: string;
};

export async function POST(request: NextRequest) {
  try {
    // 1. Verify user has the permission to send manual notifications
    const actor = await requirePermissionAndDbUser("SEND_MANUAL_NOTIFICATIONS");

    const body = (await request.json()) as ManualNotificationBody;
    const auditContext = getAuditRequestContext(request);

    const { recipientUserId, title, content, priority = ActionItemPriority.Medium, link } = body;

    // Validate request inputs
    if (!recipientUserId || !title?.trim() || !content?.trim()) {
      return NextResponse.json(
        { detail: "recipientUserId, title, and content are required fields." },
        { status: 400 }
      );
    }

    // Check if recipient user exists (robust UUID vs phone code check)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientUserId);
    const recipient = await prisma.user.findFirst({
      where: isUuid
        ? { id: recipientUserId }
        : { code: recipientUserId },
      select: { id: true, name: true, code: true },
    });

    if (!recipient) {
      return NextResponse.json(
        { detail: `Recipient user not found.` },
        { status: 404 }
      );
    }

    // 2. Trigger the notification
    const notification = await NotificationService.trigger({
      userId: recipient.id,
      title: title.trim(),
      content: content.trim(),
      type: "MANUAL",
      priority,
      link: link?.trim() || undefined,
      metadata: { sentByUserId: actor.id, sentByName: actor.name },
    });

    if (!notification) {
      return NextResponse.json(
        { detail: "Failed to send notification. The service may be globally disabled or paused." },
        { status: 503 }
      );
    }

    // 3. Log audit event
    await logAudit(
      actor.id,
      "notification.manual_send",
      "notification",
      notification.id,
      null,
      {
        recipientUserId,
        recipientName: recipient.name,
        recipientCode: recipient.code,
        title,
        priority,
      },
      auditContext
    );

    return NextResponse.json({ ok: true, notificationId: notification.id }, { status: 201 });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("[Manual Notifications API] Error sending manual notification:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
