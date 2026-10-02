import { NextRequest } from "next/server";
import { fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { verifyChain } from "@/lib/automation/event-log";

/** التحقق من سلامة سلسلة سجل الأحداث — كشف أي عبث بالبيانات السابقة */
export async function GET(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("لا توجد جلسة صالحة", 401);
    if (user.role !== "admin") return fail("مدير النظام فقط", 403);

    const result = await verifyChain();
    return ok(result);
  } catch (e) {
    return handleDbError(e);
  }
}
