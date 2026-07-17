import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { getAuditRequestContext, logAudit } from "@/lib/audit";

export const runtime = "nodejs";

// Default configs to seed / fallback if not customized in db
const DEFAULT_CONFIGS: Record<string, string> = {
  SYSTEM_NOTIFICATIONS_ENABLED: "true",
  SYSTEM_NOTIFICATIONS_DISABLED_UNTIL: "",
  QUIET_HOURS_ENABLED: "true",
  QUIET_HOURS_START: "17:30",
  QUIET_HOURS_END: "10:00",
  TRIGGER_ACTION_ITEM_ASSIGNED: "true",
  TRIGGER_ACTION_ITEM_REASSIGNED: "true",
  TRIGGER_ACTION_ITEM_UNASSIGNED: "true",
  TRIGGER_ACTION_ITEM_UPDATE: "true",
  TRIGGER_ACTION_ITEM_REVIEW_REQUEST: "true",
  TRIGGER_ACTION_ITEM_COMPLETED: "true",
  TRIGGER_ACTION_ITEM_REJECTED: "true",
  TRIGGER_KPI_ASSIGNED: "true",
  TRIGGER_KPI_REASSIGNED: "true",
  TRIGGER_KPI_SUBMITTED: "true",
  TRIGGER_KPI_REVIEW_DECISION: "true",
};

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_NOTIFICATION_CONFIG");

    const dbConfigs = await prisma.systemNotificationConfig.findMany();
    const configMap: Record<string, string> = { ...DEFAULT_CONFIGS };

    for (const cfg of dbConfigs) {
      configMap[cfg.key] = cfg.value;
    }

    return NextResponse.json({ configs: configMap });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("[Notification Config API] Error fetching configurations:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_NOTIFICATION_CONFIG");
    const body = await request.json();
    const auditContext = getAuditRequestContext(request);

    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ detail: "Request body must be an object of key-value configuration pairs." }, { status: 400 });
    }

    const beforeConfigs = await prisma.systemNotificationConfig.findMany({
      where: { key: { in: Object.keys(body) } },
    });
    const beforeMap: Record<string, string> = {};
    for (const c of beforeConfigs) {
      beforeMap[c.key] = c.value;
    }

    const afterMap: Record<string, string> = {};

    // Upsert configs in database
    for (const [key, rawValue] of Object.entries(body)) {
      // Validate configuration keys
      if (!Object.keys(DEFAULT_CONFIGS).includes(key)) {
        continue; // skip invalid or unknown config keys
      }

      const value = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
      afterMap[key] = value;

      await prisma.systemNotificationConfig.upsert({
        where: { key },
        create: {
          key,
          value,
          updatedById: actor.id,
        },
        update: {
          value,
          updatedById: actor.id,
        },
      });
    }

    // Log administrative audit event
    await logAudit(
      actor.id,
      "notification.config_update",
      "system_notification_configs",
      actor.id, // system configuration updates don't have a single row target ID, reference updating actor
      beforeMap,
      afterMap,
      auditContext
    );

    return NextResponse.json({ ok: true, configs: afterMap });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("[Notification Config API] Error updating configurations:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
