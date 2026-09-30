// ===== تحويل فاتورة النظام إلى مستند فوترة إلكترونية (إصدار 0.9) =====
// الصيغة الرسمية: https://sdk.invoicing.eta.gov.eg/ (invoice version 0.9)
// الإصدار 0.9 مطابق للـ 1.0 إلا أن التحقق من التوقيع معطّل — لذلك نرسل
// بلا قسم signatures إلى أن تتوفّر شهادة الختم الإلكتروني (eSeal).
import type { EtaSettings } from "@/lib/eta/client";
import { round2 } from "@/lib/money";

// أنواع بنية الفاتورة كما هي في القاعدة (توافق بنيوي — بدون استيراد @prisma/client)
export type EtaInvoiceRow = {
  invoiceNumber: string;
  date: Date;
  dueDate: Date | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  notes: string | null;
};

export type EtaIssuerRow = {
  nameAr: string;
  nameEn: string | null;
  taxNumber: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  activity: string | null;
  electronicInvoiceId: string | null;
};

export type EtaReceiverRow = {
  name: string;
  taxNumber: string | null;
  address: string | null;
  city: string | null;
};

export type EtaItemRow = {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineNet: number;
  lineTax: number;
  lineTotal: number;
  productCode: string | null;
  productUnit: string | null;
};

export class EtaMapperError extends Error {}

const toUtcIso = (d: Date) => new Date(d.getTime() + d.getTimezoneOffset() * 60000).toISOString();

/**
 * يبني جسم المستند حسب صيغة ETA.
 * mvdType: "B" لمبيعات الأعمال و "C" للخدمات (documentType i)
 */
export function invoiceToEtaDocument(
  inv: EtaInvoiceRow,
  issuer: EtaIssuerRow,
  receiver: EtaReceiverRow | null,
  items: EtaItemRow[],
  settings: EtaSettings
): Record<string, unknown> {
  if (items.length === 0) {
    throw new EtaMapperError("لا يمكن إرسال فاتورة بلا بنود — أضف بندًا واحدًا على الأقل.");
  }
  if (!issuer.taxNumber || !/^\d{11}$/.test(issuer.taxNumber)) {
    throw new EtaMapperError("الجهة المصدرة (شركة العميل) بلا رقم ضريبي سليم (11 رقمًا) — أكمل ملف الشركة أولًا.");
  }
  if (inv.currency !== "EGP") {
    throw new EtaMapperError(`الفاترة بالعملة ${inv.currency} — تُرسل الهيئة الفواتير بالجنيه المصري فقط.`);
  }

  // ===== المُصدر =====
  const issuerBlock: Record<string, unknown> = {
    type: "B",
    id: issuer.taxNumber,
    name: issuer.nameAr,
    address: {
      branchId: settings.branchId || "0",
      country: "EG",
      governate: settings.governorate || "000",
      regionCity: issuer.city ?? "",
      street: issuer.address ?? "",
    },
  };
  if (issuer.email) issuerBlock.email = issuer.email;
  if (issuer.phone) issuerBlock.phone = issuer.phone;

  // ===== المُستلم =====
  const isBusiness = !!receiver?.taxNumber && /^\d{11}$/.test(receiver.taxNumber);
  const receiverBlock: Record<string, unknown> = isBusiness
    ? { type: "B", id: receiver!.taxNumber, name: receiver!.name }
    : { type: "P", name: receiver?.name ?? "" };
  if (receiver?.address || receiver?.city) {
    receiverBlock.address = {
      branchId: "0",
      country: "EG",
      governate: settings.governorate || "000",
      regionCity: receiver.city ?? "",
      street: receiver.address ?? "",
    };
  }

  // ===== البنود =====
  const etaLines = items.map((it, idx) => {
    const line: Record<string, unknown> = {
      description: it.description || `بند ${idx + 1}`,
      itemType: "EGS",
      itemCode: it.productCode ?? `IT${String(idx + 1).padStart(2, "0")}`,
      unitType: settings.unitType || "001",
      quantity: Number(it.quantity.toFixed(5)),
      unitValue: {
        currencySold: "EGP",
        amountEGP: round2(it.unitPrice),
        amountSold: round2(it.unitPrice),
      },
      salesTotal: round2(it.lineNet + it.discount),
      netTotal: round2(it.lineNet),
      total: round2(it.lineTotal),
    };
    if (it.discount > 0) {
      line.itemsDiscount = round2(it.discount);
      line.discount = { amount: round2(it.discount) };
    }
    if (it.taxRate > 0 && it.lineTax > 0) {
      line.taxableItems = [
        {
          taxType: "123", // ضريبة القيمة المضافة
          rate: it.taxRate,
          amount: round2(it.lineTax),
        },
      ];
    }
    return line;
  });

  // ===== المستند =====
  const doc: Record<string, unknown> = {
    issuer: issuerBlock,
    receiver: receiverBlock,
    documentType: "i",
    documentTypeVersion: "0.9",
    dateTimeIssued: toUtcIso(inv.date),
    taxpayerActivityCode: settings.activityCode || "",
    internalId: inv.invoiceNumber,
    invoiceLines: etaLines,
    totalSalesAmount: round2(inv.subtotal + inv.discount),
    totalDiscountAmount: round2(inv.discount),
    netAmount: round2(inv.subtotal),
    extraDiscountAmount: 0,
    totalItemsDiscountAmount: round2(inv.discount),
    totalAmount: Number(inv.totalAmount.toFixed(5)),
  };
  if (inv.taxAmount > 0) {
    doc.taxTotals = [{ taxType: "123", amount: round2(inv.taxAmount) }];
  }
  if (inv.dueDate) {
    doc.payment = { paymentMethod: "1", dueDate: toUtcIso(inv.dueDate) };
  }

  // توقيع الصيغ: مبالغ المستند يجب أن تتطابق مع البنود (تحقق داخلي بسيط)
  const sumTotal = items.reduce((a, b) => a + b.lineTotal, 0);
  if (Math.abs(sumTotal - inv.totalAmount) > 0.05) {
    throw new EtaMapperError(
      `مجموع البنود (${sumTotal.toFixed(2)}) لا يطابق إجمال الفاتورة (${inv.totalAmount.toFixed(2)}) — صحّح الفاتورة أولًا.`
    );
  }
  return doc;
}
