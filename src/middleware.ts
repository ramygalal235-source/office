import { NextRequest, NextResponse } from "next/server";

// ===== حماية الخادم: بوابة الجلسة + صلاحيات الأدوار =====
// يعمل على كل مسارات /api/* (عدا /api/auth):
//  - جلسة صالحة مطلوبة لكل طلب (كوكي موقّع HMAC-SHA256)
//  - viewer   → قراءة فقط (GET) — أي كتابة ترفض بـ 403
//  - accountant → GET/POST/PUT — الحذف DELETE وإدارة المستخدمين والإعدادات والنسخ الاحتياطي للمدير فقط
//  - admin    → كل شيء

const SESSION_SECRET = process.env.SESSION_SECRET || "dafater-almohaseb-local-session-secret-v1";
const COOKIE_NAME = "dafater_session";

// مسارات عامة لا تتطلب جلسة
const PUBLIC_PATHS = ["/api/auth"];

// مسارات كتابية محجوزة للمدير (مدمرة أو إدارية)
const ADMIN_WRITE_PREFIXES = [
  "/api/settings", // تعديل الشركة/الضرائب/الترقيم/المستخدمين — للمدير
  "/api/backup", // استعادة/تصفير قاعدة البيانات — للمدير
];

interface SessionPayload {
  uid: string;
  username: string;
  name: string;
  role: string;
  exp: number;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
    const expected = bytesToB64url(new Uint8Array(mac));

    if (expected.length !== sig.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff !== 0) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as SessionPayload;
    if (!payload?.uid || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function deny(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const payload = await verifySessionToken(req.cookies.get(COOKIE_NAME)?.value);
  if (!payload) {
    return deny(401, "انتهت الجلسة أو لم تسجل الدخول — يرجى تسجيل الدخول من جديد");
  }

  const method = req.method.toUpperCase();
  const role = payload.role ?? "viewer";

  if (pathname === "/api/seed") {
    return NextResponse.next();
  }

  if (role === "viewer" && method !== "GET" && method !== "HEAD") {
    return deny(403, "أنت مسجل بحساب «مطالع» — قراءة فقط بدون صلاحية التعديل");
  }

  if (role === "accountant") {
    if (method === "DELETE") {
      return deny(403, "الحذف متاح لمدير النظام فقط — تواصل مع المدير");
    }
    if (method !== "GET" && ADMIN_WRITE_PREFIXES.some((p) => pathname.startsWith(p))) {
      return deny(403, "إعدادات النظام وإدارة المستخدمين والنسخ الاحتياطي متاحة لمدير النظام فقط");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
