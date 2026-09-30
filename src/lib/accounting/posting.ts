import { db } from "@/lib/db";
import { generateNumber } from "./api";
import { round2, sumMoney } from "@/lib/money";

// ===== محرك الترحيل =====
// يحوّل المستندات (فواتير البيع والشراء، سندات القبض والصرف) إلى قيود
// يومية متوازنة. كل ترحيل يمر من هنا حتى لا تتناقص قواعد الرصيد في
// أكثر من مكان.
//
// الحسابات المستخدمة قابلة للتغيير من ACCOUNTS دون لمس باقي الكود.

export const ACCOUNTS = {
  cash: "1101", // النقدية بالصندوق
  bank: "1102", // البنوك
  customers: "1103", // العملاء (ذمم مدينة)
  inventory: "1104", // المخزون
  otherReceivables: "1107", // أرصدة مدينة أخرى
  vatInput: "1108", // ضريبة القيمة المضافة (مدخلات)
  suppliers: "2101", // الموردون (ذمم دائنة)
  vatPayable: "2103", // ضريبة القيمة المضافة المستحقة
  salesIncome: "4101", // إيرادات المبيعات
  salesReturns: "4102", // مردودات ومسموحات المبيعات
  costOfGoods: "5101", // تكلفة البضاعة المباعة
  miscExpense: "5299", // مصروفات إدارية وعمومية أخرى
} as const;

export interface PostingLine {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
  partyId?: string | null;
}

export class PostingError extends Error {}

/** يتحقق من توازن القيد قبل كتابته */
export function assertBalanced(lines: PostingLine[], tolerance = 0.01) {
  const debit = sumMoney(lines.map((l) => l.debit ?? 0));
  const credit = sumMoney(lines.map((l) => l.credit ?? 0));
  if (Math.abs(debit - credit) > tolerance) {
    throw new PostingError(
      `القيد غير متوازن: المدين ${debit.toFixed(2)} والدائن ${credit.toFixed(2)}`
    );
  }
  return { debit, credit };
}

/** يحل أكواد الحسابات إلى معرّفات، ويخطئ بوضوح إن كان الحساب مفقودًا */
async function resolveAccounts(codes: string[]) {
  const unique = [...new Set(codes)];
  const accounts = await db.account.findMany({ where: { code: { in: unique } } });
  const map = new Map(accounts.map((a) => [a.code, a.id]));
  const missing = unique.filter((c) => !map.has(c));
  if (missing.length) {
    throw new PostingError(
      `الحسابات التالية غير موجودة في دليل الحسابات: ${missing.join("، ")}. شغّل npm run db:init`
    );
  }
  return map;
}

export interface PostJournalInput {
  date: Date;
  description: string;
  sourceType: string;
  sourceId: string;
  companyId?: string | null;
  lines: PostingLine[];
  createdBy?: string;
  status?: "DRAFT" | "POSTED";
}

export async function postJournal(input: PostJournalInput) {
  const lines = input.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
  if (lines.length < 2) throw new PostingError("القيد يحتاج طرفين على الأقل");

  const { debit, credit } = assertBalanced(lines);
  const accounts = await resolveAccounts(lines.map((l) => l.accountCode));

  const number = await generateNumber("JOURNAL");

  return db.journalEntry.create({
    data: {
      number,
      date: input.date,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      companyId: input.companyId ?? null,
      status: input.status ?? "POSTED",
      totalDebit: debit,
      totalCredit: credit,
      postedAt: input.status === "DRAFT" ? null : new Date(),
      createdBy: input.createdBy ?? "system",
      lines: {
        create: lines.map((l, i) => ({
          accountId: accounts.get(l.accountCode)!,
          debit: round2(l.debit ?? 0),
          credit: round2(l.credit ?? 0),
          description: l.description ?? input.description,
          partyId: l.partyId ?? null,
          sortOrder: i,
        })),
      },
    },
    include: { lines: true },
  });
}

// ===== ترحيل فاتورة البيع =====
// مدين: العملاء (الإجمالي) — دائن: الإيرادات (الصافي) + ض.Value المضافة المستحقة

export async function postInvoice(invoiceId: string, createdBy = "system") {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true },
  });
  if (!invoice) throw new PostingError("الفاتورة غير موجودة");
  if (invoice.journalPosted) throw new PostingError("الفاتورة مرحّلة بالفعل");

  const net = round2(invoice.subtotal - invoice.discount);
  const tax = round2(invoice.taxAmount);
  const total = round2(invoice.totalAmount);

  const lines: PostingLine[] = [
    {
      accountCode: ACCOUNTS.customers,
      debit: total,
      description: `فاتورة بيع ${invoice.invoiceNumber}`,
      partyId: invoice.customerId,
    },
  ];

  // السطور التي لها حساب إيراد مخصص تُرحّل كل واحد على حدة
  const byAccount = new Map<string, number>();
  let remainingNet = net;
  for (const item of invoice.items) {
    if (!item.accountId) continue;
    byAccount.set(item.accountId, round2((byAccount.get(item.accountId) ?? 0) + item.lineNet));
  }
  const knownNet = sumMoney([...byAccount.values()]);
  const genericNet = round2(remainingNet - knownNet);

  if (genericNet > 0) {
    lines.push({
      accountCode: ACCOUNTS.salesIncome,
      credit: genericNet,
      description: `إيراد مبيعات ${invoice.invoiceNumber}`,
    });
  }
  for (const [accountId, amount] of byAccount) {
    lines.push({ accountCode: accountId, credit: amount, description: itemDescription(invoice.items, accountId) });
  }
  if (tax > 0) {
    lines.push({
      accountCode: ACCOUNTS.vatPayable,
      credit: tax,
      description: `ضريبة قيمة مضافة مستحقة ${invoice.invoiceNumber}`,
    });
  }

  // الفرق = (الخصم العام) − (مجموع خصومات السطور): يُرحَّل على حساب مردودات
  // ومسموحات المبيعات (4102) لأننا نُصدر الإيراد بصافي كل سطر بعد خصمه.
  const debitSide = sumMoney(lines.map((l) => l.debit ?? 0));
  const creditSide = sumMoney(lines.map((l) => l.credit ?? 0));
  const diff = round2(debitSide - creditSide);
  if (Math.abs(diff) > 0.01) {
    lines.push({
      accountCode: ACCOUNTS.salesReturns,
      ...(diff > 0 ? { credit: diff } : { debit: -diff }),
      description: "مسموحات وخصومات المبيعات",
    });
  }

  const entry = await postJournal({
    date: invoice.date,
    description: `فاتورة بيع ${invoice.invoiceNumber}`,
    sourceType: "INVOICE",
    sourceId: invoice.id,
    companyId: invoice.companyId,
    createdBy,
    lines,
  });

  await db.invoice.update({
    where: { id: invoice.id },
    data: { journalPosted: true, status: invoice.status === "DRAFT" ? "ISSUED" : invoice.status },
  });

  try {
    await applyStockMovements("INVOICE", invoice.id, "SALE", createdBy);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
    await db.notification
      .create({
        data: {
          kind: "JOB_FAILED",
          severity: "critical",
          title: "فشل تسجيل حركة مخزون",
          body: `الفاتورة ${invoice.invoiceNumber} رُحّلت إلى قيود اليومية لكن حركتها بالمخزون فشلت: ${msg}. سُوِّيت يدويًا من شاشة المنتجات.`,
          link: "/products",
        },
      })
      .catch(() => {});
    throw new PostingError("رُحّلت الفاتورة إلى قيود اليومية لكن حركة المخزون فشلت — سَوِّ المخزون من شاشة المنتجات");
  }

  return entry;
}

function itemDescription(items: { accountId: string | null; description: string }[], accountId: string) {
  const item = items.find((i) => i.accountId === accountId);
  return item?.description ?? "إيراد مبيعات";
}

// ===== ترحيل فاتورة الشراء =====
// مدين: المخزون/التكلفة + ضريبة المدخلات — دائن: الموردون

export async function postPurchase(purchaseId: string, createdBy = "system") {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!purchase) throw new PostingError("فاتورة الشراء غير موجودة");
  if (purchase.journalPosted) throw new PostingError("فاتورة الشراء مرحّلة بالفعل");

  const net = round2(purchase.subtotal - purchase.discount);
  const tax = round2(purchase.taxAmount);
  const total = round2(purchase.totalAmount);

  const lines: PostingLine[] = [];

  // السطور المرتبطة بمنتج تذهب للمخزون، والباقي مصروف
  let inventoryNet = 0;
  let expenseNet = 0;
  for (const item of purchase.items) {
    if (item.productId) inventoryNet = round2(inventoryNet + item.lineNet);
    else expenseNet = round2(expenseNet + item.lineNet);
  }
  // أي فرق بين الصافي ومجموع السطور يذهب للمصروف؛ وإذا انخفض الصافي عن
  // قيمة المخزون (خصم سطر أكبر من الخصم العام) نُنقص المخزون لا نُنشئ سالبًا
  if (net - inventoryNet < 0) {
    inventoryNet = net;
    expenseNet = 0;
  } else {
    expenseNet = round2(net - inventoryNet);
  }

  if (inventoryNet > 0) {
    lines.push({
      accountCode: ACCOUNTS.inventory,
      debit: inventoryNet,
      description: `مشتريات مخزون ${purchase.purchaseNumber}`,
    });
  }
  if (expenseNet > 0) {
    lines.push({
      accountCode: ACCOUNTS.costOfGoods,
      debit: expenseNet,
      description: `تكلفة مشتريات ${purchase.purchaseNumber}`,
    });
  }
  if (tax > 0) {
    lines.push({
      accountCode: ACCOUNTS.vatInput,
      debit: tax,
      description: `ضريبة قيمة مضافة مدخلات ${purchase.purchaseNumber}`,
    });
  }
  lines.push({
    accountCode: ACCOUNTS.suppliers,
    credit: total,
    description: `فاتورة شراء ${purchase.purchaseNumber}`,
    partyId: purchase.supplierId,
  });

  const entry = await postJournal({
    date: purchase.date,
    description: `فاتورة شراء ${purchase.purchaseNumber}`,
    sourceType: "PURCHASE",
    sourceId: purchase.id,
    companyId: purchase.companyId,
    createdBy,
    lines,
  });

  await db.purchase.update({
    where: { id: purchase.id },
    data: { journalPosted: true, status: purchase.status === "DRAFT" ? "RECEIVED" : purchase.status },
  });

  try {
    await applyStockMovements("PURCHASE", purchase.id, "PURCHASE", createdBy);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
    await db.notification
      .create({
        data: {
          kind: "JOB_FAILED",
          severity: "critical",
          title: "فشل تسجيل حركة مخزون",
          body: `فاتورة الشراء ${purchase.purchaseNumber} رُحّلت إلى قيود اليومية لكن حركتها بالمخزون فشلت: ${msg}. سُوِّيت يدويًا من شاشة المنتجات.`,
          link: "/products",
        },
      })
      .catch(() => {});
    throw new PostingError("رُحّلت فاتورة الشراء إلى قيود اليومية لكن حركة المخزون فشلت — سَوِّ المخزون من شاشة المنتجات");
  }

  return entry;
}

// ===== المخزون: حركات مرتبطة بالترحيل والعكس =====
// البيع يُنقص المخزون، والشراء يزيده، والعكس يعيده. كل حركة تُسجَّل في
// StockMovement (قابلة للتتبع ومُسجَّل تاريخها) ويُحدَّث رصيد المنتج في نفس المعاملة.

type StockKind = "SALE" | "PURCHASE" | "REVERSE_SALE" | "REVERSE_PURCHASE";

const STOCK_DIRECTION: Record<StockKind, { delta: 1 | -1; type: string; note: string }> = {
  SALE: { delta: -1, type: "OUT", note: "مبيعات" },
  PURCHASE: { delta: 1, type: "IN", note: "مشتريات" },
  REVERSE_SALE: { delta: 1, type: "RETURN_IN", note: "عكس مبيعات (إرجاع للمخزون)" },
  REVERSE_PURCHASE: { delta: -1, type: "RETURN_OUT", note: "عكس مشتريات (خصم من المخزون)" },
};

async function applyStockMovements(
  sourceType: "INVOICE" | "PURCHASE",
  sourceId: string,
  kind: StockKind,
  createdBy: string
): Promise<void> {
  const isInvoice = sourceType === "INVOICE";
  const doc = isInvoice
    ? await db.invoice.findUnique({ where: { id: sourceId }, include: { items: true } })
    : await db.purchase.findUnique({ where: { id: sourceId }, include: { items: true } });
  if (!doc) return;

  const items = (doc.items as { productId: string | null; quantity: number; unitPrice: number; costPrice?: number }[]).filter(
    (i) => i.productId && i.quantity !== 0
  );
  if (!items.length) return;

  const { delta, type, note } = STOCK_DIRECTION[kind];
  const docNumber = (doc as { invoiceNumber?: string; purchaseNumber?: string }).invoiceNumber ?? (doc as { purchaseNumber?: string }).purchaseNumber ?? "";

  await db.$transaction(async (tx) => {
    for (const item of items) {
      const qty = round2(delta * item.quantity);
      const cost = kind === "PURCHASE" ? item.unitPrice : (item.costPrice ?? 0);
      await tx.product.update({
        where: { id: item.productId as string },
        data: { quantity: { increment: qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId as string,
          type,
          quantity: qty,
          unitCost: cost,
          companyId: (doc as { companyId?: string | null }).companyId ?? undefined,
          sourceType,
          sourceId,
          notes: `${note} — ${docNumber}`,
          createdBy,
        },
      });
    }
  });
}

// ===== ترحيل سند القبض / الصرف =====

export async function postPayment(paymentId: string, createdBy = "system") {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new PostingError("السند غير موجود");

  // نمنع الترحيل المكرر لنفس السند
  const existing = await db.journalEntry.findFirst({
    where: { sourceType: "PAYMENT", sourceId: payment.id, status: "POSTED" },
  });
  if (existing) throw new PostingError("هذا السند مرحّل بالفعل");

  const safe = payment.safeId
    ? await db.safe.findUnique({ where: { id: payment.safeId } })
    : null;
  const safeCode = safe ? (safe.type === "BANK" ? ACCOUNTS.bank : ACCOUNTS.cash) : ACCOUNTS.cash;
  const amount = round2(payment.amount);

  const lines: PostingLine[] =
    payment.type === "IN"
      ? [
          { accountCode: safeCode, debit: amount, description: `تحصيل — ${payment.number}` },
          {
            accountCode: payment.partyId ? ACCOUNTS.customers : ACCOUNTS.otherReceivables,
            credit: amount,
            description: `سند قبض ${payment.number}`,
            partyId: payment.partyId,
          },
        ]
      : [
          {
            accountCode: payment.partyId ? ACCOUNTS.suppliers : ACCOUNTS.miscExpense,
            debit: amount,
            description: `سند صرف ${payment.number}`,
            partyId: payment.partyId,
          },
          { accountCode: safeCode, credit: amount, description: `صرف — ${payment.number}` },
        ];

  return postJournal({
    date: payment.date,
    description: `${payment.type === "IN" ? "سند قبض" : "سند صرف"} ${payment.number}`,
    sourceType: "PAYMENT",
    sourceId: payment.id,
    companyId: payment.companyId,
    createdBy,
    lines,
  });
}

// ===== عكس قيد =====
// لا نحذف القيود أبدًا في نظام محاسبي: ننشئ قيدًا عكسيًا ونعلّم الأصل كمعكوس.

export async function reverseJournalEntry(entryId: string, createdBy = "system") {
  const entry = await db.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });
  if (!entry) throw new PostingError("القيد غير موجود");
  if (entry.status === "REVERSED") throw new PostingError("هذا القيد معكوس بالفعل");

  // نتأكد أن القيد الأصلي متوازن قبل عكسه
  assertBalanced(
    entry.lines.map((l) => ({ accountCode: "x", debit: l.debit, credit: l.credit }))
  );

  const number = await generateNumber("JOURNAL");
  const reverse = await db.journalEntry.create({
    data: {
      number,
      date: new Date(),
      description: `عكس القيد ${entry.number} — ${entry.description}`,
      sourceType: "REVERSAL",
      sourceId: entry.id,
      companyId: entry.companyId,
      status: "POSTED",
      totalDebit: entry.totalCredit,
      totalCredit: entry.totalDebit,
      postedAt: new Date(),
      createdBy,
      reversedById: entry.id,
      lines: {
        create: entry.lines.map((l, i) => ({
          accountId: l.accountId,
          debit: l.credit,
          credit: l.debit,
          description: `عكس ${l.description ?? entry.description}`,
          sortOrder: i,
        })),
      },
    },
  });

  await db.journalEntry.update({ where: { id: entry.id }, data: { status: "REVERSED" } });

  // نلغي ترحيل المستند المصدر حتى يمكن إعادة ترحيله
  if (entry.sourceType === "INVOICE" && entry.sourceId) {
    await db.invoice
      .update({ where: { id: entry.sourceId }, data: { journalPosted: false } })
      .catch(() => {});
    try {
      await applyStockMovements("INVOICE", entry.sourceId, "REVERSE_SALE", createdBy);
    } catch (e) {
      console.error("فشل إرجاع المخزون عند عكس قيد فاتورة:", e);
    }
  }
  if (entry.sourceType === "PURCHASE" && entry.sourceId) {
    await db.purchase
      .update({ where: { id: entry.sourceId }, data: { journalPosted: false } })
      .catch(() => {});
    try {
      await applyStockMovements("PURCHASE", entry.sourceId, "REVERSE_PURCHASE", createdBy);
    } catch (e) {
      console.error("فشل خصم المخزون عند عكس قيد مشتريات:", e);
    }
  }

  return reverse;
}
