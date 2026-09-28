import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        company: { select: { id: true, nameAr: true } },
        items: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!invoice) return fail("الفاتورة غير موجودة", 404);
    return ok(invoice);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) return fail("الفاتورة غير موجودة", 404);
    if (invoice.journalPosted)
      return fail("الفاتورة مرحّلة — عكس القيد أولًا قبل حذفها", 400);

    const user = getSessionUser(req);
    await db.invoice.delete({ where: { id } });
    await auditLog("DELETE", "Invoice", id, `حذف فاتورة ${invoice.invoiceNumber}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
