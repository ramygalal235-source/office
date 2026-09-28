import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1, "اسم الحساب مطلوب").max(200).optional(),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]).optional(),
  isActive: z.union([z.boolean(), z.string()]).optional(),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const existing = await db.account.findUnique({ where: { id } });
    if (!existing) return fail("الحساب غير موجود", 404);
    if (existing.isSystem)
      return fail("هذا حساب من شجرة الحسابات القياسية — لا يمكن تعديله", 400);

    const data = parsed.data;
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      if (data[key] === undefined) delete data[key];
    }

    const user = getSessionUser(req);
    const updated = await db.account.update({ where: { id }, data });
    await auditLog("UPDATE", "Account", id, `تعديل حساب ${updated.code}`, user?.username);
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const existing = await db.account.findUnique({
      where: { id },
      include: { _count: { select: { children: true, journalLines: true } } },
    });
    if (!existing) return fail("الحساب غير موجود", 404);

    if (existing._count.journalLines > 0)
      return fail("لا يمكن حذف حساب له حركة في قيود اليومية — عطّله بدل حذفه", 400);
    if (existing._count.children > 0) return fail("لا يمكن حذف حساب له حسابات فرعية", 400);

    const user = getSessionUser(req);
    await db.account.delete({ where: { id } });
    await auditLog("DELETE", "Account", id, `حذف حساب ${existing.code}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
