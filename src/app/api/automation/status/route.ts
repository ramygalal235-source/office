import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { queueStats } from "@/lib/automation/queue";
import { health } from "@/lib/automation/runner";

/** حالة النظام الآلي: الطابور، القواعد، ومعدّل الإنجاز */
export async function GET(req: NextRequest) {
  try {
    if (!getSessionUser(req)) return ok({ authenticated: false });

    const now = new Date();
    const [queue, rules, enabledRules, deadJobs, recent, notifications] = await Promise.all([
      queueStats(),
      db.automationRule.count(),
      db.automationRule.count({ where: { enabled: true } }),
      db.job.count({ where: { status: "DEAD" } }),
      db.job.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, type: true, status: true, attempts: true, durationMs: true, lastError: true, createdAt: true, completedAt: true },
      }),
      db.notification.count({ where: { readAt: null, severity: { in: ["warning", "critical"] } } }),
    ]);

    const doneLast24h = await db.job.count({
      where: { status: "DONE", completedAt: { gte: new Date(now.getTime() - 86400000) } },
    });
    const deadLast24h = await db.job.count({
      where: { status: "DEAD", completedAt: { gte: new Date(now.getTime() - 86400000) } },
    });

    return ok({
      queue,
      rules: { total: rules, enabled: enabledRules },
      deadJobs,
      recent,
      unreadNotifications: notifications,
      last24h: {
        completed: doneLast24h,
        dead: deadLast24h,
        successRate: doneLast24h + deadLast24h > 0
          ? Math.round((doneLast24h / (doneLast24h + deadLast24h)) * 100)
          : 100,
      },
      handlers: health(),
    });
  } catch (e) {
    return handleDbError(e);
  }
}
