import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { taskSchema } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    // PUT يقبل تعديلًا جزئيًا: الحقول غير المُرسلة تبقى كما هي
    const parsed = taskSchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const existing = await db.officeTask.findUnique({ where: { id } });
    if (!existing) return fail("المهمة غير موجودة", 404);

    const data = parsed.data;
    // نحذف الحقول غير المُرسلة فقط — الباقي يُحدَّث
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      if (data[key] === undefined) delete data[key];
    }
    // تاريخ الإغلاق يُضبط مرة واحدة عند أول تحويل إلى «مكتملة»
    const nextStatus = data.status ?? existing.status;
    const completedAt =
      nextStatus === "DONE"
        ? existing.completedAt ?? new Date()
        : nextStatus === "TODO"
          ? null
          : existing.completedAt;

    const user = getSessionUser(req);
    const updated = await db.officeTask.update({
      where: { id },
      data: { ...data, completedAt },
    });
    await auditLog("UPDATE", "OfficeTask", id, `تحديث مهمة: ${updated.title}`, user?.username);
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const existing = await db.officeTask.findUnique({ where: { id } });
    if (!existing) return fail("المهمة غير موجودة", 404);

    const user = getSessionUser(req);
    await db.officeTask.delete({ where: { id } });
    await auditLog("DELETE", "OfficeTask", id, `حذف مهمة: ${existing.title}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
