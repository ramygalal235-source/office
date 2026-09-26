import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

const SESSION_SECRET = process.env.SESSION_SECRET || "dafater-almohaseb-local-session-secret-v1";
const SESSION_COOKIE = "dafater_session";

export interface SessionUser {
  uid: string;
  username: string;
  name: string;
  role: string;
}

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export function handleDbError(e: unknown) {
  // Safe error handling: log detailed stack trace/error on server, return generic message to prevent data leakage
  console.error("Database Error:", e);
  return fail("حدث خطأ غير متوقع في قاعدة البيانات", 500);
}

export function parsePagination(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}

export async function auditLog(action: string, entity: string, entityId: string, details?: string, username?: string) {
  try {
    await db.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        details: details ?? null,
        username: username ?? "system",
      },
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export function getSessionUser(req: NextRequest): SessionUser | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expected = createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      uid?: string; username?: string; name?: string; role?: string; exp?: number;
    };
    if (!payload?.uid || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return { uid: payload.uid, username: payload.username ?? "", name: payload.name ?? "", role: payload.role ?? "viewer" };
  } catch {
    return null;
  }
}

export function requireAdmin(req: NextRequest): SessionUser | null {
  const user = getSessionUser(req);
  return user && user.role === "admin" ? user : null;
}

export async function generateNumber(type: string): Promise<string> {
  const seq = await db.documentSequence.findUnique({ where: { type } });
  if (!seq) {
    return `${type}-${Date.now().toString().slice(-6)}`;
  }
  const num = seq.nextNumber;
  await db.documentSequence.update({
    where: { type },
    data: { nextNumber: num + 1 },
  });
  return `${seq.prefix}${String(num).padStart(seq.padding, "0")}`;
}
