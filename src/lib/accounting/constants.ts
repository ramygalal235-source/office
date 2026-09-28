import seedData from "./seed-data.json";

// ألوان وهوية النظام
export const BRAND = {
  primary: "#0d7a5f",
  primaryHover: "#0a614b",
  name: "دفاتر المحاسب",
  subtitle: "نظام إدارة مكتب المحاسبة والمراجعة",
};

// ===== بيانات التهيئة =====
// مصدر الحقيقة الوحيد لهذه البيانات هو seed-data.json حتى يقرأها
// سكربت التهيئة (scripts/init-db.mjs) نفسه بدون تكرار الكود.

export interface ChartAccountSeed {
  code: string;
  name: string;
  type: string;
  parentCode?: string;
  isGroup: boolean;
}

export interface ExpenseCategorySeed {
  name: string;
  code: string;
}

export interface SequenceSeed {
  type: string;
  prefix: string;
  nextNumber: number;
  padding: number;
}

/** شجرة الحسابات الافتراضية القياسية */
export const DEFAULT_CHART_OF_ACCOUNTS = seedData.chartOfAccounts as ChartAccountSeed[];

export const DEFAULT_EXPENSE_CATEGORIES = seedData.expenseCategories as ExpenseCategorySeed[];

export const DEFAULT_SEQUENCES = seedData.sequences as SequenceSeed[];

/** أنواع الحسابات في دليل الحسابات */
export const ACCOUNT_TYPES = [
  { value: "ASSET", label: "أصول" },
  { value: "LIABILITY", label: "التزامات" },
  { value: "EQUITY", label: "حقوق ملكية" },
  { value: "INCOME", label: "إيرادات" },
  { value: "EXPENSE", label: "مصروفات" },
] as const;

/** طبيعة الحساب التي تُحتسب ضمنها الحركة */
export const ACCOUNT_NATURE: Record<string, "DEBIT" | "CREDIT"> = {
  ASSET: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  INCOME: "CREDIT",
};

/** ربط أنواع المستندات بتسلسلات الأرقام */
export const DOCUMENT_TYPES = {
  INVOICE: "فاتورة بيع",
  PURCHASE: "فاتورة شراء",
  PAYMENT_IN: "سند قبض",
  PAYMENT_OUT: "سند صرف",
  JOURNAL: "قيد يومية",
  TASK: "مهمة مكتبية",
} as const;
