import { createHash } from "crypto";
import { db } from "@/lib/db";

// ===== سجل الأحداث: العمود الفقري للامتثال والتتبع =====
//
// كل تغيير في النظام يُسجَّل هنا كحدث لا يُعدَّل ولا يُحذف، ويرتبط بالحدث
// السابق بتجزئة SHA-256. تعديل أي حدث في الماضي يكسر السلسلة من تلك النقطة
// للأمام، ويكشفه verifyChain() — وهذا ما يجعل «100% قابل للتتبع» وعدًا
// قابلًا للتحقق لا مجرد كلام.
//
// سجل التدقيق AuditLog يبقى بجانبه للعرض السريع؛ هذا السجل هو مصدر الحقيقة.

export type ActorType = "human" | "automation" | "system";

// ===== اشتقاق اسم الحدث =====
//
// الـ API يستدعي auditLog("CREATE", "TaxObligation", id) كما هو، لكن
// القواعد تُكتب بأسماء أوضح: "obligation.created". هذا الجسر يوحّد
// التسميتين حتى لا تتفرّق القواعد عن نداءات الكود الفعلي.

const ENTITY_SLUG: Record<string, string> = {
  ClientCompany: "client",
  TaxObligation: "obligation",
  OfficeTask: "task",
  Engagement: "engagement",
  Invoice: "invoice",
  Purchase: "purchase",
  Payment: "payment",
  JournalEntry: "journal",
  Ledger: "ledger",
  Account: "account",
  Party: "party",
  Safe: "safe",
  DmsDocument: "document",
  AutomationRule: "rule",
  User: "user",
};

const ACTION_SLUG: Record<string, string> = {
  CREATE: "created",
  UPDATE: "updated",
  DELETE: "deleted",
  POST: "posted",
  REVERSE: "reversed",
};

export function deriveEventType(entity: string, action: string): string {
  const e = ENTITY_SLUG[entity] ?? entity.toLowerCase();
  const a = ACTION_SLUG[action] ?? action.toLowerCase();
  return `${e}.${a}`;
}

export interface EventInput {
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  actor?: string;
  actorType?: ActorType;
  payload?: unknown;
  ip?: string | null;
}

const GENESIS = "GENESIS";

/** التمثيل المعياري للحدث — ترتيب الحقول ثابت حتى تكون التجزئة قابلة لإعادة الإنتاج */
function canonical(e: {
  seq: number;
  at: string;
  actor: string;
  actorType: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  payload: string;
}): string {
  return [
    e.seq,
    e.at,
    e.actor,
    e.actorType,
    e.action,
    e.entity,
    e.entityId,
    e.summary,
    e.payload,
  ].join("|");
}

function hashOf(prevHash: string, body: string): string {
  return createHash("sha256").update(`${prevHash}|${body}`).digest("hex");
}

/**
 * يُضيف حدثًا للسجل ويربطه بالحدث السابق.
 * يتم كل شيء داخل معاملة واحدة حتى لا يقرأ معالجان متزامنان
 * نفس الـ prevHash فيكسر السلسلة.
 */
export async function appendEvent(input: EventInput) {
  return db.$transaction(async (tx) => {
    const last = await tx.eventLog.findFirst({ orderBy: { seq: "desc" } });
    const prevHash = last?.hash ?? GENESIS;
    const nextSeq = (last?.seq ?? 0) + 1;

    const at = new Date();
    const actor = input.actor ?? "system";
    const actorType = input.actorType ?? "system";
    const entityId = input.entityId ?? "";
    const payload = input.payload === undefined ? "" : JSON.stringify(input.payload);

    const body = canonical({
      seq: nextSeq,
      at: at.toISOString(),
      actor,
      actorType,
      action: input.action,
      entity: input.entity,
      entityId,
      summary: input.summary,
      payload,
    });

    return tx.eventLog.create({
      data: {
        seq: nextSeq,
        at,
        actor,
        actorType,
        action: input.action,
        entity: input.entity,
        entityId,
        summary: input.summary,
        payload: payload || null,
        ip: input.ip ?? null,
        prevHash,
        hash: hashOf(prevHash, body),
      },
    });
  });
}

/** يُضيف الحدث ثم يطلق القواعد المرتبطة به — نقطة الدخول للأتمتة */
export async function record(input: EventInput) {
  const event = await appendEvent(input);
  // القواعد تُنفَّذ بشكل متزامن هنا: كل شيء محلي ولا شبكة، والفشل لا يُسقط
  // العملية الأصلية (الحدث مسجَّل بالفعل وهو الأهم).
  try {
    const { dispatchEvent } = await import("./rules");
    // نطلق بالنوع المشتق (obligation.created) وبالاسم الخام معًا حتى تلتقط
    // القواعد أيًّا منهما كتبت عليه
    const derived = deriveEventType(event.entity, event.action);
    await dispatchEvent([derived, event.action], event);
  } catch (err) {
    console.error("Event dispatch failed:", err);
  }
  return event;
}

export interface ChainBreak {
  seq: number;
  reason: string;
}

/** يتحقق من سلامة السلسلة من البداية حتى آخر حدث */
export async function verifyChain(limit = 1000): Promise<{ ok: boolean; checked: number; breaks: ChainBreak[] }> {
  const events = await db.eventLog.findMany({
    orderBy: { seq: "asc" },
    take: limit,
  });

  const breaks: ChainBreak[] = [];
  let prevHash = GENESIS;
  let expectedSeq = 1;

  for (const e of events) {
    if (e.seq !== expectedSeq) {
      breaks.push({ seq: e.seq, reason: `فجوة في الترقيم: المتوقع ${expectedSeq} والموجود ${e.seq}` });
    }
    expectedSeq = e.seq + 1;

    if (e.prevHash !== prevHash) {
      breaks.push({ seq: e.seq, reason: `(prevHash) غير مطابق — السلسلة مكسورة عند هذا الحدث` });
    }

    const body = canonical({
      seq: e.seq,
      at: new Date(e.at).toISOString(),
      actor: e.actor,
      actorType: e.actorType,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      summary: e.summary,
      payload: e.payload ?? "",
    });

    const recomputed = hashOf(prevHash, body);
    if (recomputed !== e.hash) {
      breaks.push({ seq: e.seq, reason: "التجزئة لا تطابق المحتوى — الحدث تم تعديله" });
    }

    prevHash = e.hash;
  }

  return { ok: breaks.length === 0, checked: events.length, breaks };
}

/** سجل كيان معيّن — الخط الزمني الكامل لأي سجل */
export async function timeline(entity: string, entityId: string, take = 50) {
  return db.eventLog.findMany({
    where: { entity, entityId },
    orderBy: { seq: "desc" },
    take,
  });
}
