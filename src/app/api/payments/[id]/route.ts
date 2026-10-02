import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const payment = await db.payment.findUnique({
      where: { id },
      include: { party: true, safe: true },
    });
    if (!payment) return fail("السند غير موجود", 404);
    return ok(payment);
  } catch (e) {
    return handleDbError(e);
  }
}

/** حذف سند — ممنوع بعد الترحيل حفاظًا على سلامة قيود اليومية */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;

    const payment = await db.payment.findUnique({ where: { id } });
    if (!payment) return fail("السند غير موجود", 404);

    const entry = await db.journalEntry.findFirst({
      where: { sourceType: "PAYMENT", sourceId: id, status: { in: ["POSTED", "REVERSED"] } },
      select: { id: true },
    });
    if (entry) return fail("السند مرحّل إلى قيود اليومية — عكس القيد أولًا قبل حذفه", 400);

    await db.payment.delete({ where: { id } });
    await auditLog("DELETE", "Payment", id, `حذف سند ${payment.number}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
