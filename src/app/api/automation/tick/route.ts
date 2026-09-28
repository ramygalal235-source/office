import { NextRequest } from "next/server";
import { fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { tick } from "@/lib/automation/runner";

// ===== تشغيل دورة الأتمتة =====
//
// يعمل بأي دور غير «مطالع» (middleware يمنع viewers أصلًا من الكتابة).
// النظام يمرّ هنا كل مرة يفتح فيها أحد المستخدمين لوحة التحكم، فلا
// نحتاج عملية دائمة ولا cron خارجي على جهاز المكتب.

let lastRun = 0;
const THROTTLE_MS = 20_000;

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("لا توجد جلسة صالحة", 401);

    const now = Date.now();
    if (now - lastRun < THROTTLE_MS) {
      return ok({ skipped: true, reason: "تم التشغيل قبل ثوانٍ" });
    }
    lastRun = now;

    const result = await tick({ limit: 10 });
    return ok(result);
  } catch (e) {
    return handleDbError(e);
  }
}
