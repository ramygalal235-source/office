import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { auditLog, fail, handleDbError, ok } from "@/lib/accounting/api";
import { clientKey, clearAttempts, registerFailure, tooManyAttempts } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!username || !password) {
      return fail("من فضلك أدخل اسم المستخدم وكلمة المرور", 400);
    }

    const key = clientKey(req, username);
    if (tooManyAttempts(key)) {
      return fail("محاولات كثيرة فاشلة — انتظر 15 دقيقة ثم أعد المحاولة", 429);
    }

    const user = await db.user.findUnique({ where: { username } });
    const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordOk) {
      registerFailure(key);
      await auditLog("LOGIN_FAILED", "User", username, "محاولة دخول فاشلة", username);
      return fail("اسم المستخدم أو كلمة المرور غير صحيحة", 401);
    }

    if (!user.isActive) {
      return fail("هذا الحساب موقوف — تواصل مع مدير النظام", 403);
    }

    clearAttempts(key);

    const token = createSessionToken({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    });

    await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await auditLog("LOGIN", "User", user.id, "تسجيل دخول ناجح", user.username);

    const res: NextResponse = ok({
      user: { uid: user.id, username: user.username, name: user.name, role: user.role },
    }) as NextResponse;
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    return handleDbError(e);
  }
}
