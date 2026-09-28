// ===== حساب المبالغ: كل العمليات المالية تمر من هنا =====
// ملاحظة مهمة: حقول المبالغ في المخطط (Prisma) من نوع Float، لذلك نقرّب
// المبلغ لخانتين عشريتين عند كل عملية ضرب أو جمع لتفادي تراكم كسور الأرقام.
// (التحويل إلى Decimal هو توصية لاحقة — راجع README).

/** تقريب لخانتين عشريتين بأسلوب مالي (HALF_UP) يتجنّب أخطاء الفاصلة العائمة */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundAll(values: number[]): number[] {
  return values.map(round2);
}

export function sumMoney(values: number[]): number {
  return round2(values.reduce((a, b) => a + (Number(b) || 0), 0));
}

/** صافي المبلغ بعد الخصم والضريبة */
export function lineTotal(input: {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}) {
  const qty = Number(input.quantity) || 0;
  const price = Number(input.unitPrice) || 0;
  const discount = Number(input.discount) || 0;
  const taxRate = Number(input.taxRate) || 0;

  const gross = qty * price;
  const net = gross - discount;
  const tax = net * (taxRate / 100);
  return {
    net: round2(net),
    tax: round2(tax),
    total: round2(net + tax),
  };
}

export function totalsOf(
  lines: { quantity: number; unitPrice: number; discount?: number; taxRate?: number }[],
  globalDiscount = 0
) {
  const subtotal = sumMoney(lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)));
  const discount = round2(Number(globalDiscount) || 0);
  const netBeforeTax = round2(subtotal - discount);
  const tax = round2(lines.reduce((acc, l) => acc + lineTotal(l).tax, 0));
  const total = round2(netBeforeTax + tax);
  return { subtotal, discount, net: netBeforeTax, tax, total };
}

const CURRENCY_LOCALE = "ar-EG";

/** تنسيق مبلغ للعرض: ١٢٬٣٤٥٫٦٧ ج.م */
export function formatMoney(value: number | null | undefined, currency = "ج.م"): string {
  const n = round2(Number(value) || 0);
  try {
    return `${new Intl.NumberFormat(CURRENCY_LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      numberingSystem: "latn",
    }).format(n)} ${currency}`;
  } catch {
    return `${n} ${currency}`;
  }
}

/** تنسيق رقمي بلا عملة */
export function formatNumber(value: number | null | undefined, fractionDigits = 2): string {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      numberingSystem: "latn",
    }).format(n);
  } catch {
    return n.toFixed(fractionDigits);
  }
}

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** 2026-03-15 ← 15 مارس 2026 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

/** 2026-03-15 ← 2026-03-15 (للحقول والفرز) */
export function toISODate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthName(month: number | null | undefined): string {
  if (!month || month < 1 || month > 12) return "—";
  return MONTHS_AR[month - 1];
}

/** حساب الفرق بين تاريخين بالأيام (موجب = متأخر عن الاستحقاق) */
export function daysUntil(date: Date | string | null | undefined, from = new Date()): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

/** وصف الاستحقاق: متأخر 5 أيام / مستحق غداً / بعد 12 يوم */
export function dueLabel(date: Date | string | null | undefined): string {
  const d = daysUntil(date);
  if (d === null) return "—";
  if (d < 0) return `متأخر ${Math.abs(d)} يوم`;
  if (d === 0) return "مستحق اليوم";
  if (d === 1) return "مستحق غداً";
  return `بعد ${d} يوم`;
}
