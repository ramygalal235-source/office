import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@//lib/accounting/api";
import { refreshInvoiceEtaStatus, submitInvoiceToEta } from "@/lib/eta/service";

type Ctx = { params: Promise<{ id: string }> };

/** حالة الفاتورة لدى هيئة الضرائب (لأي مسجَّل داخلي) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const inv = await db.invoice.findUnique({
      where: { id },
      select: {
        etaStatus: true,
        etaDocUuid: true,
        etaSubmission: true,
        etaStatusAt: true,
        etaError: true,
        journalPosted: true,
      },
    });
    if (!inv) return fail("الفاتورة غير موجودة", 404);
    return ok(inv);
  } catch (e) {
    return handleDbError(e);
  }
}

/** إرسال الفاتورة للهيئة أو تحديث حالتها (صلاحية المدير — فعل له أثر قانوني) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة لإرسال الفواتير للهيئة", 403);

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action ?? "submit";

  try {
    if (action === "refresh") {
      const result = await refreshInvoiceEtaStatus(id, admin.username);
      await auditLog("ETA_REFRESH", "Invoice", id, `تحديث حالة الفوترة الإلكترونية: ${result.message}`, admin.username);
      return ok(result, { ok: result.ok });
    }
    if (action !== "submit") return fail("إجراء غير معروف", 400);

    const result = await submitInvoiceToEta(id, admin.username);
    await auditLog("ETA_SUBMIT", "Invoice", id, `إرسال الفاتورة للهيئة: ${result.message}`, admin.username);
    if (!result.ok && !result.skipped) return fail(result.message, 400);
    return ok(result, { ok: result.ok });
  } catch (e) {
    return handleDbError(e);
  }
}
