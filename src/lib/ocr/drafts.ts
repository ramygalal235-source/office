// ===== من الاستخراج المعتمد إلى مستند محاسبي مسودة =====
// المبدأ: الاعتماد يولّد مسودة (DRAFT) فقط — لا شيء يرحَّل إلى قيود اليومية آليًا،
// لأن الترحيل قرار محاسب يحمل توقيعًا. المراجعة البشرية تبقى عند بوابة الترحيل.
import { db } from "@/lib/db";
import { generateNumber } from "@/lib/accounting/api";
import { round2 } from "@/lib/money";
import { DOCUMENT_TYPES } from "@/lib/domain";
import { fieldByKey, type OcrField } from "./prompt";

export interface CreatedDraft {
  kind: "INVOICE" | "PURCHASE" | "PAYMENT";
  id: string;
  number: string;
}

function num(fields: OcrField[], key: string): number {
  const v = fieldByKey(fields, key)?.value;
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? round2(n) : 0;
}

function dateOf(fields: OcrField[]): Date {
  const v = fieldByKey(fields, "date")?.value;
  const d = typeof v === "string" ? new Date(`${v}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

async function findOrCreateParty(name: string, type: "CUSTOMER" | "SUPPLIER") {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const exact = await db.party.findFirst({ where: { type, name: { equals: trimmed } } });
  if (exact) return exact;
  const loose = await db.party.findFirst({ where: { type, name: { contains: trimmed } }, orderBy: { createdAt: "asc" } });
  if (loose) return loose;

  const party = await db.party.create({
    data: {
      code: await generateNumber("PARTY"),
      name: trimmed,
      type,
      notes: "أُنشئت تلقائيًا عند اعتماد وثيقة استُخرِجت آليًا",
    },
  });
  return party;
}

const DRAFT_NOTE = "مستخرجة آليًا من وثيقة DMS — بانتظار مراجعة المحاسب والترحيل";

/** ينشئ مسودة المستند المناسب لنوع الوثيقة، أو null إن لم يكن للنوع مستند مقابل */
export async function createDraftFromExtraction(
  documentId: string,
  docTitle: string,
  docType: string,
  clientId: string | null,
  fields: OcrField[],
  username: string
): Promise<CreatedDraft | null> {
  const type = (DOCUMENT_TYPES as readonly string[]).includes(docType) ? docType : "OTHER";
  const date = dateOf(fields);

  if (type === "INVOICE") {
    const party = await findOrCreateParty(String(fieldByKey(fields, "party_name")?.value ?? ""), "CUSTOMER");
    const total = num(fields, "total_amount") || num(fields, "net_amount");
    const tax = num(fields, "tax_amount");
    const net = num(fields, "net_amount") || (total - tax);
    const invoice = await db.invoice.create({
      data: {
        companyId: clientId,
        invoiceNumber: await generateNumber("INVOICE"),
        customerId: party?.id ?? null,
        date,
        totalAmount: total,
        taxAmount: tax,
        subtotal: net,
        taxRate: net > 0 && tax > 0 ? round2((tax / net) * 100) : 0,
        status: "DRAFT",
        notes: `${DRAFT_NOTE} (${docTitle})`,
        sourceDocumentId: documentId,
        createdBy: username,
      },
    });
    return { kind: "INVOICE", id: invoice.id, number: invoice.invoiceNumber };
  }

  if (type === "PURCHASE_INVOICE") {
    const party = await findOrCreateParty(String(fieldByKey(fields, "party_name")?.value ?? ""), "SUPPLIER");
    const total = num(fields, "total_amount") || num(fields, "net_amount");
    const tax = num(fields, "tax_amount");
    const net = num(fields, "net_amount") || (total - tax);
    const purchase = await db.purchase.create({
      data: {
        companyId: clientId,
        purchaseNumber: await generateNumber("PURCHASE"),
        supplierId: party?.id ?? null,
        date,
        totalAmount: total,
        taxAmount: tax,
        subtotal: net,
        taxRate: net > 0 && tax > 0 ? round2((tax / net) * 100) : 0,
        status: "DRAFT",
        notes: `${DRAFT_NOTE} (${docTitle})`,
        sourceDocumentId: documentId,
        createdBy: username,
      },
    });
    return { kind: "PURCHASE", id: purchase.id, number: purchase.purchaseNumber };
  }

  if (type === "RECEIPT") {
    const party = await findOrCreateParty(String(fieldByKey(fields, "party_name")?.value ?? ""), "CUSTOMER");
    const amount = num(fields, "total_amount") || num(fields, "net_amount");
    const payment = await db.payment.create({
      data: {
        number: await generateNumber("PAYMENT_IN"),
        type: "IN",
        partyId: party?.id ?? null,
        date,
        amount,
        method: "CASH",
        reference: fieldByKey(fields, "document_number")?.value != null ? String(fieldByKey(fields, "document_number")?.value) : null,
        sourceDocumentId: documentId,
        notes: `${DRAFT_NOTE} (${docTitle})`,
        createdBy: username,
      },
    });
    return { kind: "PAYMENT", id: payment.id, number: payment.number };
  }

  return null;
}
