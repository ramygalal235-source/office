import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { getHandler } from "@/lib/automation/handlers";

/**
 * (إعادة) توليد قائمة مهام ملف العمل من قوالب الخدمة — يدويًا.
 * المعالج idempotent: (ملف + كود القالب) لا يتكرر، فيُضاف فقط ما فات.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const engagement = await db.engagement.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!engagement) return fail("ملف العمل غير موجود", 404);

    const handler = getHandler("engagement.generate_checklist");
    if (!handler) return fail("معالج التوليد غير مسجل", 500);

    const result = await handler({ engagementId: id });
    const user = getSessionUser(_req);
    await auditLog("UPDATE", "Engagement", id, `(إعادة) توليد قائمة المهام: ${engagement.title}`, user?.username);
    return ok(result);
  } catch (e) {
    return handleDbError(e);
  }
}
