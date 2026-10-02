// ===== خدمة الفوترة الإلكترونية: إرسال فواتير النظام إلى هيئة الضرائب =====
// تُستخدم من معالجات الأتمتة (قواعد invoice.posted) ومن شاشة الفواتير
// (إرسال/تحديث يدوي). كل نتيجة تُسجَّل حدثًا في سجل الأحداث وتُنشأ
// إشعارًا للمدير عند الحاجة.
import { db } from "@/lib/db";
import { appendEvent } from "@/lib/automation/event-log";
import {
  EtaError,
  getEtaSettings,
  getDocumentDetails,
  isEtaConfigured,
  submitDocument,
} from "@/lib/eta/client";
import { EtaMapperError, invoiceToEtaDocument } from "@/lib/eta/mapper";

const SUBMITTED = "SUBMITTED";
const ACCEPTED = "ACCEPTED";
const REJECTED = "REJECTED";

type LoadedInvoice = {
  id: string;
  invoiceNumber: string;
  date: Date;
  dueDate: Date | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  etaStatus: string | null;
  etaDocUuid: string | null;
  customer: { name: string; taxNumber: string | null; address: string | null; city: string | null } | null;
  company: {
    nameAr: string;
    nameEn: string | null;
    taxNumber: string | null;
    address: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    activity: string | null;
    electronicInvoiceId: string | null;
  } | null;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
    lineNet: number;
    lineTax: number;
    lineTotal: number;
    product: { code: string; unit: string } | null;
  }[];
};

async function loadInvoice(invoiceId: string): Promise<LoadedInvoice | null> {
  return db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      date: true,
      dueDate: true,
      subtotal: true,
      discount: true,
      taxRate: true,
      taxAmount: true,
      totalAmount: true,
      notes: true,
      etaStatus: true,
      etaDocUuid: true,
      customer: { select: { name: true, taxNumber: true, address: true, city: true } },
      company: {
        select: {
          nameAr: true,
          nameEn: true,
          taxNumber: true,
          address: true,
          city: true,
          phone: true,
          email: true,
          activity: true,
          electronicInvoiceId: true,
        },
      },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          description: true,
          quantity: true,
          unitPrice: true,
          discount: true,
          taxRate: true,
          lineNet: true,
          lineTax: true,
          lineTotal: true,
          product: { select: { code: true, unit: true } },
        },
      },
    },
  });
}

async function notify(kind: string, severity: string, title: string, body: string | null, link: string | null) {
  await db.notification
    .create({ data: { kind, severity, title, body, link } })
    .catch(() => {});
}

/** إرسال فاتورة مرخّلة إلى الهيئة (إصدار 0.9). آمن لإعادة التنفيذ. */
export async function submitInvoiceToEta(
  invoiceId: string,
  actor: string = "automation"
): Promise<{ ok: boolean; message: string; skipped?: boolean }> {
  const inv = await loadInvoice(invoiceId);
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.etaStatus === SUBMITTED || inv.etaStatus === ACCEPTED) {
    return {
      ok: true,
      skipped: true,
      message: `الفاتورة ${inv.invoiceNumber} مرسلة بالفعل للحالة «${inv.etaStatus}» — لم يُكرر الإرسال.`,
    };
  }

  const settings = await getEtaSettings();
  if (!isEtaConfigured(settings)) {
    await notify(
      "ETA",
      "warning",
      "فاتورة جاهزة للفوترة الإلكترونية",
      `الفاتورة ${inv.invoiceNumber} مرخّلة لكن إعدادات هيئة الضرائب غير مكتملة — أكملها من الإعدادات ← الفوترة الإلكترونية.`,
      "/settings"
    );
    return {
      ok: false,
      skipped: true,
      message: "إعدادات الهيئة غير مكتملة — أكمل بيانات العميل من الإعدادات ← الفوترة الإلكترونية.",
    };
  }

  if (!inv.company) {
    return { ok: false, message: "الفاتورة غير مرتبطة بشركة عميل — لا يمكن تحديد الجهة المصدرة." };
  }

  let doc: Record<string, unknown>;
  try {
    doc = invoiceToEtaDocument(
      {
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        dueDate: inv.dueDate,
        subtotal: inv.subtotal,
        discount: inv.discount,
        taxRate: inv.taxRate,
        taxAmount: inv.taxAmount,
        totalAmount: inv.totalAmount,
        // النظام يصدر بالجنيه المصري فقط — الرقابة النهائية على العملة في الماسح
        currency: "EGP",
        notes: inv.notes,
      },
      inv.company,
      inv.customer,
      inv.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discount: it.discount,
        taxRate: it.taxRate,
        lineNet: it.lineNet,
        lineTax: it.lineTax,
        lineTotal: it.lineTotal,
        productCode: it.product?.code ?? null,
        productUnit: it.product?.unit ?? null,
      })),
      settings
    );
  } catch (e) {
    const msg = e instanceof EtaMapperError ? e.message : "تعذّر تحويل الفاتورة لصيغة الهيئة.";
    await db.invoice.update({
      where: { id: inv.id },
      data: { etaStatus: REJECTED, etaError: msg, etaStatusAt: new Date() },
    });
    return { ok: false, message: msg };
  }

  let result;
  try {
    result = await submitDocument(settings, doc);
  } catch (e) {
    const msg = e instanceof EtaError ? e.message : "تعذّر الاتصال بالهيئة.";
    await db.invoice.update({ where: { id: inv.id }, data: { etaStatus: "FAILED", etaError: msg, etaStatusAt: new Date() } });
    await notify("ETA", "critical", "فشل إرسال فاتورة للهيئة", `الفاتورة ${inv.invoiceNumber}: ${msg}`, `/invoices`);
    return { ok: false, message: msg };
  }

  const accepted = result.accepted[0];
  if (accepted) {
    await db.invoice.update({
      where: { id: inv.id },
      data: {
        etaStatus: SUBMITTED,
        etaDocUuid: accepted.uuid,
        etaSubmission: result.submissionUUID,
        etaStatusAt: new Date(),
        etaError: null,
      },
    });
    await appendEvent({
      action: "ETA_SUBMIT",
      entity: "Invoice",
      entityId: inv.id,
      actorType: "automation",
      actor,
      summary: `إرسال الفاتورة ${inv.invoiceNumber} إلى هيئة الضرائب (دفعة ${result.submissionUUID.slice(0, 8)}…)`,
    });
    await notify("ETA", "info", "أُرسلت فاتورة إلى الهيئة", `الفاتورة ${inv.invoiceNumber} قيد التحقق لدى هيئة الضرائب.`, `/invoices`);
    return { ok: true, message: `أُرسلت الفاتورة إلى الهيئة بنجاح — الرقم المرجعي ${accepted.uuid}.` };
  }

  const err = result.rejected[0]?.error ?? "رفضت الهيئة المستند دون تفصيل.";
  await db.invoice.update({
    where: { id: inv.id },
    data: { etaStatus: REJECTED, etaSubmission: result.submissionUUID, etaError: err, etaStatusAt: new Date() },
  });
  await notify("ETA", "critical", "رفضت الهيئة فاتورة", `الفاتورة ${inv.invoiceNumber}: ${err}`, `/invoices`);
  return { ok: false, message: `رفضت الهيئة المستند: ${err}` };
}

/** تحديث حالة فاتورة مرسلة من الهيئة (استطلاع دوري أو يدوي). */
export async function refreshInvoiceEtaStatus(
  invoiceId: string,
  actor: string = "automation"
): Promise<{ ok: boolean; message: string }> {
  const inv = await loadInvoice(invoiceId);
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (!inv.etaDocUuid) {
    return { ok: false, message: "الفاتورة غير مرسلة إلى الهيئة بعد — أرسلها أولًا." };
  }
  if (inv.etaStatus === ACCEPTED) {
    return { ok: true, message: `الفاتورة ${inv.invoiceNumber} مقبولة لدى الهيئة بالفعل.` };
  }

  const settings = await getEtaSettings();
  let data: Record<string, any>;
  try {
    data = (await getDocumentDetails(settings, inv.etaDocUuid)) as Record<string, any>;
  } catch (e) {
    const msg = e instanceof EtaError ? e.message : "تعذّر الاتصال بالهيئة.";
    return { ok: false, message: msg };
  }

  // شكل الاستجابة قد يختلف بين بيئات الهيئة — نقرأ بحذر من أكثر من موضع محتمل
  const rawStatus = String(data?.document?.status ?? data?.status ?? "").toUpperCase();
  const validation: any[] = Array.isArray(data?.validationResults)
    ? data.validationResults
    : Array.isArray(data?.document?.validationResults)
      ? data.document.validationResults
      : [];
  const hardErrors = validation.filter(
    (v) => v && (v.error || ["FAIL", "REJECTED", "INVALID"].includes(String(v.result ?? "").toUpperCase()))
  );

  if (["ACCEPTED", "VALID", "PUBLISHED"].includes(rawStatus) || (rawStatus === "" && validation.length > 0 && hardErrors.length === 0)) {
    if (inv.etaStatus !== ACCEPTED) {
      await db.invoice.update({ where: { id: inv.id }, data: { etaStatus: ACCEPTED, etaStatusAt: new Date(), etaError: null } });
      await appendEvent({
        action: "ETA_ACCEPTED",
        entity: "Invoice",
        entityId: inv.id,
        actorType: "automation",
        actor,
        summary: `قبول هيئة الضرائب للفاتورة ${inv.invoiceNumber} (الرقم المرجعي ${inv.etaDocUuid})`,
      });
      await notify("ETA", "info", "قبلت الهيئة فاتورة", `الفاتورة ${inv.invoiceNumber} مقبولة الآن لدى هيئة الضرائب.`, `/invoices`);
    }
    return { ok: true, message: `قبلت الهيئة الفاتورة ${inv.invoiceNumber}.` };
  }

  const firstError = hardErrors[0]
    ? String(hardErrors[0].error ?? hardErrors[0].message ?? "مرفوضة من الهيئة")
    : ["REJECTED", "INVALID"].includes(rawStatus)
      ? "رفضت الهيئة المستند."
      : null;

  if (firstError) {
    if (inv.etaStatus !== REJECTED) {
      await db.invoice.update({
        where: { id: inv.id },
        data: { etaStatus: REJECTED, etaError: firstError.slice(0, 400), etaStatusAt: new Date() },
      });
      await appendEvent({
        action: "ETA_REJECTED",
        entity: "Invoice",
        entityId: inv.id,
        actorType: "automation",
        actor,
        summary: `رفض هيئة الضرائب للفاتورة ${inv.invoiceNumber}: ${firstError.slice(0, 120)}`,
      });
      await notify("ETA", "critical", "رفضت الهيئة فاتورة", `الفاتورة ${inv.invoiceNumber}: ${firstError}`, `/invoices`);
    }
    return { ok: false, message: firstError };
  }

  return { ok: true, message: `الفاتورة ${inv.invoiceNumber} لا تزال قيد التحقق لدى الهيئة.` };
}

/** استطلاع كل الفواتير المرسلة (يُستخدم من قاعدة الجدولة). */
export async function pollEtaStatuses(): Promise<{ checked: number; accepted: number; rejected: number }> {
  const pending = await db.invoice.findMany({
    where: { etaStatus: SUBMITTED, etaDocUuid: { not: null } },
    select: { id: true },
    take: 50,
    orderBy: { etaStatusAt: "asc" },
  });
  let accepted = 0;
  let rejected = 0;
  for (const row of pending) {
    const r = await refreshInvoiceEtaStatus(row.id, "automation:eta.poll_statuses");
    if (r.ok) accepted++;
    else rejected++;
  }
  return { checked: pending.length, accepted, rejected };
}
