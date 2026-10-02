import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth";

export type { SessionUser };

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export function handleDbError(e: unknown) {
  console.error("Database Error:", e);
  const msg = e instanceof Error ? e.message : "حدث خطأ غير متوقع في قاعدة البيانات";
  return fail(msg, 500);
}

export function parsePagination(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}

// سجل التدقيق: يكتب في AuditLog (للعرض) وفي EventLog (السلسلة المشفّرة).
// الاستدعاء لا يُفشل العملية الأصلية أبدًا: فشل التدقيق يجب ألا يُسقط عملاً
// تم فعله، لكنه لا يُخفى أيضًا — يُطبع في السجل.
export async function auditLog(action: string, entity: string, entityId: string, details?: string, username?: string) {
  const actor = username ?? "system";
  try {
    await db.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        details: details ?? null,
        username: actor,
      },
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }

  try {
    const { record } = await import("@/lib/automation/event-log");
    await record({
      action,
      entity,
      entityId,
      summary: details ?? action,
      actor,
      actorType: actor === "system" ? "system" : "human",
    });
  } catch (err) {
    console.error("Event log error:", err);
  }
}

export function getSessionUser(req: NextRequest): SessionUser | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function requireAdmin(req: NextRequest): SessionUser | null {
  const user = getSessionUser(req);
  return user && user.role === "admin" ? user : null;
}

export async function generateNumber(type: string): Promise<string> {
  // التحديث يتم داخل معاملة واحدة حتى لا يتكرر الرقم عند وجود طلبين متزامنين
  return db.$transaction(async (tx) => {
    const seq = await tx.documentSequence.findUnique({ where: { type } });
    if (!seq) {
      return `${type}-${Date.now().toString().slice(-6)}`;
    }
    const num = seq.nextNumber;
    await tx.documentSequence.update({
      where: { type },
      data: { nextNumber: num + 1 },
    });
    return `${seq.prefix}${String(num).padStart(seq.padding, "0")}`;
  });
}
