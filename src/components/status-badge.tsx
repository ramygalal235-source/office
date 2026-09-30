import { Badge, type BadgeProps } from "@/components/ui/badge";

// ===== خرائط ترجمة الحالات إلى العربية =====
// تُستخدم في كل شاشات النظام حتى تبقى المصطلحات موحّدة

type Variant = NonNullable<BadgeProps["variant"]>;

const INVOICE_STATUS: Record<string, { label: string; variant: Variant }> = {
  DRAFT: { label: "مسودة", variant: "muted" },
  ISSUED: { label: "صادرة", variant: "info" },
  PAID: { label: "مدفوعة", variant: "success" },
  PARTIAL: { label: "مدفوعة جزئياً", variant: "warning" },
  OVERDUE: { label: "متأخرة", variant: "destructive" },
  CANCELLED: { label: "ملغاة", variant: "muted" },
};

const PURCHASE_STATUS: Record<string, { label: string; variant: Variant }> = {
  DRAFT: { label: "مسودة", variant: "muted" },
  RECEIVED: { label: "مستلمة", variant: "info" },
  PAID: { label: "مدفوعة", variant: "success" },
  PARTIAL: { label: "مدفوعة جزئياً", variant: "warning" },
  CANCELLED: { label: "ملغاة", variant: "muted" },
};

const OBLIGATION_STATUS: Record<string, { label: string; variant: Variant }> = {
  PENDING: { label: "قيد الانتظار", variant: "warning" },
  IN_PROGRESS: { label: "قيد التنفيذ", variant: "info" },
  PAID: { label: "تم السداد", variant: "success" },
  FILED: { label: "تم الإقرار", variant: "success" },
  OVERDUE: { label: "متأخرة", variant: "destructive" },
  WAIVED: { label: "معفاة", variant: "muted" },
};

const TASK_STATUS: Record<string, { label: string; variant: Variant }> = {
  TODO: { label: "لم تبدأ", variant: "muted" },
  IN_PROGRESS: { label: "قيد التنفيذ", variant: "info" },
  REVIEW: { label: "قيد المراجعة", variant: "warning" },
  DONE: { label: "مكتملة", variant: "success" },
  CANCELLED: { label: "ملغاة", variant: "muted" },
};

const PRIORITY: Record<string, { label: string; variant: Variant }> = {
  LOW: { label: "منخفضة", variant: "muted" },
  MEDIUM: { label: "متوسطة", variant: "info" },
  HIGH: { label: "عالية", variant: "warning" },
  URGENT: { label: "عاجلة", variant: "destructive" },
};

const JOURNAL_STATUS: Record<string, { label: string; variant: Variant }> = {
  DRAFT: { label: "مسودة", variant: "muted" },
  POSTED: { label: "مرحّل", variant: "success" },
  REVERSED: { label: "معكوس", variant: "warning" },
};

const ETA_STATUS: Record<string, { label: string; variant: Variant }> = {
  PENDING: { label: "بانتظار الإرسال", variant: "muted" },
  SUBMITTED: { label: "قيد التحقق بالهيئة", variant: "info" },
  ACCEPTED: { label: "مقبولة بالهيئة", variant: "success" },
  REJECTED: { label: "مرفوضة من الهيئة", variant: "destructive" },
  FAILED: { label: "فشل الإرسال", variant: "destructive" },
};

const ENTITY_TYPE: Record<string, string> = {
  COMPANY: "شركة",
  INDIVIDUAL: "منشأة فردية",
  PARTNERSHIP: "شركة توصية",
  LLC: "شركة ذات مسؤولية محدودة",
  SAE: "شركة مساهمة",
  NONPROFIT: "جمعية",
  BRANCH: "فرع",
  SOLE_PROPRIETOR: "منشأة فردية",
};

const LEGAL_FORM: Record<string, string> = {
  INDIVIDUAL: "منشأة فردية",
  SOLIDARITY: "تضامن",
  SIMPLE_PARTNERSHIP: "توصية بسيطة",
  LLC: "ذ.م.م",
  SAE: "ش.م.م",
  NONPROFIT: "جمعية أهلية",
};

function mapFrom(source: Record<string, { label: string; variant: Variant }>) {
  return (key: string | null | undefined, fallback = "—") => {
    const hit = key ? source[key] : undefined;
    return { label: hit?.label ?? fallback, variant: hit?.variant ?? ("muted" as Variant) };
  };
}

export const invoiceStatusLabel = mapFrom(INVOICE_STATUS);
export const purchaseStatusLabel = mapFrom(PURCHASE_STATUS);
export const obligationStatusLabel = mapFrom(OBLIGATION_STATUS);
export const taskStatusLabel = mapFrom(TASK_STATUS);
export const priorityLabel = mapFrom(PRIORITY);
export const journalStatusLabel = mapFrom(JOURNAL_STATUS);
export const etaStatusLabel = mapFrom(ETA_STATUS);

export const entityTypeLabel = (key: string | null | undefined) =>
  (key && ENTITY_TYPE[key]) || "—";
export const legalFormLabel = (key: string | null | undefined) =>
  (key && LEGAL_FORM[key]) || "—";

export function StatusBadge({
  map,
  value,
  className,
}: {
  map: (key: string | null | undefined, fallback?: string) => { label: string; variant: Variant };
  value: string | null | undefined;
  className?: string;
}) {
  const { label, variant } = map(value);
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
