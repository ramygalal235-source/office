import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { record } from "@/lib/automation/event-log";
import { deleteUpload } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await db.dmsDocument.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, nameAr: true } },
        engagement: { include: { service: { select: { id: true, name: true } } } },
        versions: { orderBy: { version: "desc" } },
        extractions: { orderBy: { createdAt: "desc" } },
        invoices: { select: { id: true, invoiceNumber: true, status: true }, take: 10 },
        purchases: { select: { id: true, purchaseNumber: true, status: true }, take: 10 },
        payments: { select: { id: true, number: true, type: true }, take: 10 },
      },
    });
    if (!doc) return fail("الوثيقة غير موجودة", 404);
    return ok(doc);
  } catch (e) {
    return handleDbError(e);
  }
}

/** حذف الوثيقة وملفاتها — للمدير فقط (التوسط يحمي باقي الأدوار) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getSessionUser(req);
    if (!user || user.role !== "admin") return fail("الحذف متاح للمدير فقط", 403);
    const { id } = await params;

    const doc = await db.dmsDocument.findUnique({
      where: { id },
      include: { versions: true },
    });
    if (!doc) return fail("الوثيقة غير موجودة", 404);

    for (const v of doc.versions) await deleteUpload(v.storagePath);

    await db.dmsDocument.delete({ where: { id } });
    await record({
      action: "document.deleted",
      entity: "DmsDocument",
      summary: `حذف وثيقة: ${doc.title} (${doc.checksum.slice(0, 12)})`,
      actorType: "user",
      actor: user.username,
    });
    return ok({ id });
  } catch (e) {
    return handleDbError(e);
  }
}
