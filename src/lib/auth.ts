import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const SESSION_SECRET = process.env.SESSION_SECRET || "dafater-almohaseb-local-session-secret-v1";
export const SESSION_COOKIE = "dafater_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 ساعة

export interface SessionUser {
  uid: string;
  username: string;
  name: string;
  role: string;
  exp: number;
}

export type Role = "admin" | "accountant" | "viewer";

export const ROLES: Role[] = ["admin", "accountant", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدير النظام",
  accountant: "محاسب",
  viewer: "مطالع",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "صلاحية كاملة: الإضافة والتعديل والحذف وإدارة المستخدمين والإعدادات والنسخ الاحتياطي",
  accountant: "الإضافة والتعديل — بدون الحذف أو إعدادات النظام",
  viewer: "اطّلاع فقط — لا يمكنه إضافة أو تعديل أو حذف",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

// ===== كلمات المرور =====
// التشفير: scrypt مع ملح عشوائي لكل مستخدم.
// الصيغة: scrypt$<saltBase64>$<hashBase64>

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SCRYPT_SALT_BYTES);
    scrypt(password.normalize("NFKC"), salt, SCRYPT_KEYLEN, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString("base64")}$${derived.toString("base64")}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = (stored ?? "").split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return resolve(false);
    const [, saltB64, hashB64] = parts;
    let salt: Buffer;
    let expected: Buffer;
    try {
      salt = Buffer.from(saltB64, "base64");
      expected = Buffer.from(hashB64, "base64");
    } catch {
      return resolve(false);
    }
    if (expected.length === 0) return resolve(false);
    scrypt(password.normalize("NFKC"), salt, expected.length, (err, derived) => {
      if (err) return resolve(false);
      resolve(derived.length === expected.length && timingSafeEqual(derived, expected));
    });
  });
}

// ===== كوكي الجلسة =====
// التوافق مع src/middleware.ts: التوقيع = base64url(HMAC-SHA256(payloadB64))
// والتمثيل أدناه هو نفسه الذي يتحقق منه الـ middleware على الحافة.

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

export function createSessionToken(user: {
  id: string;
  username: string;
  name: string;
  role: string;
}): string {
  const payload: SessionUser = {
    uid: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
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
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<SessionUser>;
    if (!payload?.uid || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return {
      uid: payload.uid,
      username: payload.username ?? "",
      name: payload.name ?? "",
      role: payload.role ?? "viewer",
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** الجلسة الحالية داخل Server Components و Server Actions */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

// ===== حماية الواجهة (server side) =====

/** يجبر المستخدم على تسجيل الدخول قبل عرض الصفحة */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError("انتهت الجلسة أو لم تسجل الدخول", 401);
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (session.role !== "admin") throw new AuthError("هذه الصفحة متاحة لمدير النظام فقط", 403);
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
