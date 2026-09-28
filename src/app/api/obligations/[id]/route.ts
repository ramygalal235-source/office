import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { obligationSchema } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    // PUT يقبل تعديلًا جزئيًا: الحقول غير المُرسلة تبقى كما هي
    const parsed = obligationSchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const existing = await db.taxObligation.findUnique({ where: { id } });
    if (!existing) return fail("الالتزام غير موجود", 404);

    const data = parsed.data;
    // نحذف الحقول غير المُرسلة فقط — الباقي يُحدَّث
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      if (data[key] === undefined) delete data[key];
    }
    // عند الإقرار بالسداد نثبّت تاريخ التنفيذ تلقائيًا
    const nextStatus = data.status ?? existing.status;
    const fulfilledAt =
      nextStatus === "PAID" || nextStatus === "FILED"
        ? existing.fulfilledAt ?? new Date()
        : nextStatus === "PENDING"
          ? null
          : existing.fulfilledAt;

    const user = getSessionUser(req);
    const updated = await db.taxObligation.update({ where: { id }, data: { ...data, fulfilledAt } });
    await auditLog("UPDATE", "TaxObligation", id, `تحديث التزام: ${updated.title}`, user?.username);
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const existing = await db.taxObligation.findUnique({ where: { id } });
    if (!existing) return fail("الالتزام غير موجود", 404);

    const user = getSessionUser(req);
    await db.taxObligation.delete({ where: { id } });
    await auditLog("DELETE", "TaxObligation", id, `حذف التزام: ${existing.title}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
