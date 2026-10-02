import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue, optText } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(200).optional(),
  accountId: optText(30),
  bankName: optText(150),
  accountNumber: optText(50),
  iban: optText(50),
  branch: optText(120),
  isActive: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .optional(),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const existing = await db.safe.findUnique({ where: { id } });
    if (!existing) return fail("الخزينة غير موجودة", 404);

    const data = parsed.data;
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      if (data[key] === undefined) delete data[key];
    }

    const user = getSessionUser(req);
    const updated = await db.safe.update({ where: { id }, data });
    await auditLog("UPDATE", "Safe", id, `تعديل ${updated.name}`, user?.username);
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const existing = await db.safe.findUnique({
      where: { id },
      include: { _count: { select: { payments: true } } },
    });
    if (!existing) return fail("الخزينة غير موجودة", 404);
    if (existing._count.payments > 0)
      return fail("توجد حركات على هذه الخزينة — لا يمكن حذفها", 400);

    const user = getSessionUser(req);
    await db.safe.delete({ where: { id } });
    await auditLog("DELETE", "Safe", id, `حذف ${existing.name}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
