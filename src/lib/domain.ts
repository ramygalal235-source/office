// ===== ثوابت النطاق المشتركة =====
// تستخدمها الواجهة والـ API معًا حتى تبقى القوائم والتسميات متطابقة.

// ---- الالتزامات الضريبية ----
export const OBLIGATION_TYPES = [
  "VAT",
  "INCOME_TAX",
  "WITHHOLDING",
  "PRELIMINARY",
  "ANNUAL_RETURN",
  "SOCIAL_INSURANCE",
  "COMMERCIAL_REG",
  "ESTATE",
  "OTHER",
] as const;

export const OBLIGATION_TYPE_LABELS: Record<string, string> = {
  VAT: "ضريبة القيمة المضافة",
  INCOME_TAX: "ضريبة الدخل",
  WITHHOLDING: "الخصم والتحصيل",
  PRELIMINARY: "الإقرار الضريبي المبدئي",
  ANNUAL_RETURN: "الإقرار الضريبي السنوي",
  SOCIAL_INSURANCE: "التأمينات الاجتماعية",
  COMMERCIAL_REG: "السجل التجاري",
  ESTATE: "الشهر العقاري",
  OTHER: "أخرى",
};

export const OBLIGATION_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "PAID",
  "FILED",
  "OVERDUE",
  "WAIVED",
] as const;

// ---- المهام ----
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "CANCELLED"] as const;

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const TASK_CATEGORIES = [
  "GENERAL",
  "TAX",
  "ACCOUNTING",
  "AUDIT",
  "VAT",
  "FILING",
  "CLIENT_MEETING",
  "OTHER",
] as const;

export const TASK_CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "عام",
  TAX: "ضرائب",
  ACCOUNTING: "محاسبة",
  AUDIT: "مراجعة",
  VAT: "قيمة مضافة",
  FILING: "إقرارات",
  CLIENT_MEETING: "لقاء عميل",
  OTHER: "أخرى",
};

// ---- أطراف الحساب ----
export const PARTY_TYPES = [
  { value: "CUSTOMER", label: "عميل" },
  { value: "SUPPLIER", label: "مورد" },
] as const;

export const PAYMENT_TYPES = [
  { value: "IN", label: "سند قبض (تحصيل)" },
  { value: "OUT", label: "سند صرف (دفع)" },
] as const;

export const PAYMENT_METHODS = [
  { value: "CASH", label: "نقدًا" },
  { value: "BANK", label: "تحويل بنكي" },
  { value: "CHEQUE", label: "شيك" },
  { value: "TRANSFER", label: "حوالة" },
] as const;

// ---- المستندات ----
export const INVOICE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIAL",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;

export const PURCHASE_STATUSES = [
  "DRAFT",
  "RECEIVED",
  "PARTIAL",
  "PAID",
  "CANCELLED",
] as const;

export const JOURNAL_STATUSES = ["DRAFT", "POSTED", "REVERSED"] as const;

export const SAFE_TYPES = [
  { value: "CASH", label: "خزينة نقدية" },
  { value: "BANK", label: "حساب بنكي" },
] as const;

export const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;
