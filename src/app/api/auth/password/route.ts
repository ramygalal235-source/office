import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { clearAttempts, clientKey, registerFailure, tooManyAttempts } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("لا توجد جلسة صالحة", 401);

    const body = (await req.json().catch(() => null)) as
      | { currentPassword?: string; newPassword?: string }
      | null;
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");

    if (newPassword.length < 6) {
      return fail("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل", 400);
    }

    const key = clientKey(req, `pw:${user.uid}`);
    if (tooManyAttempts(key)) {
      return fail("محاولات كثيرة — انتظر 15 دقيقة", 429);
    }

    const record = await db.user.findUnique({ where: { id: user.uid } });
    if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
      registerFailure(key);
      return fail("كلمة المرور الحالية غير صحيحة", 401);
    }
    clearAttempts(key);

    await db.user.update({
      where: { id: user.uid },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await auditLog("PASSWORD_CHANGE", "User", user.uid, "تغيير كلمة المرور", user.username);

    // إن كان المدير غيّر كلمة المرور الافتراضية، يسقط التنبيه الأمني
    if (record.role === "admin") {
      await db.setting.deleteMany({ where: { key: "security.defaultCreds" } }).catch(() => {});
    }

    return ok({ changed: true });
  } catch (e) {
    return handleDbError(e);
  }
}
