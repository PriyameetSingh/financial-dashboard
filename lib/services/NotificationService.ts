import { prisma, tenantStamped, requireTenantScope } from "@/lib/prisma";
import { ActionItemPriority, NotificationChannel, NotificationStatus, DispatchStatus } from "@prisma/client";
import { loadEnabledModuleCodes } from "@/lib/entitlements/lookup";

export interface CreateNotificationParams {
  userId: string;
  title: string;
  content: string;
  type: string;
  priority: ActionItemPriority;
  link?: string;
  metadata?: any;
}

export class NotificationService {
  /**
   * Main entrypoint to trigger a notification.
   * Checks master switches, trigger settings, user preferences, quiet hours, and dispatches to appropriate channels.
   */
  static async trigger(params: CreateNotificationParams) {
    try {
      // 0. Entitlement gate — the Notification Engine module (MOD-NOTIF) must
      // be enabled for this tenant. Most callers of this method are NOT under a
      // MOD-NOTIF route at all (KPI review decisions, action-item lifecycle
      // events raise notifications from their own gated modules' routes), so
      // `proxy.ts`'s route-level gate never sees these call sites — this is the
      // one enforcement point that actually covers them.
      const tenantId = requireTenantScope("NotificationService.trigger");
      const enabledModules = await loadEnabledModuleCodes(tenantId);
      if (!enabledModules.has("MOD-NOTIF")) {
        console.log("[Notification Service] Ignored: Notification Engine module is not enabled for this tenant.");
        return null;
      }

      // 1. Check if notifications are globally enabled
      const enabled = await this.getConfigValue("SYSTEM_NOTIFICATIONS_ENABLED", "true");
      if (enabled === "false") {
        console.log("[Notification Service] Ignored: System notifications are globally disabled.");
        return null;
      }

      // 2. Check if notifications are paused until a future timestamp
      const disabledUntilStr = await this.getConfigValue("SYSTEM_NOTIFICATIONS_DISABLED_UNTIL", "");
      if (disabledUntilStr) {
        const disabledUntil = new Date(disabledUntilStr);
        if (!isNaN(disabledUntil.getTime()) && disabledUntil > new Date()) {
          console.log(`[Notification Service] Ignored: System notifications are temporarily paused until ${disabledUntil.toISOString()}.`);
          return null;
        }
      }

      // 3. Check if this specific event trigger is enabled in settings
      const triggerConfigKey = `TRIGGER_${params.type}`;
      // Check if it's manual notification (always enabled if the system is enabled)
      if (params.type !== "MANUAL") {
        const triggerEnabled = await this.getConfigValue(triggerConfigKey, "true");
        if (triggerEnabled === "false") {
          console.log(`[Notification Service] Ignored: Event trigger ${params.type} is disabled.`);
          return null;
        }
      }

      // 4. Create the base notification in the database (always accessible in-app)
      const notification = await prisma.notification.create({
        data: tenantStamped({
          userId: params.userId,
          title: params.title,
          content: params.content,
          type: params.type,
          priority: params.priority,
          link: params.link || null,
          metadata: params.metadata ? params.metadata : null,
          status: NotificationStatus.UNREAD,
        }),
      });

      // 5. Fetch recipient notification preferences
      const preferences = await prisma.userNotificationPreference.findMany({
        where: { userId: params.userId },
      });

      // Resolve enabled channels for this user (In-app is always enabled)
      const targetChannels: NotificationChannel[] = [NotificationChannel.IN_APP];
      
      const whatsappPref = preferences.find(p => p.category === "whatsapp" && p.channel === NotificationChannel.WHATSAPP);
      const emailPref = preferences.find(p => p.category === "email" && p.channel === NotificationChannel.EMAIL);

      // If user enabled WhatsApp/Email specifically, add them
      if (whatsappPref?.enabled) {
        targetChannels.push(NotificationChannel.WHATSAPP);
      }
      if (emailPref?.enabled) {
        targetChannels.push(NotificationChannel.EMAIL);
      }

      // 6. Handle dispatches for each resolved channel
      for (const channel of targetChannels) {
        if (channel === NotificationChannel.IN_APP) {
          // In-app is visible immediately, record dispatch status as SENT
          await prisma.notificationDispatch.create({
            data: tenantStamped({
              notificationId: notification.id,
              channel,
              status: DispatchStatus.SENT,
              dispatchedAt: new Date(),
            }),
          });
          continue;
        }

        // Quiet hours check for WhatsApp/Email
        const quietHoursEnabled = await this.getConfigValue("QUIET_HOURS_ENABLED", "true");
        const isUrgent = params.priority === ActionItemPriority.Critical || params.priority === ActionItemPriority.High;
        const isQuietHours = quietHoursEnabled === "true" && (await this.checkQuietHours());

        if (isQuietHours && !isUrgent) {
          // Queue for later dispatch during office hours
          await prisma.notificationDispatch.create({
            data: tenantStamped({
              notificationId: notification.id,
              channel,
              status: DispatchStatus.QUEUED_FOR_OFFICE_HOURS,
            }),
          });
          console.log(`[Notification Service] Queued ${channel} dispatch for user ${params.userId} due to quiet hours.`);
        } else {
          // Dispatch immediately to mock provider
          await this.dispatchToProvider(notification.id, channel);
        }
      }

      return notification;
    } catch (error) {
      console.error("[Notification Service] Error in triggering notification:", error);
      return null;
    }
  }

  /**
   * Helper to retrieve configuration value from SystemNotificationConfig.
   */
  private static async getConfigValue(key: string, defaultValue: string): Promise<string> {
    try {
      const config = await prisma.systemNotificationConfig.findFirst({
        where: { key },
      });
      return config ? config.value : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Evaluates if current local time falls under the quiet hours window.
   */
  private static async checkQuietHours(): Promise<boolean> {
    const quietStart = await this.getConfigValue("QUIET_HOURS_START", "17:30");
    const quietEnd = await this.getConfigValue("QUIET_HOURS_END", "10:00");

    const now = new Date();
    // Use current hours & minutes
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = quietStart.split(":").map(Number);
    const [endH, endM] = quietEnd.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      // Spans across midnight (e.g. 17:30 to 10:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    } else {
      // Same day (e.g. 22:00 to 06:00)
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
  }

  /**
   * Mock dispatch handler for future channel integrations (WhatsApp/Email).
   */
  private static async dispatchToProvider(notificationId: string, channel: NotificationChannel) {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: { user: true },
      });
      if (!notification) return;

      console.log(`\n=================== [NOTIFICATION SERVICE DISPATCH] ===================`);
      console.log(`Channel: ${channel}`);
      console.log(`Recipient: ${notification.user.name} (Phone/Code: ${notification.user.code}, Email: ${notification.user.email})`);
      console.log(`Title: ${notification.title}`);
      console.log(`Content: ${notification.content}`);
      console.log(`Secure Deep Link: ${process.env.NEXTAUTH_URL || ""}${notification.link || ""}`);
      console.log(`=======================================================================\n`);

      // Record successful dispatch
      await prisma.notificationDispatch.upsert({
        where: {
          notificationId_channel: { notificationId, channel },
        },
        create: tenantStamped({
          notificationId,
          channel,
          status: DispatchStatus.SENT,
          dispatchedAt: new Date(),
        }),
        update: {
          status: DispatchStatus.SENT,
          dispatchedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (e: any) {
      console.error(`[Notification Service] Failed to dispatch on ${channel} (notifId: ${notificationId}):`, e);
      await prisma.notificationDispatch.upsert({
        where: {
          notificationId_channel: { notificationId, channel },
        },
        create: tenantStamped({
          notificationId,
          channel,
          status: DispatchStatus.FAILED,
          errorMessage: e.message || "Unknown error during dispatch",
        }),
        update: {
          status: DispatchStatus.FAILED,
          errorMessage: e.message || "Unknown error during dispatch",
        },
      });
    }
  }
}
