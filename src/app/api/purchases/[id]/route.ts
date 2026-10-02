import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const purchase = await db.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        company: { select: { id: true, nameAr: true } },
        items: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!purchase) return fail("فاتورة الشراء غير موجودة", 404);
    return ok(purchase);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const purchase = await db.purchase.findUnique({ where: { id } });
    if (!purchase) return fail("فاتورة الشراء غير موجودة", 404);
    if (purchase.journalPosted)
      return fail("فاتورة الشراء مرحّلة — عكس القيد أولًا قبل حذفها", 400);

    const user = getSessionUser(req);
    await db.purchase.delete({ where: { id } });
    await auditLog("DELETE", "Purchase", id, `حذف فاتورة شراء ${purchase.purchaseNumber}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
