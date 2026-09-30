import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";

type Ctx = { params: Promise<{ id: string }> };

/** تفعيل/إغلاق/حذف موازنة — للمدير */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  if (!body?.status || !["DRAFT", "ACTIVE", "CLOSED"].includes(body.status)) return fail("حالة غير معروفة", 400);
  try {
    const budget = await db.budget.update({ where: { id }, data: { status: body.status }, include: { lines: true } });
    await auditLog("UPDATE", "Budget", id, `تغيير حالة موازنة إلى ${body.status}`, admin);
    return ok(budget);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(_req);
  if (!admin) return fail("الحذف متاح لمدير النظام فقط", 403);
  const { id } = await params;
  try {
    const budget = await db.budget.findUnique({ where: { id } });
    if (!budget) return fail("الموازنة غير موجودة", 404);
    if (budget.status === "CLOSED") return fail("موازنة مغلقة — لا يمكن حذفها (سجل محاسبي)", 409);
    await db.budget.delete({ where: { id } });
    await auditLog("DELETE", "Budget", id, `حذف ${budget.name}`, admin);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
