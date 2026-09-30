import { db } from "@/lib/db";
import seedData from "@/lib/accounting/seed-data.json";
import { appendEvent } from "./event-log";
import { enqueue } from "./queue";

// ===== محرك القواعد =====
//
// يربط الأحداث بالمهام. عند حدوث أي تغيير في النظام يُسجَّل حدث، وتبحث
// القواعد عن تطابق مع اسم الحدث، فتُنشأ المهمة اللازمة تلقائيًا.
//
// القاعدة: كل قاعدة تضيف مهمة واحدة إلى الطابور فقط — لا تنفّذ العمل بنفسها.
// التنفيذ يتم عبر عامل واحد (runner) حتى يبقى ترتيب العمل قابلًا للتنبؤ.

export async function dispatchEvent(
  actions: string | string[],
  event: { id: string; payload: string | null; entity?: string; entityId?: string }
) {
  const list = Array.isArray(actions) ? actions : [actions];
  const rules = await db.automationRule.findMany({
    where: { enabled: true, trigger: "EVENT", eventType: { in: list } },
    orderBy: { priority: "asc" },
  });

  if (!rules.length) return { matched: 0, enqueued: 0 };

  let enqueued = 0;
  for (const rule of rules) {
    if (!rule.enqueueJob) continue;
      const payload = parsePayload(rule.params, event.payload, event.id, event);
    const result = await enqueue({
      type: rule.enqueueJob,
      payload,
      priority: rule.priority,
      sourceEventId: event.id,
      // مفتاح تكرار: نفس الحدث + نفس القاعدة ينتج مهمة واحدة فقط
      idempotencyKey: `rule:${rule.code}:${event.id}`,
    });
    if (result.created) enqueued += 1;

    await db.automationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date(), runCount: { increment: 1 } },
    });
  }

  return { matched: rules.length, enqueued };
}

function parsePayload(
  ruleParams: string | null,
  eventPayload: string | null,
  eventId: string,
  event: { entity?: string; entityId?: string }
) {
  let params: Record<string, unknown> = {};
  try {
    params = ruleParams ? JSON.parse(ruleParams) : {};
  } catch {
    params = {};
  }
  const payload = safeParse(eventPayload);
  // القيم من الحدث تغلب على ثوابت القاعدة.
  // معرّف الكيان يصل للمعالج بنفس اسم الكيان، حتى يقرأ المعالج
  // payload.obligationId دون أن يقرأ معرّف كيان آخر بالخطأ.
  const slug = event.entity ? slugOf(event.entity) : null;
  return {
    ...params,
    ...payload,
    eventId,
    entity: event.entity ?? null,
    entityId: event.entityId ?? null,
    ...(slug ? { [slug]: event.entityId } : {}),
  };
}

const SLUGS: Record<string, string> = {
  ClientCompany: "clientId",
  TaxObligation: "obligationId",
  OfficeTask: "taskId",
  Engagement: "engagementId",
  Invoice: "invoiceId",
  Purchase: "purchaseId",
  Payment: "paymentId",
  Account: "accountId",
  Party: "partyId",
  DmsDocument: "documentId",
};

function slugOf(entity: string): string | null {
  return SLUGS[entity] ?? null;
}

function safeParse(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// ===== الجدولة =====
//
// cron مبسّط من خمسة حقول: دقيقة، ساعة، يوم، شهر، يوم-الأسبوع
// يدعم: * و */n و n,n,n و n-m. يكفي لتشغيل النظام كل خمس دقائق.

export function cronMatches(expr: string, at: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [min, hour, dom, month, dow] = fields;
  const d = at.getMinutes();
  const h = at.getHours();
  const day = at.getDate();
  const mon = at.getMonth() + 1;
  const wd = at.getDay();

  return (
    matchField(min, d, 0, 59) &&
    matchField(hour, h, 0, 23) &&
    matchField(dom, day, 1, 31) &&
    matchField(month, mon, 1, 12) &&
    matchField(dow, wd, 0, 6)
  );
}

function matchField(spec: string, value: number, min: number, max: number): boolean {
  if (spec === "*") return true;
  for (const part of spec.split(",")) {
    const step = part.includes("/") ? part.split("/")[1] : null;
    const range = part.split("/")[0];

    let start = min;
    let end = max;
    if (range !== "*") {
      if (range.includes("-")) {
        const [a, b] = range.split("-").map(Number);
        start = a;
        end = b;
      } else {
        start = Number(range);
        end = step ? max : start;
      }
    }
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (step) {
      if (value >= start && value <= end && (value - start) % Number(step) === 0) return true;
    } else if (value >= start && value <= end) {
      return true;
    }
  }
  return false;
}

/** يجدول القواعد الزمنية المستحقة لهذا الدقيقة (مرة واحدة لكل دقيقة) */
export async function runDueSchedules(now = new Date()) {
  const rules = await db.automationRule.findMany({
    where: { enabled: true, trigger: "SCHEDULE" },
  });

  let enqueued = 0;
  for (const rule of rules) {
    if (!rule.cron || !rule.enqueueJob) continue;
    if (!cronMatches(rule.cron, now)) continue;

    // مفتاح التكرار بالدقيقة يمنع التكرار عند تشغيل العامل أكثر من مرة
    const minuteKey = `${rule.code}:${now.toISOString().slice(0, 16)}`;
    const result = await enqueue({
      type: rule.enqueueJob,
      payload: { ruleCode: rule.code, params: safeParse(rule.params) },
      priority: rule.priority,
      idempotencyKey: `cron:${minuteKey}`,
    });
    if (result.created) {
      enqueued += 1;
      await db.automationRule.update({
        where: { id: rule.id },
        data: { lastRunAt: now, runCount: { increment: 1 } },
      });
    }
  }
  return { rules: rules.length, enqueued };
}

// ===== القواعد الافتراضية =====

// القواعد الافتراضية مصدرها seed-data.json — نفس الملف الذي يقرأه
// سكربت التهيئة، فلا تتكرر القواعد في مكانين.
export const DEFAULT_RULES = seedData.automationRules;

/** ينشئ القواعد الافتراضية إن لم تكن موجودة — آمن للتكرار */
export async function seedDefaultRules() {
  let created = 0;
  for (const rule of DEFAULT_RULES) {
    const existing = await db.automationRule.findUnique({ where: { code: rule.code } });
    if (existing) continue;
    await db.automationRule.create({
      data: {
        code: rule.code,
        name: rule.name,
        description: rule.description ?? null,
        trigger: rule.trigger,
        eventType: rule.eventType ?? null,
        cron: rule.cron ?? null,
        enqueueJob: rule.enqueueJob,
        priority: rule.priority,
        // بعض القواعد (مثل إرسال الهيئة) تُبذَر معطَّلة حتى يكتمل إعدادها
        enabled: rule.enabled ?? true,
      },
    });
    created += 1;
  }
  if (created) {
    await appendEvent({
      action: "rules.seeded",
      entity: "AutomationRule",
      summary: `تهيئة ${created} قاعدة أتمتة افتراضية`,
      actorType: "system",
    });
  }
  return created;
}
