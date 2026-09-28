import { z } from "zod";

// ===== أدوات تحقق مشتركة =====
// النماذج ترسل خانات فارغة أحيانًا، لذلك نحوّلها إلى null بدل رفض الطلب.

/** نص اختياري: "" أو null أو undefined ← null */
export function optText(max = 255) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const t = typeof v === "string" ? v.trim() : "";
      return t ? t.slice(0, max) : null;
    });
}

/** نص إجباري: يتحقق من الطول ويرفض الفراغ */
export function reqText(max = 255, message = "هذا الحقل مطلوب") {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : "").slice(0, max))
    .refine((v) => v.length > 0, { message });
}

/** رقم: يتحمل الأرقام والنصوص، ويرجع 0 عند الفراغ */
export function optNum() {
  return z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || v === "") return 0;
      const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    });
}

/** تاريخ اختياري من حقل <input type="date"> */
export function optDate() {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    });
}

/** تاريخ إجباري، ويرجع تاريخ اليوم عند الفراغ */
export function reqDate() {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (!v) return new Date();
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? new Date() : d;
    });
}

/** رقم صحيح موجب (سنوات، شهور) */
export function optInt(min = 0, max = 9999) {
  return optNum().transform((n) => Math.min(max, Math.max(min, Math.round(n))));
}

/** قيمة من قائمة محددة */
export function optEnum(values: readonly string[], fallback: string) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v && values.includes(v) ? v : fallback));
}

/** استخراج أول رسالة خطأ من نتيجة zod */
export function firstIssue(error: z.ZodError): string {
  return error.issues?.[0]?.message || "بيانات غير صحيحة";
}
